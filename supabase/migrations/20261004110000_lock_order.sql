-- One lock order for every function (CLAUDE.md, invariant 10):
--   profiles → table_sessions → rooms → join_requests → a room's rows (tabu_turns, room_used_cards,
--   reveal_decisions, messages, game_events).
-- A table session is locked FOR NO KEY UPDATE, never FOR UPDATE: FOR UPDATE also blocks the
-- KEY SHARE that a foreign key check takes on the row it references (20261004100000). Scheduled jobs
-- skip rows a user action holds instead of waiting for them.

-- rooms_respond took the request, then the room, then the requester's session. The requester
-- leaving at that moment (session, then its rooms) closed a cycle. It now reads the request
-- without a lock, locks the requester's session, then the room, then the request, and checks the
-- request again under the lock.
create or replace function public.rooms_respond(
  target_user_id uuid,
  target_request_id uuid,
  accept boolean
)
returns public.join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  jr public.join_requests;
  r public.rooms;
  owner public.table_sessions;
  requester public.table_sessions;
begin
  select * into jr from public.join_requests where id = target_request_id;
  if jr.id is null then
    raise exception using errcode = 'P0001', message = 'request_not_found';
  end if;

  select * into requester from public.table_sessions
  where id = jr.requester_session_id
  for no key update;
  select * into r from public.rooms where id = jr.room_id for update;
  select * into jr from public.join_requests where id = target_request_id for update;
  select * into owner from public.table_sessions where id = r.owner_session_id;

  if jr.id is null or owner.user_id is distinct from target_user_id then
    raise exception using errcode = 'P0001', message = 'request_not_found';
  end if;
  if jr.status <> 'pending' or jr.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'request_expired';
  end if;

  if not accept then
    update public.join_requests set status = 'declined', responded_at = now()
    where id = jr.id returning * into jr;
    return jr;
  end if;

  if r.status <> 'waiting'
    or r.guest_session_id is not null
    or owner.status <> 'active' or owner.expires_at <= now()
    or requester.status <> 'active' or requester.expires_at <= now()
    or requester.venue_id <> r.venue_id
    or private.open_room_of_session(requester.id) is not null
    or private.is_blocked_between(owner.user_id, requester.user_id)
  then
    raise exception using errcode = 'P0001', message = 'request_expired';
  end if;

  update public.rooms
  set guest_session_id = requester.id, guest_alias = requester.alias,
      guest_headcount = requester.headcount, status = 'active', last_activity_at = now()
  where id = r.id;

  update public.join_requests set status = 'declined', responded_at = now()
  where room_id = r.id and status = 'pending' and id <> jr.id;

  update public.join_requests set status = 'accepted', responded_at = now()
  where id = jr.id returning * into jr;
  return jr;
end;
$$;
revoke all on function public.rooms_respond(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.rooms_respond(uuid, uuid, boolean) to service_role;

-- Ending a table: FOR UPDATE → FOR NO KEY UPDATE.
create or replace function public.end_table_session(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_session_id uuid;
  ended boolean := false;
begin
  for old_session_id in
    select id from public.table_sessions
    where user_id = target_user_id and status = 'active'
    for no key update
  loop
    perform private.release_rooms_of_session(old_session_id);
    update public.table_sessions set status = 'ended', ended_at = now() where id = old_session_id;
    ended := true;
  end loop;
  return ended;
end;
$$;
revoke all on function public.end_table_session(uuid) from public, anon, authenticated;
grant execute on function public.end_table_session(uuid) to service_role;

-- Checking in again ends the old table: FOR UPDATE → FOR NO KEY UPDATE.
create or replace function public.start_table_session(
  target_user_id uuid,
  target_venue_id uuid,
  new_alias text,
  new_headcount smallint,
  consent_version text,
  accuracy_m real default null,
  new_participation text default 'anonymous'
)
returns public.table_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.table_sessions;
  old_session_id uuid;
begin
  update public.profiles
  set location_consent_at = now(), location_consent_version = consent_version
  where id = target_user_id
    and location_consent_version is distinct from consent_version;

  for old_session_id in
    select id from public.table_sessions
    where user_id = target_user_id and status = 'active'
    for no key update
  loop
    perform private.release_rooms_of_session(old_session_id);
    update public.table_sessions set status = 'ended', ended_at = now() where id = old_session_id;
  end loop;

  insert into public.table_sessions
    (user_id, venue_id, alias, headcount, gps_accuracy_m, participation, expires_at)
  values
    (target_user_id, target_venue_id, new_alias, new_headcount, accuracy_m, new_participation,
     now() + interval '4 hours')
  returning * into created;

  return created;
end;
$$;
revoke all on function public.start_table_session(uuid, uuid, text, smallint, text, real, text)
  from public, anon, authenticated;
grant execute on function public.start_table_session(uuid, uuid, text, smallint, text, real, text)
  to service_role;

-- Scheduled jobs -----------------------------------------------------------------------------------
create or replace function private.end_expired_table_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_session_id uuid;
  n integer := 0;
begin
  for old_session_id in
    select id from public.table_sessions
    where status = 'active' and expires_at <= now()
    for no key update skip locked
  loop
    perform private.release_rooms_of_session(old_session_id);
    update public.table_sessions set status = 'ended', ended_at = expires_at where id = old_session_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- These updated every matching row in scan order, waiting on any a user action held.
create or replace function private.close_idle_rooms(idle_minutes integer default 10)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.rooms set status = 'closed', closed_at = now()
  where id in (
    select id from public.rooms
    where status in ('waiting', 'active')
      and last_activity_at <= now() - make_interval(mins => idle_minutes)
    for update skip locked
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function private.expire_join_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.join_requests set status = 'expired'
  where id in (
    select id from public.join_requests
    where status = 'pending' and expires_at <= now()
    for update skip locked
  );
  get diagnostics n = row_count;
  return n;
end;
$$;
