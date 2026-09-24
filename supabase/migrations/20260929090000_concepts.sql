-- M5: cards, Tabu (one table: deck only; two tables: server-authoritative) and Sohbet cards.

-- cards ---------------------------------------------------------------------------
-- Seeded from content/*-cards.json; retired cards are deactivated, never deleted.
create table public.cards (
  id uuid primary key default gen_random_uuid(),
  deck text not null check (deck in ('tabu', 'sohbet')),
  source_key text not null,
  word text,
  forbidden text[],
  theme text,
  prompt text,
  is_active boolean not null default true,
  unique (deck, source_key),
  check (
    (deck = 'tabu' and word is not null and cardinality(forbidden) = 5 and prompt is null)
    or (deck = 'sohbet' and prompt is not null and theme is not null and word is null)
  )
);

alter table public.cards enable row level security;
revoke all on table public.cards from anon, authenticated;
grant select on table public.cards to authenticated;

-- The Tabu deck stays closed to clients (MVP_SPEC §9): one-table games get it from tabu/start.
create policy "cards: sohbet deck is readable"
  on public.cards for select
  to authenticated
  using (deck = 'sohbet');

-- Room game state ---------------------------------------------------------------------
-- Public state only: never a Tabu card (MVP_SPEC §5.2).
alter table public.rooms add column game_state jsonb not null default '{}'::jsonb;

-- Server-only Tabu bookkeeping ----------------------------------------------------------
-- Clients read the public turn state from rooms.game_state; the current card stays here.
create table public.tabu_turns (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_no integer not null,
  turn_no integer not null,
  describer_session_id uuid not null references public.table_sessions (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  passes_used integer not null default 0,
  score integer not null default 0,
  unique (room_id, game_no, turn_no)
);

alter table public.tabu_turns enable row level security;
revoke all on table public.tabu_turns from anon, authenticated;

create table public.room_used_cards (
  room_id uuid not null references public.rooms (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  primary key (room_id, card_id)
);

alter table public.room_used_cards enable row level security;
revoke all on table public.room_used_cards from anon, authenticated;

-- game_events --------------------------------------------------------------------------
-- The clue/guess stream. A card's word appears only in its card_closed event.
create table public.game_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  turn_id uuid references public.tabu_turns (id) on delete cascade,
  session_id uuid references public.table_sessions (id) on delete cascade,
  type text not null check (
    type in ('clue', 'guess', 'correct', 'pass', 'card_closed', 'turn_started', 'game_completed')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);

create index game_events_room_idx on public.game_events (room_id, created_at);

alter table public.game_events enable row level security;
revoke all on table public.game_events from anon, authenticated;
grant select on table public.game_events to authenticated;

create policy "game_events: room members read (guests since joining)"
  on public.game_events for select
  to authenticated
  using (private.can_read_room_message(room_id, created_at));

alter publication supabase_realtime add table public.game_events;

-- A guest leaving resets the room's game (MVP_SPEC §4.5: the room goes back to waiting).
create or replace function private.release_rooms_of_session(target_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_count integer;
  released_count integer;
begin
  update public.rooms
  set status = 'closed', closed_at = now()
  where owner_session_id = target_session_id and status <> 'closed';
  get diagnostics closed_count = row_count;

  update public.rooms
  set guest_session_id = null, guest_alias = null, guest_headcount = null,
      status = 'waiting', waiting_since = now(), last_activity_at = now(),
      game_state = case when concept = 'tabu' then '{}'::jsonb else game_state end
  where guest_session_id = target_session_id and status <> 'closed';
  get diagnostics released_count = row_count;

  return closed_count + released_count;
end;
$$;

-- Helpers --------------------------------------------------------------------------------
-- A random active card of the deck not yet used in the room; starts over when all are used.
create function private.pick_card(target_room_id uuid, target_deck text)
returns public.cards
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked public.cards;
begin
  select c.* into picked
  from public.cards c
  where c.deck = target_deck and c.is_active
    and not exists (
      select 1 from public.room_used_cards u where u.room_id = target_room_id and u.card_id = c.id
    )
  order by random()
  limit 1;

  if picked.id is null then
    delete from public.room_used_cards u
    using public.cards c
    where u.room_id = target_room_id and u.card_id = c.id and c.deck = target_deck;

    select c.* into picked
    from public.cards c
    where c.deck = target_deck and c.is_active
    order by random()
    limit 1;
  end if;

  if picked.id is null then
    raise exception using errcode = 'P0001', message = 'no_cards';
  end if;

  insert into public.room_used_cards (room_id, card_id) values (target_room_id, picked.id)
  on conflict do nothing;
  return picked;
end;
$$;

-- Locks a two-table Tabu room with a game in play and returns it; raises otherwise.
create function private.tabu_playing_room(target_user_id uuid, target_room_id uuid)
returns table (room public.rooms, session_id uuid, turn public.tabu_turns)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  t public.tabu_turns;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept <> 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
    raise exception using errcode = 'P0001', message = 'no_game';
  end if;
  select * into t from public.tabu_turns
  where room_id = r.id
    and game_no = (r.game_state ->> 'gameNo')::integer
    and turn_no = (r.game_state ->> 'turnNo')::integer
  for update;
  return query select r, m.session_id, t;
end;
$$;

-- Closes the current card (its word becomes public) and deals the next one in the same turn.
create function private.tabu_close_card(r public.rooms, t public.tabu_turns, result text, deal_next boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_card public.cards;
  next_card public.cards;
begin
  select * into closed_card from public.cards where id = t.card_id;
  insert into public.game_events (room_id, turn_id, type, payload)
  values (r.id, t.id, 'card_closed', jsonb_build_object('word', closed_card.word, 'result', result));

  if deal_next then
    next_card := private.pick_card(r.id, 'tabu');
    update public.tabu_turns set card_id = next_card.id where id = t.id;
  end if;
end;
$$;

revoke all on function private.pick_card(uuid, text) from public, anon, authenticated;
revoke all on function private.tabu_playing_room(uuid, uuid) from public, anon, authenticated;
revoke all on function private.tabu_close_card(public.rooms, public.tabu_turns, text, boolean) from public, anon, authenticated;

-- Tabu, one table: the deck ----------------------------------------------------------------
-- The whole game runs on the phone (MVP_SPEC §5.1); only a room member of a one-table Tabu room
-- gets cards.
create function public.tabu_local_deck(target_user_id uuid, target_room_id uuid, deck_size integer)
returns table (word text, forbidden text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept <> 'tabu' then
    raise exception using errcode = 'P0001', message = 'wrong_concept';
  end if;
  if r.guest_session_id is not null then
    raise exception using errcode = 'P0001', message = 'two_tables';
  end if;
  update public.rooms set last_activity_at = now() where id = r.id;
  return query
    select c.word, c.forbidden from public.cards c
    where c.deck = 'tabu' and c.is_active
    order by random()
    limit deck_size;
end;
$$;

-- Tabu, two tables (server-authoritative, MVP_SPEC §5.2) -----------------------------------------
create function public.tabu_start(
  target_user_id uuid,
  target_room_id uuid,
  turn_seconds integer,
  total_turns integer,
  max_passes integer
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  game_no integer;
  first_card public.cards;
  turn public.tabu_turns;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept <> 'tabu' then
    raise exception using errcode = 'P0001', message = 'wrong_concept';
  end if;
  if not m.is_owner then
    raise exception using errcode = 'P0001', message = 'not_owner';
  end if;
  if r.guest_session_id is null or r.status <> 'active' then
    raise exception using errcode = 'P0001', message = 'needs_two_tables';
  end if;
  if r.game_state ->> 'phase' = 'playing' then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;

  game_no := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
  first_card := private.pick_card(r.id, 'tabu');
  insert into public.tabu_turns (room_id, game_no, turn_no, describer_session_id, card_id, ends_at)
  values (r.id, game_no, 1, r.owner_session_id, first_card.id, now() + make_interval(secs => turn_seconds))
  returning * into turn;

  update public.rooms
  set last_activity_at = now(),
      game_state = jsonb_build_object(
        'concept', 'tabu', 'phase', 'playing', 'gameNo', game_no,
        'turnNo', 1, 'totalTurns', total_turns, 'turnSeconds', turn_seconds,
        'describerSessionId', r.owner_session_id, 'turnEndsAt', turn.ends_at,
        'passesUsed', 0, 'maxPasses', max_passes, 'score', 0
      )
  where id = r.id
  returning * into r;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, turn.id, r.owner_session_id, 'turn_started', jsonb_build_object('turnNo', 1));
  return r;
end;
$$;

-- The card, for the describer only (MVP_SPEC §5.2: "Kart kelimesi yalnızca anlatan masaya gider").
create function public.tabu_current_card(target_user_id uuid, target_room_id uuid)
returns table (card_id uuid, word text, forbidden text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  if (p.turn).describer_session_id <> p.session_id then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  return query select c.id, c.word, c.forbidden from public.cards c where c.id = (p.turn).card_id;
end;
$$;

-- The Edge Function has checked the clue against the card (card_id) with trText and profanity.
create function public.tabu_add_clue(
  target_user_id uuid,
  target_room_id uuid,
  checked_card_id uuid,
  clue text
)
returns public.game_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  created public.game_events;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  if (p.turn).describer_session_id <> p.session_id then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  if now() >= (p.turn).ends_at then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if (p.turn).card_id <> checked_card_id then
    raise exception using errcode = 'P0001', message = 'card_changed';
  end if;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (target_room_id, (p.turn).id, p.session_id, 'clue', jsonb_build_object('text', clue))
  returning * into created;
  update public.rooms set last_activity_at = now() where id = target_room_id;
  return created;
end;
$$;

-- The Edge Function has compared the guess with the card (card_id) using isCorrectGuess.
create function public.tabu_guess(
  target_user_id uuid,
  target_room_id uuid,
  checked_card_id uuid,
  guess text,
  correct boolean
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  r := p.room;
  if (p.turn).describer_session_id = p.session_id then
    raise exception using errcode = 'P0001', message = 'not_guesser';
  end if;
  if now() >= (p.turn).ends_at then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if (p.turn).card_id <> checked_card_id then
    raise exception using errcode = 'P0001', message = 'card_changed';
  end if;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, (p.turn).id, p.session_id, case when correct then 'correct' else 'guess' end,
          jsonb_build_object('text', guess));

  if correct then
    perform private.tabu_close_card(r, p.turn, 'correct', true);
    update public.tabu_turns set score = score + 1 where id = (p.turn).id;
    update public.rooms
    set game_state = jsonb_set(game_state, '{score}', to_jsonb((game_state ->> 'score')::integer + 1))
    where id = r.id;
  end if;

  update public.rooms set last_activity_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

create function public.tabu_pass(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  r := p.room;
  if (p.turn).describer_session_id <> p.session_id then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  if now() >= (p.turn).ends_at then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if (p.turn).passes_used >= (r.game_state ->> 'maxPasses')::integer then
    raise exception using errcode = 'P0001', message = 'no_passes_left';
  end if;

  insert into public.game_events (room_id, turn_id, session_id, type)
  values (r.id, (p.turn).id, p.session_id, 'pass');
  perform private.tabu_close_card(r, p.turn, 'pass', true);
  update public.tabu_turns set passes_used = passes_used + 1 where id = (p.turn).id;

  update public.rooms
  set last_activity_at = now(),
      game_state = jsonb_set(game_state, '{passesUsed}', to_jsonb((p.turn).passes_used + 1))
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- Called by any member when the countdown ends. Idempotent: before ends_at, or once the turn has
-- moved on, it changes nothing.
create function public.tabu_end_turn(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  t public.tabu_turns;
  next_no integer;
  next_describer uuid;
  next_card public.cards;
  next_turn public.tabu_turns;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept <> 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
    return r;
  end if;
  select * into t from public.tabu_turns
  where room_id = r.id
    and game_no = (r.game_state ->> 'gameNo')::integer
    and turn_no = (r.game_state ->> 'turnNo')::integer
  for update;
  if now() < t.ends_at then
    return r;
  end if;

  perform private.tabu_close_card(r, t, 'timeout', false);

  if t.turn_no >= (r.game_state ->> 'totalTurns')::integer then
    update public.rooms
    set last_activity_at = now(), game_state = game_state || jsonb_build_object('phase', 'finished')
    where id = r.id
    returning * into r;
    insert into public.game_events (room_id, type, payload)
    values (r.id, 'game_completed', jsonb_build_object('score', (r.game_state ->> 'score')::integer));
    return r;
  end if;

  -- Tables take turns describing: odd turns the owner (Masa A), even turns the guest (Masa B).
  next_no := t.turn_no + 1;
  next_describer := case when next_no % 2 = 1 then r.owner_session_id else r.guest_session_id end;
  next_card := private.pick_card(r.id, 'tabu');
  insert into public.tabu_turns (room_id, game_no, turn_no, describer_session_id, card_id, ends_at)
  values (r.id, t.game_no, next_no, next_describer, next_card.id,
          now() + make_interval(secs => (r.game_state ->> 'turnSeconds')::integer))
  returning * into next_turn;

  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnNo', next_no, 'describerSessionId', next_describer,
        'turnEndsAt', next_turn.ends_at, 'passesUsed', 0
      )
  where id = r.id
  returning * into r;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, next_turn.id, next_describer, 'turn_started', jsonb_build_object('turnNo', next_no));
  return r;
end;
$$;

-- Sohbet (MVP_SPEC §5.3) ---------------------------------------------------------------------
create function public.sohbet_next(target_user_id uuid, target_room_id uuid, cooldown_ms integer)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  card public.cards;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept <> 'sohbet' then
    raise exception using errcode = 'P0001', message = 'wrong_concept';
  end if;
  if (r.game_state ->> 'nextAllowedAt')::timestamptz > now() then
    raise exception using errcode = 'P0001', message = 'too_soon';
  end if;

  card := private.pick_card(r.id, 'sohbet');
  update public.rooms
  set last_activity_at = now(),
      game_state = jsonb_build_object(
        'concept', 'sohbet', 'cardId', card.id, 'theme', card.theme, 'prompt', card.prompt,
        'nextAllowedAt', now() + make_interval(secs => cooldown_ms / 1000.0)
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function public.tabu_local_deck(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.tabu_start(uuid, uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.tabu_current_card(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tabu_add_clue(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.tabu_guess(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.tabu_pass(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tabu_end_turn(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sohbet_next(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.tabu_local_deck(uuid, uuid, integer) to service_role;
grant execute on function public.tabu_start(uuid, uuid, integer, integer, integer) to service_role;
grant execute on function public.tabu_current_card(uuid, uuid) to service_role;
grant execute on function public.tabu_add_clue(uuid, uuid, uuid, text) to service_role;
grant execute on function public.tabu_guess(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.tabu_pass(uuid, uuid) to service_role;
grant execute on function public.tabu_end_turn(uuid, uuid) to service_role;
grant execute on function public.sohbet_next(uuid, uuid, integer) to service_role;
