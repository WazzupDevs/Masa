-- v3 step 7.2 (docs/SPEC_V3.md §20.3–20.4): Harf Kapmaca and Şarkıda Geçsin on one engine. The
-- tables take turns: 10 seconds to name a word for an open letter (harf) or sing a line with the
-- word (sarki) and press "Söyledik"; the other table may object within 3 seconds (3 objections per
-- table per game). The table that runs out of time or is objected to loses the round and the other
-- table gets the point. Harf: 5 categories, a 23-letter board, the full board goes to the table that
-- closed the last letter. Sarki: 8 words, at most 8 lines a word (the 8th ends it without a point),
-- the last two words 5 seconds a line.
--
-- Everything is open to both tables (the prompt is not secret): game_state carries it all.
-- pure/sayChallenge.ts is the rule; private.say_config() and the functions below apply it here and
-- integration tests check that they agree.
--
-- Lock order (rule 10): rooms → room_used_cards, game_results, game_events.

-- Constraints: the new games everywhere a game is named --------------------------------------------
alter table public.rooms drop constraint rooms_concept_check;
alter table public.rooms
  add constraint rooms_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki'));
alter table public.game_proposals drop constraint game_proposals_concept_check;
alter table public.game_proposals
  add constraint game_proposals_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki'));
alter table public.game_results drop constraint game_results_concept_check;
alter table public.game_results
  add constraint game_results_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki'));
alter table public.game_results drop constraint game_results_mode_check;
alter table public.game_results
  add constraint game_results_mode_check
  check (mode in ('voice', 'text', 'cooperative', 'sahtekar', 'harf', 'sarki'));
alter table public.play_history drop constraint play_history_concept_check;
alter table public.play_history
  add constraint play_history_concept_check
  check (concept in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki', 'chat'));

-- The decks: Harf Kapmaca's categories (prompt = the name, theme = the key) and Şarkıda Geçsin's
-- words (word). Not readable by the app (the cards policy covers the Sohbet deck only).
alter table public.cards drop constraint cards_deck_check;
alter table public.cards
  add constraint cards_deck_check check (deck in ('tabu', 'sohbet', 'sahtekar', 'harf', 'sarki'));
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
  );

-- Rules -------------------------------------------------------------------------------------------
-- pure/sayChallenge.ts → SAY_CONFIG.
create function private.say_config(kind text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case kind
    when 'harf' then jsonb_build_object(
      'totalRounds', 5, 'turnSeconds', 10, 'shortRounds', 0, 'shortSeconds', 10,
      'objectionSeconds', 3, 'objections', 3, 'readySeconds', 10, 'readyEachRound', true,
      'maxSteps', 23, 'minLocalPlayers', 2
    )
    when 'sarki' then jsonb_build_object(
      'totalRounds', 8, 'turnSeconds', 10, 'shortRounds', 2, 'shortSeconds', 5,
      'objectionSeconds', 3, 'objections', 3, 'readySeconds', 10, 'readyEachRound', false,
      'maxSteps', 8, 'minLocalPlayers', 2
    )
  end;
$$;

-- pure/sayChallenge.ts → HARF_LETTERS.
create function private.say_letters()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['A', 'B', 'C', 'Ç', 'D', 'E', 'F', 'G', 'H', 'İ', 'K', 'L', 'M', 'N', 'O', 'P', 'R',
               'S', 'Ş', 'T', 'U', 'Y', 'Z'];
$$;

-- pure/sayChallenge.ts → turnSeconds.
create function private.say_turn_seconds(kind text, round_no integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when round_no > (private.say_config(kind) ->> 'totalRounds')::integer
                    - (private.say_config(kind) ->> 'shortRounds')::integer
      then (private.say_config(kind) ->> 'shortSeconds')::integer
    else (private.say_config(kind) ->> 'turnSeconds')::integer
  end;
$$;

-- pure/sayChallenge.ts → roundStarter.
create function private.say_round_starter(round_no integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when round_no % 2 = 1 then 'owner' else 'guest' end;
$$;

create function private.say_board(kind text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when kind = 'harf' then
    (select jsonb_agg(jsonb_build_object('letter', l, 'closed', false) order by o)
     from unnest(private.say_letters()) with ordinality as x(l, o))
  else '[]'::jsonb end;
$$;

-- The steps are used up: every letter closed, or the 8th line sung.
create function private.say_steps_used(state jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when state ->> 'concept' = 'harf' then
    not exists (
      select 1 from jsonb_array_elements(state -> 'letters') l where not (l ->> 'closed')::boolean
    )
  else (state ->> 'step')::integer >= (private.say_config('sarki') ->> 'maxSteps')::integer end;
$$;

-- A prompt the room has not used (a Harf category's name or a Şarkı word); it counts as used, as it
-- is shown at once. When the room has used the whole deck, it starts over.
create function private.say_deal(target_room_id uuid, kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  picked public.cards;
begin
  select c.* into picked from public.cards c
  where c.deck = kind and c.is_active
    and not exists (
      select 1 from public.room_used_cards u where u.room_id = target_room_id and u.card_id = c.id
    )
  order by random() limit 1;
  if picked.id is null then
    delete from public.room_used_cards u
    using public.cards c
    where u.room_id = target_room_id and u.card_id = c.id and c.deck = kind;
    select c.* into picked from public.cards c
    where c.deck = kind and c.is_active order by random() limit 1;
  end if;
  if picked.id is null then
    raise exception using errcode = 'P0001', message = 'no_cards';
  end if;
  perform private.use_card(target_room_id, picked.id);
  return case when kind = 'harf' then picked.prompt else picked.word end;
end;
$$;

revoke all on function private.say_config(text) from public, anon, authenticated;
revoke all on function private.say_letters() from public, anon, authenticated;
revoke all on function private.say_turn_seconds(text, integer) from public, anon, authenticated;
revoke all on function private.say_round_starter(integer) from public, anon, authenticated;
revoke all on function private.say_board(text) from public, anon, authenticated;
revoke all on function private.say_steps_used(jsonb) from public, anon, authenticated;
revoke all on function private.say_deal(uuid, text) from public, anon, authenticated;

-- Starts a two-table game from an accepted proposal (rooms_answer_game): round 1 ready.
create function private.start_say(r public.rooms, kind text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb := private.say_config(kind);
  next_game integer := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
begin
  update public.rooms
  set concept = kind, last_activity_at = now(),
      game_state = jsonb_build_object(
        'concept', kind, 'phase', 'playing', 'gameNo', next_game,
        'turnPhase', 'ready',
        'readyEndsAt', now() + make_interval(secs => (c ->> 'readySeconds')::integer),
        'roundNo', 1, 'totalRounds', (c ->> 'totalRounds')::integer,
        'prompt', private.say_deal(r.id, kind), 'letters', private.say_board(kind),
        'turnTable', private.say_round_starter(1), 'step', 0,
        'endsAt', null, 'objectionEndsAt', null, 'lastClaim', null,
        'objectionsLeft', jsonb_build_object(
          'owner', (c ->> 'objections')::integer, 'guest', (c ->> 'objections')::integer
        ),
        'scores', jsonb_build_object('owner', 0, 'guest', 0),
        'lastRound', null, 'timeouts', 0
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- The round is over (pure/sayChallenge.ts → endRound): the point, then the next prompt or the end.
-- It writes from r.game_state, which the caller may have changed (say_object spends an objection).
-- At the end: game_results for both accounts (score per table, won with more points), the room back
-- to chat with the scores in lastGame.
create function private.say_end_round(r public.rooms, winner text, reason text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := r.game_state ->> 'concept';
  c jsonb := private.say_config(kind);
  scores jsonb := r.game_state -> 'scores';
  last_round jsonb;
  round_no integer := (r.game_state ->> 'roundNo')::integer;
  owner_score integer;
  guest_score integer;
  ready boolean := (c ->> 'readyEachRound')::boolean;
  timeouts integer;
begin
  if winner is not null then
    scores := jsonb_set(scores, array[winner], to_jsonb((scores ->> winner)::integer + 1));
  end if;
  last_round := jsonb_build_object('roundNo', round_no, 'winner', winner, 'reason', reason);
  timeouts := coalesce((r.game_state ->> 'timeouts')::integer, 0)
              + case when reason = 'timeout' then 1 else 0 end;

  if round_no >= (r.game_state ->> 'totalRounds')::integer then
    owner_score := (scores ->> 'owner')::integer;
    guest_score := (scores ->> 'guest')::integer;
    insert into public.game_results (user_id, room_id, concept, mode, score, won)
    select ts.user_id, r.id, kind, kind,
           case when ts.id = r.owner_session_id then owner_score else guest_score end,
           case when ts.id = r.owner_session_id then owner_score > guest_score
                else guest_score > owner_score end
    from public.table_sessions ts
    where ts.id in (r.owner_session_id, r.guest_session_id);
    insert into public.game_events (room_id, type, payload)
    values (r.id, 'game_completed', jsonb_build_object('concept', kind, 'scores', scores));
    update public.rooms
    set concept = null, last_activity_at = now(),
        game_state = private.between_games(r.game_state, jsonb_build_object(
          'concept', kind, 'scores', scores, 'lastRound', last_round,
          'objectionsLeft', r.game_state -> 'objectionsLeft', 'timeouts', timeouts
        ))
    where id = r.id
    returning * into r;
    return r;
  end if;

  round_no := round_no + 1;
  -- From the state handed in (an objection has already spent its count there).
  update public.rooms
  set last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object(
        'roundNo', round_no, 'prompt', private.say_deal(r.id, kind),
        'letters', private.say_board(kind), 'turnTable', private.say_round_starter(round_no),
        'step', 0,
        'turnPhase', case when ready then 'ready' else 'running' end,
        'readyEndsAt', case when ready
          then now() + make_interval(secs => (c ->> 'readySeconds')::integer) end,
        'endsAt', case when ready then null
          else now() + make_interval(secs => private.say_turn_seconds(kind, round_no)) end,
        'objectionEndsAt', null, 'lastClaim', null, 'scores', scores, 'lastRound', last_round,
        'timeouts', timeouts
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.start_say(public.rooms, text) from public, anon, authenticated;
revoke all on function private.say_end_round(public.rooms, text, text)
  from public, anon, authenticated;

-- The caller's room with a two-table game of `kind` running, locked; the caller's side too.
create function private.say_room(target_user_id uuid, target_room_id uuid, kind text)
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
  if r.concept is distinct from kind or r.guest_session_id is null
     or r.game_state ->> 'phase' is distinct from 'playing' then
    return query select r, null::text;
    return;
  end if;
  return query select r, case when m.is_owner then 'owner' else 'guest' end;
end;
$$;

revoke all on function private.say_room(uuid, uuid, text) from public, anon, authenticated;

-- harf/begin, sarki/begin: the starting table at any time, either table after readyEndsAt. Anything
-- else leaves the room as it is (idempotent).
create function public.say_begin(target_user_id uuid, target_room_id uuid, kind text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
  r public.rooms;
begin
  select * into p from private.say_room(target_user_id, target_room_id, kind);
  r := p.room;
  if p.side is null or r.game_state ->> 'turnPhase' <> 'ready' then
    return r;
  end if;
  if p.side <> r.game_state ->> 'turnTable'
     and now() < (r.game_state ->> 'readyEndsAt')::timestamptz then
    return r;
  end if;
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnPhase', 'running', 'readyEndsAt', null,
        'endsAt', now() + make_interval(
          secs => private.say_turn_seconds(kind, (game_state ->> 'roundNo')::integer)
        )
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- harf/claim, sarki/said (pure/sayChallenge.ts → sayClaim): the table whose turn it is, on the
-- current round and step, before its clock runs out; harf names an open letter. A stale or second
-- call, or one from the other table, is ignored.
create function public.say_claim(
  target_user_id uuid,
  target_room_id uuid,
  kind text,
  round integer,
  step integer,
  letter text
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
  letters jsonb;
  objection_ends timestamptz;
  c jsonb := private.say_config(kind);
begin
  select * into p from private.say_room(target_user_id, target_room_id, kind);
  r := p.room;
  gs := r.game_state;
  if p.side is null or gs ->> 'turnPhase' <> 'running'
     or (gs ->> 'roundNo')::integer <> round or (gs ->> 'step')::integer <> step
     or gs ->> 'turnTable' <> p.side or now() >= (gs ->> 'endsAt')::timestamptz
     or private.say_steps_used(gs) then
    return r;
  end if;
  letters := gs -> 'letters';
  if kind = 'harf' then
    if not exists (
      select 1 from jsonb_array_elements(letters) l
      where l ->> 'letter' = letter and not (l ->> 'closed')::boolean
    ) then
      return r;
    end if;
    select jsonb_agg(
             case when l ->> 'letter' = letter then jsonb_set(l, '{closed}', 'true') else l end
             order by o)
      into letters
    from jsonb_array_elements(gs -> 'letters') with ordinality as x(l, o);
  end if;
  objection_ends := now() + make_interval(secs => (c ->> 'objectionSeconds')::integer);
  gs := gs || jsonb_build_object(
    'letters', letters, 'step', step + 1,
    'turnTable', case when p.side = 'owner' then 'guest' else 'owner' end,
    'lastClaim', jsonb_build_object(
      'table', p.side, 'step', step, 'letter', case when kind = 'harf' then letter end
    ),
    'objectionEndsAt', objection_ends,
    'endsAt', now() + make_interval(secs => private.say_turn_seconds(kind, round))
  );
  -- Nothing left to claim: only the objection window remains, then advance settles the round.
  if private.say_steps_used(gs) then
    gs := gs || jsonb_build_object('endsAt', objection_ends);
  end if;
  update public.rooms set last_activity_at = now(), game_state = gs
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- harf/object, sarki/object (pure/sayChallenge.ts → sayObject): the other table, inside the
-- window. With no objection left: no_objections_left. A stale or second call is ignored.
create function public.say_object(
  target_user_id uuid,
  target_room_id uuid,
  kind text,
  round integer,
  step integer
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
  select * into p from private.say_room(target_user_id, target_room_id, kind);
  r := p.room;
  gs := r.game_state;
  if p.side is null or gs ->> 'turnPhase' <> 'running' or gs -> 'lastClaim' = 'null'::jsonb
     or gs -> 'lastClaim' is null
     or (gs ->> 'roundNo')::integer <> round or (gs -> 'lastClaim' ->> 'step')::integer <> step
     or gs -> 'lastClaim' ->> 'table' = p.side
     or now() >= (gs ->> 'objectionEndsAt')::timestamptz then
    return r;
  end if;
  if (gs -> 'objectionsLeft' ->> p.side)::integer <= 0 then
    raise exception using errcode = 'P0001', message = 'no_objections_left';
  end if;
  r.game_state := jsonb_set(
    gs, array['objectionsLeft', p.side], to_jsonb((gs -> 'objectionsLeft' ->> p.side)::integer - 1)
  );
  return private.say_end_round(r, p.side, 'objection');
end;
$$;

-- harf/advance, sarki/advance (pure/sayChallenge.ts → sayAdvance): either table once the clock
-- ran out. Before that, in the ready state or with no game: the room as it is (idempotent).
create function public.say_advance(target_user_id uuid, target_room_id uuid, kind text)
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
  select * into p from private.say_room(target_user_id, target_room_id, kind);
  r := p.room;
  gs := r.game_state;
  if p.side is null or gs ->> 'turnPhase' <> 'running'
     or now() < (gs ->> 'endsAt')::timestamptz then
    return r;
  end if;
  if private.say_steps_used(gs) then
    if kind = 'harf' then
      return private.say_end_round(r, gs -> 'lastClaim' ->> 'table', 'board');
    end if;
    return private.say_end_round(r, null, 'lines');
  end if;
  return private.say_end_round(
    r, case when gs ->> 'turnTable' = 'owner' then 'guest' else 'owner' end, 'timeout'
  );
end;
$$;

-- harf/start, sarki/start: the one-table game's prompts (one per round); the phone runs the game
-- for Takım A and B (§20.3). The room's activity becomes the game until "Oyunu bitir" or a second
-- table joins.
create function public.say_local_deck(target_user_id uuid, target_room_id uuid, kind text)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  prompts text[] := '{}';
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.guest_session_id is not null then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  if r.concept is not null and r.concept <> kind then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;
  for i in 1 .. (private.say_config(kind) ->> 'totalRounds')::integer loop
    prompts := prompts || private.say_deal(r.id, kind);
  end loop;
  update public.rooms
  set concept = kind, last_activity_at = now(),
      game_state = private.between_games(game_state, null)
  where id = r.id;
  return prompts;
end;
$$;

revoke all on function public.say_begin(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.say_claim(uuid, uuid, text, integer, integer, text)
  from public, anon, authenticated;
revoke all on function public.say_object(uuid, uuid, text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.say_advance(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.say_local_deck(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.say_begin(uuid, uuid, text) to service_role;
grant execute on function public.say_claim(uuid, uuid, text, integer, integer, text)
  to service_role;
grant execute on function public.say_object(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.say_advance(uuid, uuid, text) to service_role;
grant execute on function public.say_local_deck(uuid, uuid, text) to service_role;

-- Proposals: start the new games on acceptance ------------------------------------------------------
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
  return private.deal_sohbet(r, cooldown_ms);
end;
$$;

-- "Oyunu bitir": a Harf or Şarkı game still playing keeps its scores and where it stopped.
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
  if r.concept in ('harf', 'sarki') and r.game_state ->> 'phase' = 'playing' then
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
