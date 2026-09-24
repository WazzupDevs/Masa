-- Fixes from the pre-merge review of M2–M7.

-- 1. Reveal timing ------------------------------------------------------------------------------
-- Only a mutual yes is revealed at once. Every other outcome (no, no answer, a table leaving) is
-- revealed at reveal_ends_at, so a table that said yes cannot tell them apart, by rows or by timing.

-- The second answer closes the room only when both said yes; otherwise the room stays 'ending'
-- until reveal_finalize (or the cron safety net) after reveal_ends_at.
create or replace function public.reveal_decide(
  target_user_id uuid,
  target_room_id uuid,
  wants boolean,
  token jsonb
)
returns public.rooms
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
  if r.status <> 'ending' or now() >= r.reveal_ends_at then
    raise exception using errcode = 'P0001', message = 'reveal_closed';
  end if;

  insert into public.reveal_decisions (room_id, session_id, wants_meet)
  values (r.id, m.session_id, wants)
  on conflict (room_id, session_id) do nothing;

  if (
    select count(*) filter (where wants_meet) from public.reveal_decisions where room_id = r.id
  ) = 2 then
    return private.finish_reveal(r.id, token);
  end if;
  return r;
end;
$$;

-- An 'ending' room no longer holds its tables: a table that answered (or leaves) can go on at
-- once, while the room itself stays 'ending' for the other table until reveal_ends_at.
create or replace function private.open_room_of_session(target_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.rooms
  where status in ('waiting', 'active')
    and (owner_session_id = target_session_id or guest_session_id = target_session_id)
  limit 1;
$$;

drop index public.rooms_one_open_per_owner;
drop index public.rooms_one_open_per_guest;
create unique index rooms_one_open_per_owner on public.rooms (owner_session_id)
  where status in ('waiting', 'active');
create unique index rooms_one_open_per_guest on public.rooms (guest_session_id)
  where status in ('waiting', 'active');

-- Leaving, ending a table or blocking never closes an 'ending' room early: that would reveal
-- "none" before reveal_ends_at.
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
  where owner_session_id = target_session_id and status in ('waiting', 'active');
  get diagnostics closed_count = row_count;

  update public.rooms
  set guest_session_id = null, guest_alias = null, guest_headcount = null,
      status = 'waiting', waiting_since = now(), last_activity_at = now(),
      game_state = case when concept = 'tabu' then '{}'::jsonb else game_state end
  where guest_session_id = target_session_id and status in ('waiting', 'active');
  get diagnostics released_count = row_count;

  return closed_count + released_count;
end;
$$;

-- The window no longer closes early, so the cron safety net runs right after reveal_ends_at.
create or replace function private.close_expired_reveals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_id uuid;
  n integer := 0;
begin
  for room_id in
    select id from public.rooms
    where status = 'ending' and reveal_ends_at <= now()
    for update skip locked
  loop
    perform private.finish_reveal(room_id, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 2. A finished Tabu game keeps the room ------------------------------------------------------------
-- The score is shown and the owner may start another game (tabu_start accepts phase 'finished').
-- Only "Odayı bitir" opens the reveal window (MVP_SPEC §4.6).
drop function public.tabu_end_turn(uuid, uuid, integer);

create function public.tabu_end_turn(
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

revoke all on function public.tabu_end_turn(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tabu_end_turn(uuid, uuid) to service_role;

-- 3. Profanity terms that match only as whole words -----------------------------------------------
-- Longer terms an everyday word starts with ("ananı" / "ananın"). Seeded from
-- content/profanity-tr.json `wholeWords`; still read only by server code.
alter table public.profanity_terms add column whole_word boolean not null default false;

-- 4. Blocks without the other account's id --------------------------------------------------------
-- Rule 4: no identifier of another table reaches the client. The blocker reads its rows by their
-- own id (alias seen when blocking, date) and unblocks by that id; blocked_id stays server-side.
alter table public.blocks add column id uuid not null default gen_random_uuid();
alter table public.blocks add constraint blocks_id_key unique (id);

revoke select on table public.blocks from authenticated;
grant select (id, blocked_alias, created_at) on table public.blocks to authenticated;

drop function public.safety_unblock(uuid, uuid);

create function public.safety_unblock(target_user_id uuid, target_block_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.blocks
    where blocker_id = target_user_id and id = target_block_id
    returning 1
  )
  select exists (select 1 from removed);
$$;

revoke all on function public.safety_unblock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.safety_unblock(uuid, uuid) to service_role;

-- 5. Private Realtime channels ----------------------------------------------------------------------
-- Every channel is private (clients join with `private: true`, the server broadcasts with
-- `private: true`); these policies on realtime.messages decide who may join and who may send:
--   venue:<venue_id>      tables with an active session at the venue; only the server sends
--   session:<session_id>  that table only; only the server sends
--   room:<room_id>, messages:<room_id>, game:<room_id>, presence:<room_id>
--                         the room's two tables, who may also send (presence)
create function private.realtime_topic_allowed(channel_topic text, sending boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := split_part(channel_topic, ':', 1);
  target text := substr(channel_topic, length(kind) + 2);
  target_id uuid;
begin
  if target !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  target_id := target::uuid;

  if kind = 'venue' then
    return not sending and exists (
      select 1 from public.table_sessions
      where user_id = (select auth.uid()) and venue_id = target_id and status = 'active'
    );
  elsif kind = 'session' then
    return not sending and exists (
      select 1 from public.table_sessions
      where id = target_id and user_id = (select auth.uid())
    );
  elsif kind in ('room', 'messages', 'game', 'presence') then
    return exists (
      select 1
      from public.rooms r
      join public.table_sessions ts on ts.id in (r.owner_session_id, r.guest_session_id)
      where r.id = target_id and ts.user_id = (select auth.uid())
    );
  end if;
  return false;
end;
$$;

revoke all on function private.realtime_topic_allowed(text, boolean) from public, anon;
grant execute on function private.realtime_topic_allowed(text, boolean) to authenticated;

create policy "realtime: allowed tables join"
  on realtime.messages for select
  to authenticated
  using (private.realtime_topic_allowed((select realtime.topic()), false));

create policy "realtime: room members send"
  on realtime.messages for insert
  to authenticated
  with check (private.realtime_topic_allowed((select realtime.topic()), true));
