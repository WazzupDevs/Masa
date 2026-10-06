-- v3 step 7.4 (docs/SPEC_V3.md §20.5): İbre. A two-ended scale (open), a hidden target from 0 to
-- 100 (game_secrets), the describing table's clue and needle, the other table's "Daha sol / Daha
-- sağ" within 15 seconds, the bands 4 / 3 / 2 / 0 and 4 rounds with the tables in turn. Every round
-- opens ready (§20.1).
--
-- The target is in no rooms row, game event or Realtime payload before the reveal (rule 4): only
-- ibre/target answers it, to the describing table, while its clock runs. The reveal puts it in
-- game_state.
-- pure/ibre.ts is the rule; private.ibre_config() and private.ibre_band() apply it here and
-- integration tests check that they agree.
--
-- Lock order (rule 10): rooms → game_secrets → room_used_cards, game_results, game_events.

-- Constraints: the new game everywhere a game is named --------------------------------------------
alter table public.rooms drop constraint rooms_concept_check;
alter table public.rooms
  add constraint rooms_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'ibre'));
alter table public.game_proposals drop constraint game_proposals_concept_check;
alter table public.game_proposals
  add constraint game_proposals_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'ibre'));
alter table public.game_results drop constraint game_results_concept_check;
alter table public.game_results
  add constraint game_results_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'ibre'));
alter table public.game_results drop constraint game_results_mode_check;
alter table public.game_results
  add constraint game_results_mode_check
  check (mode in ('voice', 'text', 'cooperative', 'sahtekar', 'harf', 'sarki', 'ibre'));
alter table public.play_history drop constraint play_history_concept_check;
alter table public.play_history
  add constraint play_history_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'ibre', 'chat'));
alter table public.game_secrets drop constraint game_secrets_concept_check;
alter table public.game_secrets
  add constraint game_secrets_concept_check check (concept in ('sahtekar', 'ibre'));

-- The deck: one card a scale (prompt = the left end, word = the right end). Not readable by the app.
alter table public.cards drop constraint cards_deck_check;
alter table public.cards
  add constraint cards_deck_check
  check (deck in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'ibre'));
alter table public.cards drop constraint cards_check;
alter table public.cards
  add constraint cards_check check (
    (deck = 'tabu' and word is not null and cardinality(forbidden) = 5 and prompt is null)
    or (deck = 'sohbet' and prompt is not null and theme is not null and word is null)
    or (deck = 'sahtekar' and word is not null and theme is not null and prompt is not null
        and forbidden is null)
    or (deck = 'harf' and prompt is not null and theme is not null and word is null
        and forbidden is null)
    or (deck = 'sarki' and word is not null and prompt is null and forbidden is null)
    or (deck = 'ibre' and word is not null and prompt is not null and theme is null
        and forbidden is null)
  );

-- Rules -------------------------------------------------------------------------------------------
-- pure/ibre.ts → IBRE_CONFIG.
create function private.ibre_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'totalRounds', 4, 'readySeconds', 10, 'clueSeconds', 60, 'sideSeconds', 15,
    'minLocalPlayers', 2
  );
$$;

-- pure/ibre.ts → ibreBand.
create function private.ibre_band(distance integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when abs(distance) <= 4 then 4
              when abs(distance) <= 11 then 3
              when abs(distance) <= 19 then 2
              else 0 end;
$$;

-- pure/ibre.ts → ibreTurnTable.
create function private.ibre_turn_table(round_no integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when round_no % 2 = 1 then 'owner' else 'guest' end;
$$;

-- pure/ibre.ts → randomTarget.
create function private.ibre_target()
returns integer
language sql
volatile
set search_path = ''
as $$
  select floor(random() * 101)::integer;
$$;

-- A scale the room has not used; it counts as used, as it is shown at once. When the room has used
-- the whole deck, it starts over.
create function private.ibre_deal(target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked public.cards;
begin
  select c.* into picked from public.cards c
  where c.deck = 'ibre' and c.is_active
    and not exists (
      select 1 from public.room_used_cards u where u.room_id = target_room_id and u.card_id = c.id
    )
  order by random() limit 1;
  if picked.id is null then
    delete from public.room_used_cards u
    using public.cards c
    where u.room_id = target_room_id and u.card_id = c.id and c.deck = 'ibre';
    select c.* into picked from public.cards c
    where c.deck = 'ibre' and c.is_active order by random() limit 1;
  end if;
  if picked.id is null then
    raise exception using errcode = 'P0001', message = 'no_cards';
  end if;
  perform private.use_card(target_room_id, picked.id);
  return jsonb_build_object('left', picked.prompt, 'right', picked.word);
end;
$$;

revoke all on function private.ibre_config() from public, anon, authenticated;
revoke all on function private.ibre_band(integer) from public, anon, authenticated;
revoke all on function private.ibre_turn_table(integer) from public, anon, authenticated;
revoke all on function private.ibre_target() from public, anon, authenticated;
revoke all on function private.ibre_deal(uuid) from public, anon, authenticated;

-- Starts a two-table game from an accepted proposal (rooms_answer_game): round 1 ready, its target
-- in game_secrets.
create function private.start_ibre(r public.rooms)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb := private.ibre_config();
  next_game integer := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
begin
  insert into public.game_secrets (room_id, game_no, concept, secret)
  values (r.id, next_game, 'ibre', jsonb_build_object('roundNo', 1, 'target', private.ibre_target()));

  update public.rooms
  set concept = 'ibre', last_activity_at = now(),
      game_state = jsonb_build_object(
        'concept', 'ibre', 'phase', 'playing', 'gameNo', next_game,
        'turnPhase', 'ready',
        'readyEndsAt', now() + make_interval(secs => (c ->> 'readySeconds')::integer),
        'roundNo', 1, 'totalRounds', (c ->> 'totalRounds')::integer,
        'scale', private.ibre_deal(r.id), 'turnTable', private.ibre_turn_table(1),
        'endsAt', null, 'needle', null,
        'scores', jsonb_build_object('owner', 0, 'guest', 0),
        'bullseyes', jsonb_build_object('owner', 0, 'guest', 0),
        'reveal', null
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- The round's secret, locked.
create function private.ibre_secret(r public.rooms)
returns public.game_secrets
language sql
security definer
set search_path = ''
as $$
  select * from public.game_secrets
  where room_id = r.id and game_no = (r.game_state ->> 'gameNo')::integer
  for update;
$$;

-- The round is over (pure/ibre.ts → endRound): the reveal, the points, then the next round ready
-- with a new target, or the end. `side` is null when no side guess came. At the end: game_results
-- for both accounts (score per table, won with more points), the room back to chat with the scores
-- and the last reveal in lastGame.
create function private.ibre_end_round(r public.rooms, side text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb := private.ibre_config();
  gs jsonb := r.game_state;
  s public.game_secrets;
  target integer;
  needle integer;
  band integer;
  side_point boolean;
  describer text := gs ->> 'turnTable';
  guesser text;
  scores jsonb := gs -> 'scores';
  bullseyes jsonb := gs -> 'bullseyes';
  reveal jsonb;
  round_no integer := (gs ->> 'roundNo')::integer;
  owner_score integer;
  guest_score integer;
begin
  s := private.ibre_secret(r);
  target := (s.secret ->> 'target')::integer;
  guesser := case when describer = 'owner' then 'guest' else 'owner' end;
  needle := case when gs ->> 'turnPhase' = 'side' then (gs ->> 'needle')::integer end;
  band := case when needle is null then 0 else private.ibre_band(needle - target) end;
  side_point := needle is not null and side is not null and needle <> target
                and ((side = 'left') = (target < needle));
  scores := jsonb_set(scores, array[describer], to_jsonb((scores ->> describer)::integer + band));
  scores := jsonb_set(
    scores, array[guesser], to_jsonb((scores ->> guesser)::integer + case when side_point then 1 else 0 end)
  );
  bullseyes := jsonb_set(
    bullseyes, array[describer],
    to_jsonb((bullseyes ->> describer)::integer + case when band = 4 then 1 else 0 end)
  );
  reveal := jsonb_build_object(
    'roundNo', round_no, 'scale', gs -> 'scale', 'table', describer, 'target', target,
    'needle', needle, 'band', band,
    'side', side, 'sidePoint', side_point
  );

  if round_no >= (gs ->> 'totalRounds')::integer then
    owner_score := (scores ->> 'owner')::integer;
    guest_score := (scores ->> 'guest')::integer;
    insert into public.game_results (user_id, room_id, concept, mode, score, won)
    select ts.user_id, r.id, 'ibre', 'ibre',
           case when ts.id = r.owner_session_id then owner_score else guest_score end,
           case when ts.id = r.owner_session_id then owner_score > guest_score
                else guest_score > owner_score end
    from public.table_sessions ts
    where ts.id in (r.owner_session_id, r.guest_session_id);
    insert into public.game_events (room_id, type, payload)
    values (r.id, 'game_completed', jsonb_build_object('concept', 'ibre', 'scores', scores));
    update public.rooms
    set concept = null, last_activity_at = now(),
        game_state = private.between_games(gs, jsonb_build_object(
          'concept', 'ibre', 'scores', scores, 'reveal', reveal, 'bullseyes', bullseyes
        ))
    where id = r.id
    returning * into r;
    return r;
  end if;

  round_no := round_no + 1;
  update public.game_secrets
  set secret = jsonb_build_object('roundNo', round_no, 'target', private.ibre_target())
  where room_id = s.room_id and game_no = s.game_no;
  update public.rooms
  set last_activity_at = now(),
      game_state = gs || jsonb_build_object(
        'turnPhase', 'ready',
        'readyEndsAt', now() + make_interval(secs => (c ->> 'readySeconds')::integer),
        'roundNo', round_no, 'scale', private.ibre_deal(r.id),
        'turnTable', private.ibre_turn_table(round_no), 'endsAt', null, 'needle', null,
        'scores', scores, 'bullseyes', bullseyes, 'reveal', reveal
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.start_ibre(public.rooms) from public, anon, authenticated;
revoke all on function private.ibre_secret(public.rooms) from public, anon, authenticated;
revoke all on function private.ibre_end_round(public.rooms, text) from public, anon, authenticated;

-- The caller's room with a two-table İbre running, locked; the caller's side too (null otherwise).
create function private.ibre_room(target_user_id uuid, target_room_id uuid)
returns table (room public.rooms, side text)
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
  if r.concept is distinct from 'ibre' or r.guest_session_id is null
     or r.game_state ->> 'phase' is distinct from 'playing' then
    return query select r, null::text;
    return;
  end if;
  return query select r, case when m.is_owner then 'owner' else 'guest' end;
end;
$$;

revoke all on function private.ibre_room(uuid, uuid) from public, anon, authenticated;

-- The clock starts no later than readyEndsAt: a late call does not lengthen it (§20.1).
create function private.ibre_start_clock(r public.rooms)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnPhase', 'running', 'readyEndsAt', null,
        'endsAt', least(now(), (game_state ->> 'readyEndsAt')::timestamptz)
                  + make_interval(secs => (private.ibre_config() ->> 'clueSeconds')::integer)
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.ibre_start_clock(public.rooms) from public, anon, authenticated;

-- ibre/begin: the describing table in the ready state. Anything else leaves the room as it is.
create function public.ibre_begin(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from private.ibre_room(target_user_id, target_room_id);
  if p.side is null or (p.room).game_state ->> 'turnPhase' <> 'ready'
     or p.side <> (p.room).game_state ->> 'turnTable' then
    return p.room;
  end if;
  return private.ibre_start_clock(p.room);
end;
$$;

-- ibre/target: the round's target, to the describing table only, while a clock runs (its own or
-- the other table's). The other table: not_describer; the ready state: turn_not_started; another
-- round: turn_over.
create function public.ibre_target(target_user_id uuid, target_room_id uuid, round integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  gs jsonb;
  s public.game_secrets;
begin
  select * into p from private.ibre_room(target_user_id, target_room_id);
  if p.side is null then
    raise exception using errcode = 'P0001', message = 'no_game';
  end if;
  gs := (p.room).game_state;
  if p.side <> gs ->> 'turnTable' then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  if (gs ->> 'roundNo')::integer <> round then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if gs ->> 'turnPhase' = 'ready' then
    raise exception using errcode = 'P0001', message = 'turn_not_started';
  end if;
  s := private.ibre_secret(p.room);
  return jsonb_build_object('roundNo', round, 'target', (s.secret ->> 'target')::integer);
end;
$$;

-- ibre/lock (pure/ibre.ts → ibreLock): the describing table's needle on the current round, before
-- its clock runs out; the other table's 15 seconds start. A stale or second call is ignored.
create function public.ibre_lock(
  target_user_id uuid,
  target_room_id uuid,
  round integer,
  value integer
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
  gs jsonb;
begin
  select * into p from private.ibre_room(target_user_id, target_room_id);
  r := p.room;
  gs := r.game_state;
  if p.side is null or gs ->> 'turnPhase' <> 'running' or p.side <> gs ->> 'turnTable'
     or (gs ->> 'roundNo')::integer <> round or now() >= (gs ->> 'endsAt')::timestamptz
     or value is null or value < 0 or value > 100 then
    return r;
  end if;
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnPhase', 'side', 'needle', value,
        'endsAt', now() + make_interval(secs => (private.ibre_config() ->> 'sideSeconds')::integer)
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- ibre/side (pure/ibre.ts → ibreSide): the other table, within its 15 seconds. The round is
-- revealed at once. A stale or second call, or one from the describing table, is ignored.
create function public.ibre_side(
  target_user_id uuid,
  target_room_id uuid,
  round integer,
  side text
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
  gs jsonb;
begin
  select * into p from private.ibre_room(target_user_id, target_room_id);
  r := p.room;
  gs := r.game_state;
  if p.side is null or gs ->> 'turnPhase' <> 'side' or p.side = gs ->> 'turnTable'
     or (gs ->> 'roundNo')::integer <> round or now() >= (gs ->> 'endsAt')::timestamptz
     or side not in ('left', 'right') then
    return r;
  end if;
  return private.ibre_end_round(r, side);
end;
$$;

-- ibre/advance (pure/ibre.ts → ibreAdvance): either table, once a clock ran out. The ready clock
-- starts the turn from readyEndsAt; the describing table's clock ends the round without a needle;
-- the other table's ends it without a side guess. Before that, or with no game: the room as it is
-- (idempotent).
create function public.ibre_advance(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
  gs jsonb;
begin
  select * into p from private.ibre_room(target_user_id, target_room_id);
  r := p.room;
  gs := r.game_state;
  if p.side is null then
    return r;
  end if;
  if gs ->> 'turnPhase' = 'ready' then
    if now() < (gs ->> 'readyEndsAt')::timestamptz then
      return r;
    end if;
    return private.ibre_start_clock(r);
  end if;
  if now() < (gs ->> 'endsAt')::timestamptz then
    return r;
  end if;
  return private.ibre_end_round(r, null);
end;
$$;

-- ibre/start: the one-table game's scales (one per round); the phone makes the targets and runs the
-- game for Takım A and B (§20.5). The room's activity becomes the game until "Oyunu bitir" or a
-- second table joins.
create function public.ibre_local_deck(target_user_id uuid, target_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  scales jsonb := '[]'::jsonb;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.guest_session_id is not null then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  if r.concept is not null and r.concept <> 'ibre' then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;
  for i in 1 .. (private.ibre_config() ->> 'totalRounds')::integer loop
    scales := scales || jsonb_build_array(private.ibre_deal(r.id));
  end loop;
  update public.rooms
  set concept = 'ibre', last_activity_at = now(),
      game_state = private.between_games(game_state, null)
  where id = r.id;
  return scales;
end;
$$;

revoke all on function public.ibre_begin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ibre_target(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.ibre_lock(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.ibre_side(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.ibre_advance(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ibre_local_deck(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ibre_begin(uuid, uuid) to service_role;
grant execute on function public.ibre_target(uuid, uuid, integer) to service_role;
grant execute on function public.ibre_lock(uuid, uuid, integer, integer) to service_role;
grant execute on function public.ibre_side(uuid, uuid, integer, text) to service_role;
grant execute on function public.ibre_advance(uuid, uuid) to service_role;
grant execute on function public.ibre_local_deck(uuid, uuid) to service_role;

-- Proposals: start İbre on acceptance -------------------------------------------------------------
create or replace function public.rooms_answer_game(
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
  if p.concept in ('harf', 'sarki') then
    return private.start_say(r, p.concept);
  end if;
  if p.concept = 'ibre' then
    return private.start_ibre(r);
  end if;
  return private.deal_sohbet(r, cooldown_ms);
end;
$$;

-- "Oyunu bitir": an İbre game still playing keeps its scores and where it stopped.
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
  if r.concept in ('harf', 'sarki', 'ibre') and r.game_state ->> 'phase' = 'playing' then
    last_game := last_game || jsonb_build_object(
      'abandoned', true,
      'turnNo', (r.game_state ->> 'roundNo')::integer,
      'totalTurns', (r.game_state ->> 'totalRounds')::integer,
      'scores', r.game_state -> 'scores'
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
