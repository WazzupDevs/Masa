-- v3 step 4 (docs/SPEC_V3.md §6): two-table Tabu has two modes, set for the whole game from the two
-- headcounts (S3; pure/tabu.ts → tabuMode is the rule, an integration test checks this function
-- against it):
-- - refereed (the former 'voice'): team = table, the other table judges; both tables get the card
--   list. Unchanged.
-- - cooperative: one table is a single person. One team, one score against the clock. Only the
--   describing table gets the card list and presses Doğru / Pas / Tabu; the guessing table never
--   receives a card before it is closed (tabu/turn-cards answers it `not_describer`). Results: the
--   same score for both accounts, won = null.
-- game_results keeps 'voice' for the refereed mode (the badge counts stay as they are) and adds
-- 'cooperative', which no win badge counts.

alter table public.game_results drop constraint game_results_mode_check;
alter table public.game_results
  add constraint game_results_mode_check check (mode in ('voice', 'text', 'cooperative'));

create function private.tabu_mode(owner_headcount integer, guest_headcount integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when least(owner_headcount, guest_headcount) <= 1 then 'cooperative'
              else 'refereed' end;
$$;

revoke all on function private.tabu_mode(integer, integer) from public, anon, authenticated;

-- A game running at deploy time keeps going, under the new name.
update public.rooms
set game_state = game_state || jsonb_build_object('mode', 'refereed')
where concept = 'tabu' and game_state ->> 'mode' = 'voice';

-- The mode is decided here, once per game, and written to game_state.
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
      game_state = r.game_state || jsonb_build_object('turnEndsAt', turn.ends_at)
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- tabu/turn-cards: the describing table always; the other table only in the refereed mode, where it
-- judges. A cooperative guessing table gets no card (not_describer).
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
  return query
    select (p.turn).turn_no, (ord - 1)::integer, c.word, c.forbidden
    from unnest((p.turn).card_ids) with ordinality as list(card_id, ord)
    join public.cards c on c.id = list.card_id
    order by ord;
end;
$$;

-- tabu/mark. Refereed: Tabu only the judging table, Pas only the describing table, Doğru either;
-- points to the describing table. Cooperative: only the describing table, all three; points to the
-- team. Ignored without an error (the room is returned unchanged): another turn, a card the server
-- has already closed, a card ahead of the server, or past the list.
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

-- The last turn ends the game: refereed as before (each table's score, won with more points);
-- cooperative the team's score for both accounts, won = null. The room returns to chat with the
-- result kept as lastGame (the scores object as it was: {owner, guest} or {team}).
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
  if now() < t.ends_at then
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

  next_no := t.turn_no + 1;
  next_turn := private.open_turn(r, next_no, t.game_no);
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnNo', next_no, 'turnEndsAt', next_turn.ends_at, 'passesUsed', 0, 'cardIndex', 0,
        'describingTable', case when next_no % 2 = 1 then 'owner' else 'guest' end
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;
