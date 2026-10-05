-- v3 step 7, A1 (docs/SPEC_V3.md §19.1): two-table Tabu turns open in a ready state, and only the
-- cards a table actually saw count as used.
--
-- Ready state. A turn opens without a clock: game_state has turnPhase 'ready', readyEndsAt (now +
-- 15 s) and, from the second turn on, lastTurn (the previous turn's score and its Doğru, Tabu and
-- Pas counts). tabu/begin-turn starts the clock: the describing table at any time, either table
-- once readyEndsAt has passed (the server checks the time, as with end-turn). Idempotent: a turn
-- already running, a ready turn before readyEndsAt for the other table, or no game return the room
-- unchanged. While a turn is ready no card leaves the server (tabu/turn-cards and tabu/mark answer
-- turn_not_started). Both modes alike.
--
-- Cards. Before, a turn's 40 dealt cards all went into room_used_cards, though a turn plays 10-15:
-- a game used 240 of the 547 cards. Now a turn's list is drawn from the cards not yet used, and a
-- card counts as used only when it is shown: the first card when the turn begins, the next one
-- with every mark. The rest of the list stays free for later turns and games.
--
-- "Oyunu bitir" during a two-table Tabu game keeps where the game stopped in lastGame (abandoned,
-- turnNo, totalTurns), so both phones can send game_abandoned (docs/SPEC_V3.md §19.1).
--
-- Lock order (rule 10): rooms → tabu_turns → room_used_cards, as before.

alter table public.tabu_turns alter column ends_at drop not null;
alter table public.tabu_turns add column ready_ends_at timestamptz;

comment on column public.tabu_turns.ends_at is
  'Null while the turn is ready; set by tabu/begin-turn (docs/SPEC_V3.md §19.1).';

-- pure/tabu.ts → TABU.readySeconds; an integration test checks they agree.
create function private.tabu_ready_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 15;
$$;

revoke all on function private.tabu_ready_seconds() from public, anon, authenticated;

-- A card shown to a table: used in this room until the deck runs out.
create function private.use_card(target_room_id uuid, target_card_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.room_used_cards (room_id, card_id)
  select target_room_id, target_card_id
  where target_card_id is not null
  on conflict do nothing;
$$;

revoke all on function private.use_card(uuid, uuid) from public, anon, authenticated;

-- A turn's list: random cards the room has not used. When fewer are left than the list needs, the
-- room's Tabu cards start over (as pick_card did) and the list is filled from the rest. Nothing is
-- marked used here.
create or replace function private.deal_turn(target_room_id uuid, count integer)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids
  from (
    select c.id from public.cards c
    where c.deck = 'tabu' and c.is_active
      and not exists (
        select 1 from public.room_used_cards u where u.room_id = target_room_id and u.card_id = c.id
      )
    order by random()
    limit count
  ) fresh;

  if coalesce(array_length(ids, 1), 0) < count then
    delete from public.room_used_cards u
    using public.cards c
    where u.room_id = target_room_id and u.card_id = c.id and c.deck = 'tabu';

    select ids || coalesce(array_agg(id), '{}') into ids
    from (
      select c.id from public.cards c
      where c.deck = 'tabu' and c.is_active and c.id <> all (ids)
      order by random()
      limit count - coalesce(array_length(ids, 1), 0)
    ) rest;
  end if;

  if coalesce(array_length(ids, 1), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'no_cards';
  end if;
  return ids;
end;
$$;

-- Opens a turn in the ready state: the list, no clock.
create or replace function private.open_turn(r public.rooms, turn_number integer, game_number integer)
returns public.tabu_turns
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
  describer uuid;
  turn public.tabu_turns;
begin
  ids := private.deal_turn(r.id, (r.game_state ->> 'cardsPerTurn')::integer);
  describer := case when turn_number % 2 = 1 then r.owner_session_id else r.guest_session_id end;
  insert into public.tabu_turns
    (room_id, game_no, turn_no, describer_session_id, card_id, card_ids, card_index, ends_at,
     ready_ends_at)
  values (r.id, game_number, turn_number, describer, ids[1], ids, 0, null,
          now() + make_interval(secs => private.tabu_ready_seconds()))
  returning * into turn;
  return turn;
end;
$$;

-- The game starts with turn 1 ready.
create or replace function private.start_voice_tabu(
  r public.rooms,
  turn_seconds integer,
  total_turns integer,
  max_passes integer,
  cards_per_turn integer
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_game integer;
  game_mode text;
  turn public.tabu_turns;
begin
  next_game := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
  game_mode := private.tabu_mode(r.owner_headcount, r.guest_headcount);
  r.game_state := jsonb_build_object(
    'concept', 'tabu', 'mode', game_mode, 'phase', 'playing', 'gameNo', next_game,
    'turnNo', 1, 'totalTurns', total_turns, 'turnSeconds', turn_seconds,
    'cardsPerTurn', cards_per_turn, 'describingTable', 'owner',
    'scores', case when game_mode = 'cooperative' then jsonb_build_object('team', 0)
                   else jsonb_build_object('owner', 0, 'guest', 0) end,
    'passesUsed', 0, 'maxPasses', max_passes, 'cardIndex', 0
  );
  turn := private.open_turn(r, 1, next_game);

  update public.rooms
  set concept = 'tabu', last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object(
        'turnPhase', 'ready', 'readyEndsAt', turn.ready_ends_at
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- tabu/begin-turn: the describing table starts the clock; after readyEndsAt either table may.
-- Anything else returns the room unchanged, so a second call (or a call from both phones when the
-- ready time runs out) starts the turn once.
create function public.tabu_begin_turn(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  t public.tabu_turns;
  ends timestamptz;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.concept is distinct from 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
    return r;
  end if;
  select * into t from public.tabu_turns
  where room_id = r.id
    and game_no = (r.game_state ->> 'gameNo')::integer
    and turn_no = (r.game_state ->> 'turnNo')::integer
  for update;
  if t.id is null or t.ends_at is not null then
    return r;
  end if;
  if t.describer_session_id is distinct from m.session_id and now() < t.ready_ends_at then
    return r;
  end if;

  ends := now() + make_interval(secs => (r.game_state ->> 'turnSeconds')::integer);
  update public.tabu_turns set started_at = now(), ends_at = ends where id = t.id;
  perform private.use_card(r.id, t.card_ids[t.card_index + 1]);
  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, t.id, t.describer_session_id, 'turn_started',
          jsonb_build_object('turnNo', t.turn_no));

  update public.rooms
  set last_activity_at = now(),
      game_state = (game_state - 'readyEndsAt') || jsonb_build_object(
        'turnPhase', 'running', 'turnEndsAt', ends
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function public.tabu_begin_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tabu_begin_turn(uuid, uuid) to service_role;

-- tabu/turn-cards: as before, only once the turn runs.
create or replace function public.tabu_turn_cards(target_user_id uuid, target_room_id uuid)
returns table (turn_no integer, card_index integer, word text, forbidden text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  if (p.room).game_state ->> 'mode' = 'cooperative'
     and (p.turn).describer_session_id is distinct from p.session_id then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  if (p.turn).ends_at is null then
    raise exception using errcode = 'P0001', message = 'turn_not_started';
  end if;
  return query
    select (p.turn).turn_no, (ord - 1)::integer, c.word, c.forbidden
    from unnest((p.turn).card_ids) with ordinality as list(card_id, ord)
    join public.cards c on c.id = list.card_id
    order by ord;
end;
$$;

-- tabu/mark: as in 20261011090000_tabu_modes.sql, refused while the turn is ready, and the card
-- that comes up next is the one marked used.
create or replace function public.tabu_mark(
  target_user_id uuid,
  target_room_id uuid,
  turn_number integer,
  index integer,
  result text
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
  t public.tabu_turns;
  describing boolean;
  cooperative boolean;
  side text;
  delta integer;
  closed_word text;
  new_scores jsonb;
begin
  if result not in ('correct', 'taboo', 'pass') then
    raise exception using errcode = 'P0001', message = 'bad_request';
  end if;
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  r := p.room;
  t := p.turn;
  describing := t.describer_session_id = p.session_id;
  cooperative := r.game_state ->> 'mode' = 'cooperative';

  if cooperative and not describing then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  if not cooperative and result = 'taboo' and describing then
    raise exception using errcode = 'P0001', message = 'not_judge';
  end if;
  if not cooperative and result = 'pass' and not describing then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  if t.ends_at is null then
    raise exception using errcode = 'P0001', message = 'turn_not_started';
  end if;
  if t.turn_no <> turn_number or t.card_index <> index
     or index >= coalesce(array_length(t.card_ids, 1), 0) then
    return r;
  end if;
  if now() >= t.ends_at then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if result = 'pass' and t.passes_used >= (r.game_state ->> 'maxPasses')::integer then
    raise exception using errcode = 'P0001', message = 'no_passes_left';
  end if;

  delta := case result when 'correct' then 1 when 'taboo' then -1 else 0 end;
  if cooperative then
    new_scores := jsonb_build_object(
      'team', (r.game_state -> 'scores' ->> 'team')::integer + delta
    );
  else
    side := r.game_state ->> 'describingTable';
    new_scores := jsonb_set(r.game_state -> 'scores', array[side],
                            to_jsonb((r.game_state -> 'scores' ->> side)::integer + delta));
  end if;
  -- The closed card's word goes to the room (game_events) only now, after the action.
  select word into closed_word from public.cards where id = t.card_ids[index + 1];

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, t.id, p.session_id, result, jsonb_build_object('cardIndex', index)),
         (r.id, t.id, null, 'card_closed',
          jsonb_build_object('cardIndex', index, 'word', closed_word, 'result', result));
  update public.tabu_turns
  set score = score + delta,
      passes_used = passes_used + case when result = 'pass' then 1 else 0 end,
      card_index = index + 1,
      card_id = coalesce(card_ids[index + 2], card_id)
  where id = t.id;
  perform private.use_card(r.id, t.card_ids[index + 2]);

  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'scores', new_scores,
        'passesUsed', t.passes_used + case when result = 'pass' then 1 else 0 end,
        'cardIndex', index + 1
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- tabu/end-turn: as in 20261011090000_tabu_modes.sql; a ready turn has not ended. The next turn
-- opens ready, with the turn just played as lastTurn.
create or replace function public.tabu_end_turn(
  target_user_id uuid,
  target_room_id uuid
)
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
  next_turn public.tabu_turns;
  owner_score integer;
  guest_score integer;
  team_score integer;
  summary jsonb;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.concept is distinct from 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
    return r;
  end if;
  select * into t from public.tabu_turns
  where room_id = r.id
    and game_no = (r.game_state ->> 'gameNo')::integer
    and turn_no = (r.game_state ->> 'turnNo')::integer
  for update;
  if t.ends_at is null or now() < t.ends_at then
    return r;
  end if;

  if t.turn_no >= (r.game_state ->> 'totalTurns')::integer then
    if r.game_state ->> 'mode' = 'cooperative' then
      team_score := (r.game_state -> 'scores' ->> 'team')::integer;
      insert into public.game_results (user_id, room_id, concept, mode, score, won)
      select ts.user_id, r.id, 'tabu', 'cooperative', team_score, null
      from public.table_sessions ts
      where ts.id in (r.owner_session_id, r.guest_session_id);
    else
      owner_score := (r.game_state -> 'scores' ->> 'owner')::integer;
      guest_score := (r.game_state -> 'scores' ->> 'guest')::integer;
      insert into public.game_results (user_id, room_id, concept, mode, score, won)
      select ts.user_id, r.id, 'tabu', 'voice',
             case when ts.id = r.owner_session_id then owner_score else guest_score end,
             case when ts.id = r.owner_session_id then owner_score > guest_score
                  else guest_score > owner_score end
      from public.table_sessions ts
      where ts.id in (r.owner_session_id, r.guest_session_id);
    end if;
    insert into public.game_events (room_id, type, payload)
    values (r.id, 'game_completed', jsonb_build_object('scores', r.game_state -> 'scores'));

    update public.rooms
    set concept = null, last_activity_at = now(),
        game_state = private.between_games(
          game_state,
          jsonb_build_object('concept', 'tabu', 'scores', game_state -> 'scores')
        )
    where id = r.id
    returning * into r;
    return r;
  end if;

  -- The turn just played, from its own marks: pure/tabu.ts → summarizeTurn.
  select jsonb_build_object(
           'turnNo', t.turn_no,
           'describingTable', r.game_state ->> 'describingTable',
           'score', t.score,
           'correct', count(*) filter (where e.type = 'correct'),
           'taboo', count(*) filter (where e.type = 'taboo'),
           'pass', count(*) filter (where e.type = 'pass')
         )
  into summary
  from public.game_events e
  where e.turn_id = t.id;

  next_no := t.turn_no + 1;
  next_turn := private.open_turn(r, next_no, t.game_no);
  update public.rooms
  set last_activity_at = now(),
      game_state = (game_state - 'turnEndsAt') || jsonb_build_object(
        'turnNo', next_no, 'passesUsed', 0, 'cardIndex', 0,
        'describingTable', case when next_no % 2 = 1 then 'owner' else 'guest' end,
        'turnPhase', 'ready', 'readyEndsAt', next_turn.ready_ends_at, 'lastTurn', summary
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- rooms/end-game ("Oyunu bitir"): as in 20261010090000_room_flow.sql. A two-table Tabu game stopped
-- before its last turn ended keeps where it stopped, for game_abandoned (no result is written).
create or replace function public.rooms_end_game(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  last_game jsonb;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept is null then
    return r;
  end if;
  last_game := jsonb_build_object('concept', r.concept);
  if r.concept = 'tabu' and r.game_state ->> 'phase' = 'playing' then
    last_game := last_game || jsonb_build_object(
      'abandoned', true,
      'turnNo', (r.game_state ->> 'turnNo')::integer,
      'totalTurns', (r.game_state ->> 'totalTurns')::integer
    );
  end if;
  update public.rooms
  set concept = null, last_activity_at = now(),
      game_state = private.between_games(game_state, last_game)
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- A game running at deploy time keeps its clock: its turn counts as running.
update public.rooms
set game_state = game_state || jsonb_build_object('turnPhase', 'running')
where concept = 'tabu' and game_state ->> 'phase' = 'playing' and game_state ? 'turnEndsAt';
