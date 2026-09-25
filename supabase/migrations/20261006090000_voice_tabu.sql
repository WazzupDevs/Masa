-- v2 step 5 (docs/SPEC_V2.md §8.2): two-table voice Tabu. Team = table: the describing table
-- talks, the other table judges on its phone (Doğru +1, Tabu −1, Pas 0 within the pass limit).
-- Both tables get the card; nobody outside the room does. The server keeps the time, the turn
-- order, the pass limit and the scores (rule 3). The written clue/guess flow stays for one more
-- release for older APKs (§8.3): a start without mode 'voice' still opens a text game.

alter table public.game_events drop constraint game_events_type_check;
alter table public.game_events
  add constraint game_events_type_check check (
    type in ('clue', 'guess', 'correct', 'taboo', 'pass', 'card_closed', 'turn_started',
             'game_completed')
  );

create function private.is_voice(r public.rooms)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(r.game_state ->> 'mode', 'text') = 'voice';
$$;

revoke all on function private.is_voice(public.rooms) from public, anon, authenticated;

-- tabu/start { mode: 'voice' } (service role): the owner starts; the owner's table describes first.
create function public.tabu_start_voice(
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
  next_game integer;
  first_card public.cards;
  turn public.tabu_turns;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
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

  next_game := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
  first_card := private.pick_card(r.id, 'tabu');
  insert into public.tabu_turns (room_id, game_no, turn_no, describer_session_id, card_id, ends_at)
  values (r.id, next_game, 1, r.owner_session_id, first_card.id,
          now() + make_interval(secs => turn_seconds))
  returning * into turn;

  update public.rooms
  set last_activity_at = now(),
      game_state = jsonb_build_object(
        'concept', 'tabu', 'mode', 'voice', 'phase', 'playing', 'gameNo', next_game,
        'turnNo', 1, 'totalTurns', total_turns, 'turnSeconds', turn_seconds,
        'describingTable', 'owner', 'turnEndsAt', turn.ends_at,
        'scores', jsonb_build_object('owner', 0, 'guest', 0),
        'passesUsed', 0, 'maxPasses', max_passes
      )
  where id = r.id
  returning * into r;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, turn.id, r.owner_session_id, 'turn_started', jsonb_build_object('turnNo', 1));
  return r;
end;
$$;

-- The card of the current turn. Voice: both tables of the room (the judge must see it). Text:
-- only the describer, as before.
create or replace function public.tabu_current_card(target_user_id uuid, target_room_id uuid)
returns table (card_id uuid, word text, forbidden text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  if not private.is_voice(p.room) and (p.turn).describer_session_id <> p.session_id then
    raise exception using errcode = 'P0001', message = 'not_describer';
  end if;
  return query select c.id, c.word, c.forbidden from public.cards c where c.id = (p.turn).card_id;
end;
$$;

-- tabu/judge (service role): only the table that is not describing, only before the turn ends,
-- only on the card it sees (checked_card_id). correct: +1 to the describing table; taboo: −1;
-- pass: 0, at most maxPasses per turn. Every result closes the card and deals the next one.
create function public.tabu_judge(
  target_user_id uuid,
  target_room_id uuid,
  checked_card_id uuid,
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
  side text;
  delta integer;
begin
  if result not in ('correct', 'taboo', 'pass') then
    raise exception using errcode = 'P0001', message = 'bad_request';
  end if;
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  r := p.room;
  if not private.is_voice(r) then
    raise exception using errcode = 'P0001', message = 'no_game';
  end if;
  if (p.turn).describer_session_id = p.session_id then
    raise exception using errcode = 'P0001', message = 'not_judge';
  end if;
  if now() >= (p.turn).ends_at then
    raise exception using errcode = 'P0001', message = 'turn_over';
  end if;
  if (p.turn).card_id <> checked_card_id then
    raise exception using errcode = 'P0001', message = 'card_changed';
  end if;
  if result = 'pass' and (p.turn).passes_used >= (r.game_state ->> 'maxPasses')::integer then
    raise exception using errcode = 'P0001', message = 'no_passes_left';
  end if;

  side := r.game_state ->> 'describingTable';
  delta := case result when 'correct' then 1 when 'taboo' then -1 else 0 end;

  insert into public.game_events (room_id, turn_id, session_id, type)
  values (r.id, (p.turn).id, p.session_id, result);
  perform private.tabu_close_card(r, p.turn, result, true);
  update public.tabu_turns
  set score = score + delta,
      passes_used = passes_used + case when result = 'pass' then 1 else 0 end
  where id = (p.turn).id;

  update public.rooms
  set last_activity_at = now(),
      game_state = game_state
        || jsonb_build_object(
             'scores', jsonb_set(game_state -> 'scores', array[side],
                                 to_jsonb((game_state -> 'scores' ->> side)::integer + delta)),
             'passesUsed', (p.turn).passes_used + case when result = 'pass' then 1 else 0 end
           )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- tabu/end-turn: the same idempotent step for both modes. Tables alternate: odd turns the owner,
-- even turns the guest. At the end of a voice game each account gets its game_results row
-- (its table's score; won only with more points than the other table).
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
  next_describer uuid;
  next_card public.cards;
  next_turn public.tabu_turns;
  owner_score integer;
  guest_score integer;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
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

    if private.is_voice(r) then
      owner_score := (r.game_state -> 'scores' ->> 'owner')::integer;
      guest_score := (r.game_state -> 'scores' ->> 'guest')::integer;
      insert into public.game_results (user_id, room_id, concept, mode, score, won)
      select ts.user_id, r.id, 'tabu', 'voice',
             case when ts.id = r.owner_session_id then owner_score else guest_score end,
             case when ts.id = r.owner_session_id then owner_score > guest_score
                  else guest_score > owner_score end
      from public.table_sessions ts
      where ts.id in (r.owner_session_id, r.guest_session_id);
      insert into public.game_events (room_id, type, payload)
      values (r.id, 'game_completed', jsonb_build_object('scores', r.game_state -> 'scores'));
    else
      insert into public.game_events (room_id, type, payload)
      values (r.id, 'game_completed', jsonb_build_object('score', (r.game_state ->> 'score')::integer));
    end if;
    return r;
  end if;

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
        'turnNo', next_no, 'turnEndsAt', next_turn.ends_at, 'passesUsed', 0
      ) || case
        when private.is_voice(r) then
          jsonb_build_object('describingTable', case when next_no % 2 = 1 then 'owner' else 'guest' end)
        else jsonb_build_object('describerSessionId', next_describer)
      end
  where id = r.id
  returning * into r;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, next_turn.id, next_describer, 'turn_started', jsonb_build_object('turnNo', next_no));
  return r;
end;
$$;

revoke all on function public.tabu_start_voice(uuid, uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tabu_judge(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.tabu_start_voice(uuid, uuid, integer, integer, integer)
  to service_role;
grant execute on function public.tabu_judge(uuid, uuid, uuid, text) to service_role;
