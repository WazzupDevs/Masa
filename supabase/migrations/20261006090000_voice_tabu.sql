-- v2 step 5 (docs/SPEC_V2.md §8.2, project owner's corrections): two-table Tabu is played face to
-- face only. Team = table. The written clue/guess flow is gone (§8.3: no old APKs to keep).
--
-- Latency: at the start of a turn both tables get the turn's ordered card list (room members only,
-- current turn only). A press moves the pressing phone to the next card at once; the server
-- checks it against the card index and publishes the room row; the other phone catches up. Each
-- action is tied to a card index and is idempotent: a second action on the same card, or one for
-- a turn or card the server has moved past, is ignored without an error. The server's order wins.
--
-- Who may do what: Tabu only the judging table, Pas only the describing table, Doğru either.
-- Points go to the describing table: Doğru +1, Tabu −1, Pas 0 (at most maxPasses per turn).

-- The written flow ------------------------------------------------------------------------------
drop function public.tabu_add_clue(uuid, uuid, uuid, text);
drop function public.tabu_guess(uuid, uuid, uuid, text, boolean);
drop function public.tabu_pass(uuid, uuid);
drop function public.tabu_current_card(uuid, uuid);
drop function public.tabu_start(uuid, uuid, integer, integer, integer);

delete from public.game_events where type in ('clue', 'guess');
alter table public.game_events drop constraint game_events_type_check;
alter table public.game_events
  add constraint game_events_type_check check (
    type in ('correct', 'taboo', 'pass', 'card_closed', 'turn_started', 'game_completed')
  );

-- A written game still running at deploy time is finished as it is.
update public.rooms
set game_state = game_state || jsonb_build_object('phase', 'finished')
where concept = 'tabu' and game_state ->> 'phase' = 'playing'
  and coalesce(game_state ->> 'mode', 'text') <> 'voice';

-- The card list of a turn -----------------------------------------------------------------------
alter table public.tabu_turns
  add column card_ids uuid[] not null default '{}',
  add column card_index integer not null default 0;

-- `count` cards for one turn, none repeated within the room while the deck lasts.
create function private.deal_turn(target_room_id uuid, count integer)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[] := '{}';
  picked public.cards;
begin
  for i in 1..count loop
    picked := private.pick_card(target_room_id, 'tabu');
    exit when picked.id is null;
    ids := ids || picked.id;
  end loop;
  return ids;
end;
$$;

revoke all on function private.deal_turn(uuid, integer) from public, anon, authenticated;

-- Opens a turn: the card list, the timer, the public state. Returns the turn.
create function private.open_turn(r public.rooms, turn_number integer, game_number integer)
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
    (room_id, game_no, turn_no, describer_session_id, card_id, card_ids, card_index, ends_at)
  values (r.id, game_number, turn_number, describer, ids[1], ids, 0,
          now() + make_interval(secs => (r.game_state ->> 'turnSeconds')::integer))
  returning * into turn;
  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, turn.id, describer, 'turn_started', jsonb_build_object('turnNo', turn_number));
  return turn;
end;
$$;

revoke all on function private.open_turn(public.rooms, integer, integer)
  from public, anon, authenticated;

-- tabu/start (service role): the owner starts; the owner's table describes first.
create function public.tabu_start(
  target_user_id uuid,
  target_room_id uuid,
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
  m record;
  r public.rooms;
  next_game integer;
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
  r.game_state := jsonb_build_object(
    'concept', 'tabu', 'mode', 'voice', 'phase', 'playing', 'gameNo', next_game,
    'turnNo', 1, 'totalTurns', total_turns, 'turnSeconds', turn_seconds,
    'cardsPerTurn', cards_per_turn, 'describingTable', 'owner',
    'scores', jsonb_build_object('owner', 0, 'guest', 0),
    'passesUsed', 0, 'maxPasses', max_passes, 'cardIndex', 0
  );
  turn := private.open_turn(r, 1, next_game);

  update public.rooms
  set last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object('turnEndsAt', turn.ends_at)
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- tabu/turn-cards (service role): the ordered card list of the current turn, for the two tables of
-- the room only (room_membership raises not_in_room for anyone else).
create function public.tabu_turn_cards(target_user_id uuid, target_room_id uuid)
returns table (turn_no integer, card_index integer, word text, forbidden text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  return query
    select (p.turn).turn_no, (ord - 1)::integer, c.word, c.forbidden
    from unnest((p.turn).card_ids) with ordinality as list(card_id, ord)
    join public.cards c on c.id = list.card_id
    order by ord;
end;
$$;

-- tabu/mark (service role). Ignored without an error (the room is returned unchanged): another
-- turn, a card the server has already closed, a card ahead of the server, or past the list.
create function public.tabu_mark(
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
  side text;
  delta integer;
  closed_word text;
begin
  if result not in ('correct', 'taboo', 'pass') then
    raise exception using errcode = 'P0001', message = 'bad_request';
  end if;
  select * into p from private.tabu_playing_room(target_user_id, target_room_id);
  r := p.room;
  t := p.turn;
  describing := t.describer_session_id = p.session_id;

  if result = 'taboo' and describing then
    raise exception using errcode = 'P0001', message = 'not_judge';
  end if;
  if result = 'pass' and not describing then
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

  side := r.game_state ->> 'describingTable';
  delta := case result when 'correct' then 1 when 'taboo' then -1 else 0 end;
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
        'scores', jsonb_set(game_state -> 'scores', array[side],
                            to_jsonb((game_state -> 'scores' ->> side)::integer + delta)),
        'passesUsed', t.passes_used + case when result = 'pass' then 1 else 0 end,
        'cardIndex', index + 1
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- tabu/end-turn: idempotent. Tables alternate (odd turns the owner). At the end each account gets
-- its game_results row: its table's score; won only with more points than the other table.
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

  if t.turn_no >= (r.game_state ->> 'totalTurns')::integer then
    update public.rooms
    set last_activity_at = now(), game_state = game_state || jsonb_build_object('phase', 'finished')
    where id = r.id
    returning * into r;

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

revoke all on function public.tabu_start(uuid, uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.tabu_turn_cards(uuid, uuid) from public, anon, authenticated;
revoke all on function public.tabu_mark(uuid, uuid, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.tabu_start(uuid, uuid, integer, integer, integer, integer)
  to service_role;
grant execute on function public.tabu_turn_cards(uuid, uuid) to service_role;
grant execute on function public.tabu_mark(uuid, uuid, integer, integer, text) to service_role;
