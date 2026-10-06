-- v3 step 7.1 (docs/SPEC_V3.md §20.2): Sahtekar. Every player sees the same secret word except one
-- seat, the impostor, who sees only the category. Two rounds of one spoken word, a secret vote,
-- and when the impostor is caught, a guess among 6 words of the category. No score.
--
-- Seats are labels inside one game: A1…An for the owner's table, B1…Bm for the guest's (rule 4).
-- The player counts come with the proposal and the acceptance (§20.1): proposer_players on the
-- proposal, the acceptor's in rooms/answer-game; each defaults to the table's check-in headcount.
--
-- Secrets (the impostor's seat, the word, the votes, the 6 options) live in game_secrets: RLS on,
-- no policy, service role only. They leave the server only as the answer to the asking table
-- (sahtekar/view for its own seats, sahtekar/options for the impostor's table) and, at the end,
-- in lastGame.reveal. rooms.game_state, game_events and Realtime carry none of them before that.
--
-- pure/sahtekar.ts is the rule; private.sahtekar_config(), sahtekar_seats, sahtekar_clue_order and
-- sahtekar_tally apply it here and integration tests check that they agree.
--
-- Lock order (rule 10): rooms → game_proposals → game_secrets → room_used_cards, game_events.

-- Constraints: the new game everywhere a game is named --------------------------------------------
alter table public.rooms drop constraint rooms_concept_check;
alter table public.rooms
  add constraint rooms_concept_check check (concept in ('tabu', 'sohbet', 'sahtekar'));
alter table public.game_proposals drop constraint game_proposals_concept_check;
alter table public.game_proposals
  add constraint game_proposals_concept_check check (concept in ('tabu', 'sohbet', 'sahtekar'));
alter table public.game_results drop constraint game_results_concept_check;
alter table public.game_results
  add constraint game_results_concept_check check (concept in ('tabu', 'sohbet', 'sahtekar'));
alter table public.game_results drop constraint game_results_mode_check;
alter table public.game_results
  add constraint game_results_mode_check
  check (mode in ('voice', 'text', 'cooperative', 'sahtekar'));
alter table public.play_history drop constraint play_history_concept_check;
alter table public.play_history
  add constraint play_history_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'chat'));

-- The deck: one row per word; theme is the category key, prompt its name. Not readable by the app
-- (the cards policy covers the Sohbet deck only).
alter table public.cards drop constraint cards_deck_check;
alter table public.cards
  add constraint cards_deck_check check (deck in ('tabu', 'sohbet', 'sahtekar'));
alter table public.cards drop constraint cards_check;
alter table public.cards
  add constraint cards_check check (
    (deck = 'tabu' and word is not null and cardinality(forbidden) = 5 and prompt is null)
    or (deck = 'sohbet' and prompt is not null and theme is not null and word is null)
    or (deck = 'sahtekar' and word is not null and theme is not null and prompt is not null
        and forbidden is null)
  );

create index cards_sahtekar_theme_idx on public.cards (theme) where deck = 'sahtekar';

-- The proposer's player count (Sahtekar only).
alter table public.game_proposals
  add column proposer_players smallint check (proposer_players between 1 and 4);

-- game_secrets -------------------------------------------------------------------------------------
create table public.game_secrets (
  room_id uuid not null references public.rooms (id) on delete cascade,
  game_no integer not null,
  concept text not null check (concept in ('sahtekar')),
  secret jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, game_no)
);

alter table public.game_secrets enable row level security;
revoke all on table public.game_secrets from anon, authenticated;

-- Rules -------------------------------------------------------------------------------------------
-- pure/sahtekar.ts → SAHTEKAR.
create function private.sahtekar_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'viewSeconds', 120, 'clueSeconds', 15, 'clueRounds', 2, 'voteSeconds', 90,
    'guessSeconds', 30, 'options', 6, 'minPlayers', 3, 'maxPerTable', 4
  );
$$;

create function private.sahtekar_seconds(name text)
returns interval
language sql
immutable
set search_path = ''
as $$
  select make_interval(secs => (private.sahtekar_config() ->> name)::integer);
$$;

-- pure/sahtekar.ts → seatsOf.
create function private.sahtekar_seats(owner_players integer, guest_players integer)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array(select 'A' || i from generate_series(1, owner_players) i)
      || array(select 'B' || i from generate_series(1, guest_players) i);
$$;

-- pure/sahtekar.ts → clueOrder: A1, B1, A2, B2…, the longer table's extra seats last; two rounds.
create function private.sahtekar_clue_order(seats text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  with a as (
    select s, row_number() over (order by ord) as n
    from unnest(seats) with ordinality as x(s, ord) where s like 'A%'
  ), b as (
    select s, row_number() over (order by ord) as n
    from unnest(seats) with ordinality as x(s, ord) where s like 'B%'
  ), one_round as (
    select coalesce(array_agg(s order by n, side), '{}') as r from (
      select s, n, 0 as side from a union all select s, n, 1 from b
    ) both_tables
  )
  select coalesce(array_agg(seat order by round_no, pos), '{}')
  from one_round,
       generate_series(1, (private.sahtekar_config() ->> 'clueRounds')::integer) as round_no,
       unnest(one_round.r) with ordinality as o(seat, pos);
$$;

-- pure/sahtekar.ts → tally: the seat with the most votes, null on a tie or without votes.
create function private.sahtekar_tally(votes jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  with counts as (
    select value as seat, count(*) as n from jsonb_each_text(votes) group by value
  ), top as (
    select seat, n, rank() over (order by n desc) as rk from counts
  )
  select case when count(*) = 1 then min(seat) end from top where rk = 1;
$$;

revoke all on function private.sahtekar_config() from public, anon, authenticated;
revoke all on function private.sahtekar_seconds(text) from public, anon, authenticated;
revoke all on function private.sahtekar_seats(integer, integer) from public, anon, authenticated;
revoke all on function private.sahtekar_clue_order(text[]) from public, anon, authenticated;
revoke all on function private.sahtekar_tally(jsonb) from public, anon, authenticated;

-- A word the room has not used and 5 others of its category; the word counts as used (it is shown).
-- When the room has used every word, the deck starts over.
create function private.sahtekar_deal(target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked public.cards;
  options text[];
begin
  select c.* into picked from public.cards c
  where c.deck = 'sahtekar' and c.is_active
    and not exists (
      select 1 from public.room_used_cards u where u.room_id = target_room_id and u.card_id = c.id
    )
  order by random() limit 1;
  if picked.id is null then
    delete from public.room_used_cards u
    using public.cards c
    where u.room_id = target_room_id and u.card_id = c.id and c.deck = 'sahtekar';
    select c.* into picked from public.cards c
    where c.deck = 'sahtekar' and c.is_active order by random() limit 1;
  end if;
  if picked.id is null then
    raise exception using errcode = 'P0001', message = 'no_cards';
  end if;
  perform private.use_card(target_room_id, picked.id);

  select array_agg(w order by random()) into options from (
    select picked.word as w
    union all
    (select c.word from public.cards c
     where c.deck = 'sahtekar' and c.is_active and c.theme = picked.theme and c.id <> picked.id
     order by random()
     limit (private.sahtekar_config() ->> 'options')::integer - 1)
  ) six;

  return jsonb_build_object(
    'cardId', picked.id, 'category', picked.prompt, 'word', picked.word, 'options', to_jsonb(options)
  );
end;
$$;

revoke all on function private.sahtekar_deal(uuid) from public, anon, authenticated;

-- The table a seat belongs to, as the caller's membership sees it.
create function private.sahtekar_own_seat(seat text, is_owner boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select left(seat, 1) = case when is_owner then 'A' else 'B' end;
$$;

revoke all on function private.sahtekar_own_seat(text, boolean) from public, anon, authenticated;

-- Starts a two-table game from an accepted proposal (rooms_answer_game).
create function private.start_sahtekar(r public.rooms, owner_players integer, guest_players integer)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_game integer;
  seats text[];
  deal jsonb;
begin
  if owner_players + guest_players < (private.sahtekar_config() ->> 'minPlayers')::integer then
    raise exception using errcode = 'P0001', message = 'not_enough_players';
  end if;
  next_game := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
  seats := private.sahtekar_seats(owner_players, guest_players);
  deal := private.sahtekar_deal(r.id);

  insert into public.game_secrets (room_id, game_no, concept, secret)
  values (r.id, next_game, 'sahtekar', jsonb_build_object(
    'imposter', seats[1 + floor(random() * array_length(seats, 1))::integer],
    'word', deal -> 'word', 'cardId', deal -> 'cardId', 'options', deal -> 'options',
    'votes', '{}'::jsonb
  ));

  update public.rooms
  set concept = 'sahtekar', last_activity_at = now(),
      game_state = jsonb_build_object(
        'concept', 'sahtekar', 'phase', 'viewing', 'gameNo', next_game,
        'players', jsonb_build_object('owner', owner_players, 'guest', guest_players),
        'seats', to_jsonb(seats), 'category', deal -> 'category', 'dealNo', 1,
        'viewed', '[]'::jsonb, 'order', '[]'::jsonb, 'step', 0, 'voters', '[]'::jsonb,
        'votesCast', 0, 'endsAt', now() + private.sahtekar_seconds('viewSeconds')
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.start_sahtekar(public.rooms, integer, integer)
  from public, anon, authenticated;

-- Phase changes. Each takes the locked room and returns it updated.
create function private.sahtekar_to_voting(r public.rooms)
returns public.rooms
language sql
security definer
set search_path = ''
as $$
  update public.rooms
  set last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object(
        'phase', 'voting', 'voters', r.game_state -> 'viewed', 'votesCast', 0,
        'endsAt', now() + private.sahtekar_seconds('voteSeconds')
      )
  where id = r.id
  returning *;
$$;

create function private.sahtekar_to_clues(r public.rooms)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewed text[];
  ord text[];
begin
  -- The seats that saw their card, in seat order.
  select coalesce(array_agg(s order by o), '{}') into viewed
  from jsonb_array_elements_text(r.game_state -> 'seats') with ordinality as x(s, o)
  where r.game_state -> 'viewed' ? s;
  ord := private.sahtekar_clue_order(viewed);
  r.game_state := r.game_state || jsonb_build_object('viewed', to_jsonb(viewed));
  if coalesce(array_length(ord, 1), 0) = 0 then
    return private.sahtekar_to_voting(r);
  end if;
  update public.rooms
  set last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object(
        'phase', 'clues', 'order', to_jsonb(ord), 'step', 0,
        'endsAt', now() + private.sahtekar_seconds('clueSeconds')
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- The viewing ends (every seat looked, or the 2 minutes are up). A seat that did not look leaves
-- the game and its table's count drops. If the impostor left, the remaining seats get a new impostor
-- and a new word and look again (dealNo + 1). Fewer than 3 left: the game ends without results,
-- lastGame.endedBy = 'not_enough_players' (pure/sahtekar.ts -> afterViewing).
create function private.sahtekar_end_viewing(r public.rooms)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  kept text[];
  s public.game_secrets;
  deal jsonb;
  players jsonb;
begin
  select coalesce(array_agg(x.s order by x.o), '{}') into kept
  from jsonb_array_elements_text(r.game_state -> 'seats') with ordinality as x(s, o)
  where r.game_state -> 'viewed' ? x.s;
  if coalesce(array_length(kept, 1), 0) = jsonb_array_length(r.game_state -> 'seats') then
    return private.sahtekar_to_clues(r);
  end if;

  if coalesce(array_length(kept, 1), 0) < (private.sahtekar_config() ->> 'minPlayers')::integer then
    update public.rooms
    set concept = null, last_activity_at = now(),
        game_state = private.between_games(game_state, jsonb_build_object(
          'concept', 'sahtekar', 'players', game_state -> 'players',
          'endedBy', 'not_enough_players'
        ))
    where id = r.id
    returning * into r;
    return r;
  end if;

  players := jsonb_build_object(
    'owner', (select count(*) from unnest(kept) k where left(k, 1) = 'A'),
    'guest', (select count(*) from unnest(kept) k where left(k, 1) = 'B')
  );
  s := private.sahtekar_secret(r);
  if (s.secret ->> 'imposter') = any (kept) then
    r.game_state := r.game_state || jsonb_build_object(
      'seats', to_jsonb(kept), 'viewed', to_jsonb(kept), 'players', players
    );
    return private.sahtekar_to_clues(r);
  end if;

  deal := private.sahtekar_deal(r.id);
  update public.game_secrets
  set secret = secret || jsonb_build_object(
    'imposter', kept[1 + floor(random() * array_length(kept, 1))::integer],
    'word', deal -> 'word', 'cardId', deal -> 'cardId', 'options', deal -> 'options',
    'votes', '{}'::jsonb
  )
  where room_id = s.room_id and game_no = s.game_no;
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'seats', to_jsonb(kept), 'players', players, 'category', deal -> 'category',
        'dealNo', coalesce((game_state ->> 'dealNo')::integer, 1) + 1, 'viewed', '[]'::jsonb,
        'endsAt', now() + private.sahtekar_seconds('viewSeconds')
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- The end: results for both accounts (no score, no winner: the badges count the game only), the
-- room back to chat with everything open in lastGame.reveal.
create function private.sahtekar_finish(
  r public.rooms,
  s public.game_secrets,
  accused text,
  guess text
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  imposter text := s.secret ->> 'imposter';
  winner text;
begin
  winner := case when accused = imposter and guess is distinct from (s.secret ->> 'word')
                 then 'tables' else 'imposter' end;
  insert into public.game_results (user_id, room_id, concept, mode, score, won)
  select ts.user_id, r.id, 'sahtekar', 'sahtekar', null, null
  from public.table_sessions ts
  where ts.id in (r.owner_session_id, r.guest_session_id);
  insert into public.game_events (room_id, type, payload)
  values (r.id, 'game_completed', jsonb_build_object('concept', 'sahtekar', 'winner', winner));

  update public.rooms
  set concept = null, last_activity_at = now(),
      game_state = private.between_games(game_state, jsonb_build_object(
        'concept', 'sahtekar',
        'players', game_state -> 'players',
        'reveal', jsonb_build_object(
          'imposter', imposter, 'word', s.secret -> 'word', 'category', game_state -> 'category',
          'votes', s.secret -> 'votes', 'accused', accused, 'guess', guess, 'winner', winner
        )
      ))
  where id = r.id
  returning * into r;
  return r;
end;
$$;

create function private.sahtekar_count(r public.rooms, s public.game_secrets)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  accused text := private.sahtekar_tally(s.secret -> 'votes');
begin
  if accused is not distinct from (s.secret ->> 'imposter') and accused is not null then
    update public.rooms
    set last_activity_at = now(),
        game_state = r.game_state || jsonb_build_object(
          'phase', 'guess', 'accused', accused,
          'endsAt', now() + private.sahtekar_seconds('guessSeconds')
        )
    where id = r.id
    returning * into r;
    return r;
  end if;
  return private.sahtekar_finish(r, s, accused, null);
end;
$$;

-- The next clue step (Söyledi or the clock); after the last one, the vote.
create function private.sahtekar_next_step(r public.rooms)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_step integer := (r.game_state ->> 'step')::integer + 1;
begin
  if next_step >= jsonb_array_length(r.game_state -> 'order') then
    return private.sahtekar_to_voting(r);
  end if;
  update public.rooms
  set last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object(
        'step', next_step, 'endsAt', now() + private.sahtekar_seconds('clueSeconds')
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.sahtekar_to_voting(public.rooms) from public, anon, authenticated;
revoke all on function private.sahtekar_to_clues(public.rooms) from public, anon, authenticated;
revoke all on function private.sahtekar_end_viewing(public.rooms) from public, anon, authenticated;
revoke all on function private.sahtekar_finish(public.rooms, public.game_secrets, text, text)
  from public, anon, authenticated;
revoke all on function private.sahtekar_count(public.rooms, public.game_secrets)
  from public, anon, authenticated;
revoke all on function private.sahtekar_next_step(public.rooms) from public, anon, authenticated;

-- The caller's room with a two-table Sahtekar game running, locked; the membership row too.
create function private.sahtekar_room(target_user_id uuid, target_room_id uuid)
returns table (room public.rooms, is_owner boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.concept is distinct from 'sahtekar' or r.guest_session_id is null
     or r.game_state ->> 'phase' is null then
    raise exception using errcode = 'P0001', message = 'no_game';
  end if;
  return query select r, m.is_owner;
end;
$$;

revoke all on function private.sahtekar_room(uuid, uuid) from public, anon, authenticated;

create function private.sahtekar_secret(r public.rooms)
returns public.game_secrets
language sql
security definer
set search_path = ''
as $$
  select * from public.game_secrets
  where room_id = r.id and game_no = (r.game_state ->> 'gameNo')::integer
  for update;
$$;

revoke all on function private.sahtekar_secret(public.rooms) from public, anon, authenticated;

-- sahtekar/view: one of the caller's seats holds its card. The impostor gets the category only.
-- A seat may look again until the clues start; the last seat to look starts them.
create function public.sahtekar_view(target_user_id uuid, target_room_id uuid, seat text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
  s public.game_secrets;
begin
  select * into p from private.sahtekar_room(target_user_id, target_room_id);
  r := p.room;
  if r.game_state ->> 'phase' <> 'viewing' or now() >= (r.game_state ->> 'endsAt')::timestamptz then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if not (r.game_state -> 'seats' ? seat) or not private.sahtekar_own_seat(seat, p.is_owner) then
    raise exception using errcode = 'P0001', message = 'not_your_seat';
  end if;
  s := private.sahtekar_secret(r);

  if not (r.game_state -> 'viewed' ? seat) then
    update public.rooms
    set last_activity_at = now(),
        game_state = game_state || jsonb_build_object(
          'viewed', (game_state -> 'viewed') || to_jsonb(seat)
        )
    where id = r.id
    returning * into r;
    if jsonb_array_length(r.game_state -> 'viewed') = jsonb_array_length(r.game_state -> 'seats') then
      perform private.sahtekar_end_viewing(r);
    end if;
  end if;

  return jsonb_build_object(
    'seat', seat,
    'category', r.game_state -> 'category',
    'word', case when seat = s.secret ->> 'imposter' then null else s.secret -> 'word' end,
    'imposter', seat = s.secret ->> 'imposter'
  );
end;
$$;

-- sahtekar/said: the speaking seat's table moves the clues on. Another step is ignored.
create function public.sahtekar_said(target_user_id uuid, target_room_id uuid, step integer)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
begin
  select * into p from private.sahtekar_room(target_user_id, target_room_id);
  r := p.room;
  if r.game_state ->> 'phase' <> 'clues' or (r.game_state ->> 'step')::integer <> step then
    return r;
  end if;
  if not private.sahtekar_own_seat(r.game_state -> 'order' ->> step, p.is_owner) then
    raise exception using errcode = 'P0001', message = 'not_your_seat';
  end if;
  return private.sahtekar_next_step(r);
end;
$$;

-- sahtekar/vote: one of the caller's seats that saw its card votes once, never for itself.
create function public.sahtekar_vote(
  target_user_id uuid,
  target_room_id uuid,
  voter text,
  target text
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
  s public.game_secrets;
  cast_count integer;
begin
  select * into p from private.sahtekar_room(target_user_id, target_room_id);
  r := p.room;
  if r.game_state ->> 'phase' <> 'voting' then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if not private.sahtekar_own_seat(voter, p.is_owner) or not (r.game_state -> 'voters' ? voter) then
    raise exception using errcode = 'P0001', message = 'not_your_seat';
  end if;
  if voter = target or not (r.game_state -> 'seats' ? target) then
    raise exception using errcode = 'P0001', message = 'bad_request';
  end if;
  s := private.sahtekar_secret(r);
  if s.secret -> 'votes' ? voter then
    return r;
  end if;

  update public.game_secrets
  set secret = jsonb_set(secret, '{votes}', (secret -> 'votes') || jsonb_build_object(voter, target))
  where room_id = s.room_id and game_no = s.game_no
  returning * into s;
  cast_count := (r.game_state ->> 'votesCast')::integer + 1;
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object('votesCast', cast_count)
  where id = r.id
  returning * into r;
  if cast_count >= jsonb_array_length(r.game_state -> 'voters') then
    return private.sahtekar_count(r, s);
  end if;
  return r;
end;
$$;

-- sahtekar/options: the 6 words, to the caught impostor's table only.
create function public.sahtekar_options(target_user_id uuid, target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  s public.game_secrets;
begin
  select * into p from private.sahtekar_room(target_user_id, target_room_id);
  if (p.room).game_state ->> 'phase' <> 'guess' then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if not private.sahtekar_own_seat((p.room).game_state ->> 'accused', p.is_owner) then
    raise exception using errcode = 'P0001', message = 'not_your_seat';
  end if;
  s := private.sahtekar_secret(p.room);
  return s.secret -> 'options';
end;
$$;

-- sahtekar/guess: the caught impostor's table names one of the 6 words; the game ends.
create function public.sahtekar_guess(target_user_id uuid, target_room_id uuid, option text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  s public.game_secrets;
begin
  select * into p from private.sahtekar_room(target_user_id, target_room_id);
  if (p.room).game_state ->> 'phase' <> 'guess' then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if not private.sahtekar_own_seat((p.room).game_state ->> 'accused', p.is_owner) then
    raise exception using errcode = 'P0001', message = 'not_your_seat';
  end if;
  s := private.sahtekar_secret(p.room);
  if not (s.secret -> 'options' ? option) then
    raise exception using errcode = 'P0001', message = 'bad_request';
  end if;
  return private.sahtekar_finish(p.room, s, (p.room).game_state ->> 'accused', option);
end;
$$;

-- sahtekar/advance: either table, once the phase's time is up. Before that, or with no game, the
-- room stays as it is (idempotent, like tabu/end-turn).
create function public.sahtekar_advance(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  phase text;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.concept is distinct from 'sahtekar' or r.guest_session_id is null
     or r.game_state ->> 'phase' is null
     or now() < (r.game_state ->> 'endsAt')::timestamptz then
    return r;
  end if;
  phase := r.game_state ->> 'phase';
  if phase = 'viewing' then
    return private.sahtekar_end_viewing(r);
  elsif phase = 'clues' then
    return private.sahtekar_next_step(r);
  elsif phase = 'voting' then
    return private.sahtekar_count(r, private.sahtekar_secret(r));
  end if;
  -- The guess ran out: a wrong guess.
  return private.sahtekar_finish(r, private.sahtekar_secret(r), r.game_state ->> 'accused', null);
end;
$$;

-- sahtekar/start: the one-table game's deck (a word, its category, 6 options); the phone runs the
-- game (§20.2). The room's activity becomes Sahtekar until "Oyunu bitir" or a second table joins.
create function public.sahtekar_local_deck(target_user_id uuid, target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  deal jsonb;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.guest_session_id is not null then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  if r.concept is not null and r.concept <> 'sahtekar' then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;
  deal := private.sahtekar_deal(r.id);
  update public.rooms
  set concept = 'sahtekar', last_activity_at = now(),
      game_state = private.between_games(game_state, null)
  where id = r.id;
  return jsonb_build_object(
    'category', deal -> 'category', 'word', deal -> 'word', 'options', deal -> 'options'
  );
end;
$$;

revoke all on function public.sahtekar_view(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sahtekar_said(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.sahtekar_vote(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.sahtekar_options(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sahtekar_guess(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sahtekar_advance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sahtekar_local_deck(uuid, uuid) from public, anon, authenticated;
grant execute on function public.sahtekar_view(uuid, uuid, text) to service_role;
grant execute on function public.sahtekar_said(uuid, uuid, integer) to service_role;
grant execute on function public.sahtekar_vote(uuid, uuid, text, text) to service_role;
grant execute on function public.sahtekar_options(uuid, uuid) to service_role;
grant execute on function public.sahtekar_guess(uuid, uuid, text) to service_role;
grant execute on function public.sahtekar_advance(uuid, uuid) to service_role;
grant execute on function public.sahtekar_local_deck(uuid, uuid) to service_role;

-- Proposals carry the proposer's count; the acceptance the acceptor's -------------------------------
drop function public.rooms_propose_game(uuid, uuid, text, integer);

create function public.rooms_propose_game(
  target_user_id uuid,
  target_room_id uuid,
  new_concept text,
  ttl_seconds integer,
  proposer_players integer default null
)
returns public.game_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  players integer;
  created public.game_proposals;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.status <> 'active' or r.guest_session_id is null then
    raise exception using errcode = 'P0001', message = 'needs_two_tables';
  end if;
  if r.concept is not null then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;

  delete from public.game_proposals where room_id = r.id and expires_at <= now();
  if exists (select 1 from public.game_proposals where room_id = r.id) then
    raise exception using errcode = 'P0001', message = 'proposal_pending';
  end if;

  if new_concept = 'sahtekar' then
    players := coalesce(
      proposer_players,
      (select least(headcount, 4) from public.table_sessions where id = m.session_id)
    );
  end if;
  insert into public.game_proposals (room_id, proposer_session_id, concept, expires_at, proposer_players)
  values (r.id, m.session_id, new_concept, now() + make_interval(secs => ttl_seconds), players)
  returning * into created;
  update public.rooms set last_activity_at = now() where id = r.id;
  return created;
end;
$$;

drop function public.rooms_answer_game(uuid, uuid, boolean, integer, integer, integer, integer, integer);

create function public.rooms_answer_game(
  target_user_id uuid,
  target_room_id uuid,
  accept boolean,
  turn_seconds integer,
  total_turns integer,
  max_passes integer,
  cards_per_turn integer,
  cooldown_ms integer,
  acceptor_players integer default null
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  p public.game_proposals;
  mine integer;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  select * into p from public.game_proposals where room_id = r.id for update;
  if p.room_id is null or p.expires_at <= now() or p.proposer_session_id = m.session_id then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  delete from public.game_proposals where room_id = r.id;

  if not accept then
    return r;
  end if;
  if r.status <> 'active' or r.guest_session_id is null then
    raise exception using errcode = 'P0001', message = 'needs_two_tables';
  end if;
  if r.concept is not null then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;

  if p.concept = 'tabu' then
    return private.start_voice_tabu(r, turn_seconds, total_turns, max_passes, cards_per_turn);
  end if;
  if p.concept = 'sahtekar' then
    mine := coalesce(
      acceptor_players,
      (select least(headcount, 4) from public.table_sessions where id = m.session_id)
    );
    return private.start_sahtekar(
      r,
      case when m.is_owner then mine else p.proposer_players end,
      case when m.is_owner then p.proposer_players else mine end
    );
  end if;
  return private.deal_sohbet(r, cooldown_ms);
end;
$$;

revoke all on function public.rooms_propose_game(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.rooms_answer_game(uuid, uuid, boolean, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.rooms_propose_game(uuid, uuid, text, integer, integer)
  to service_role;
grant execute on function public.rooms_answer_game(uuid, uuid, boolean, integer, integer, integer, integer, integer, integer)
  to service_role;

-- rooms/end-game: as in 20261015090000_tabu_ready.sql; a Sahtekar game keeps its player counts in
-- lastGame for the rematch (§20.1).
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
  if r.concept = 'sahtekar' and r.game_state ? 'players' then
    last_game := last_game || jsonb_build_object('abandoned', true, 'players', r.game_state -> 'players');
  end if;
  update public.rooms
  set concept = null, last_activity_at = now(),
      game_state = private.between_games(game_state, last_game)
  where id = r.id
  returning * into r;
  return r;
end;
$$;
