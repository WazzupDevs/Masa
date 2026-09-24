-- M3: rooms, venue lobby, join requests, blocks (lobby filter), push tokens.
-- State transitions are service-role-only functions that lock the rows they change; the `rooms`
-- Edge Function calls them. Clients only read (RLS) and never write.

-- Push token -------------------------------------------------------------------
alter table public.profiles add column push_token text;

-- blocks -------------------------------------------------------------------------
-- User based and two-way (MVP_SPEC §8). blocked_alias is the table alias the blocker saw, for the
-- "Engellenenler" list; aliases are the only identity shown to other tables.
create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  blocked_alias text not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on table public.blocks from anon, authenticated;
grant select on table public.blocks to authenticated;

create policy "blocks: blocker reads own rows"
  on public.blocks for select
  to authenticated
  using ((select auth.uid()) = blocker_id);

create function private.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

revoke all on function private.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- rooms --------------------------------------------------------------------------
-- Aliases and headcounts are copied from the tables: they are all another table may see
-- (MVP_SPEC rule 4), and members cannot read each other's table_sessions rows.
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  owner_session_id uuid not null references public.table_sessions (id) on delete cascade,
  owner_alias text not null,
  owner_headcount smallint not null,
  guest_session_id uuid references public.table_sessions (id) on delete set null,
  guest_alias text,
  guest_headcount smallint,
  concept text not null check (concept in ('tabu', 'sohbet')),
  visibility text not null check (visibility in ('private', 'open')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'ending', 'closed')),
  waiting_since timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  check ((status = 'closed') = (closed_at is not null)),
  check (owner_session_id is distinct from guest_session_id)
);

-- A table is in at most one room at a time (MVP_SPEC §4.3).
create unique index rooms_one_open_per_owner on public.rooms (owner_session_id)
  where status <> 'closed';
create unique index rooms_one_open_per_guest on public.rooms (guest_session_id)
  where status <> 'closed';
create index rooms_lobby_idx on public.rooms (venue_id, waiting_since)
  where status = 'waiting' and visibility = 'open';
create index rooms_idle_idx on public.rooms (last_activity_at) where status <> 'closed';

alter table public.rooms enable row level security;
revoke all on table public.rooms from anon, authenticated;
grant select on table public.rooms to authenticated;

create function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    join public.table_sessions ts on ts.id in (r.owner_session_id, r.guest_session_id)
    where r.id = target_room_id and ts.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_member(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_room_member(uuid) to authenticated;

create policy "rooms: members read"
  on public.rooms for select
  to authenticated
  using (private.is_room_member(id));

alter publication supabase_realtime add table public.rooms;

-- join_requests ---------------------------------------------------------------------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  requester_session_id uuid not null references public.table_sessions (id) on delete cascade,
  requester_alias text not null,
  requester_headcount smallint not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  responded_at timestamptz
);

create unique index join_requests_one_pending_per_requester
  on public.join_requests (requester_session_id) where status = 'pending';
create index join_requests_requester_idx on public.join_requests (requester_session_id, created_at);
create index join_requests_room_idx on public.join_requests (room_id, status);

alter table public.join_requests enable row level security;
revoke all on table public.join_requests from anon, authenticated;
grant select on table public.join_requests to authenticated;

-- Only the room owner reads the raw rows. The requester never does: raw status and
-- responded_at would tell a decline from a timeout (MVP_SPEC rule 5).
create function private.is_room_owner(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    join public.table_sessions ts on ts.id = r.owner_session_id
    where r.id = target_room_id and ts.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_owner(uuid) from public, anon;
grant execute on function private.is_room_owner(uuid) to authenticated;

create policy "join_requests: room owner reads"
  on public.join_requests for select
  to authenticated
  using (private.is_room_owner(room_id));

-- The requester's view. A decline and a timeout look the same, at the same moment: until
-- expires_at the request reads 'pending' either way, afterwards 'unavailable'. Only an accept
-- shows immediately. No responded_at, no raw status.
create view public.my_join_requests
with (security_barrier = true)
as
  select
    jr.id,
    jr.room_id,
    case
      when jr.status = 'accepted' then 'accepted'
      when jr.expires_at > now() then 'pending'
      else 'unavailable'
    end as status,
    jr.created_at,
    jr.expires_at
  from public.join_requests jr
  join public.table_sessions ts on ts.id = jr.requester_session_id
  where ts.user_id = (select auth.uid());

revoke all on public.my_join_requests from anon, authenticated;
grant select on public.my_join_requests to authenticated;

-- Lobby ---------------------------------------------------------------------------
-- Read-only, security definer (MVP_SPEC §9): open waiting rooms at the caller's venue, only the
-- safe columns, blocks filtered both ways. Empty unless the caller has an active table there.
-- Rooms the caller's table already got an 'unavailable' answer from are left out.
create function public.venue_lobby(target_venue_id uuid)
returns table (
  room_id uuid,
  alias text,
  headcount smallint,
  concept text,
  waiting_since timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select ts.id as session_id, ts.user_id
    from public.table_sessions ts
    where ts.user_id = (select auth.uid())
      and ts.venue_id = target_venue_id
      and ts.status = 'active'
      and ts.expires_at > now()
  )
  select r.id, r.owner_alias, r.owner_headcount, r.concept, r.waiting_since
  from public.rooms r
  join public.table_sessions owner on owner.id = r.owner_session_id
  cross join me
  where r.venue_id = target_venue_id
    and r.status = 'waiting'
    and r.visibility = 'open'
    and r.guest_session_id is null
    and r.owner_session_id <> me.session_id
    and owner.status = 'active'
    and owner.expires_at > now()
    and not private.is_blocked_between(owner.user_id, me.user_id)
    and not exists (
      select 1 from public.join_requests jr
      where jr.room_id = r.id
        and jr.requester_session_id = me.session_id
        and jr.status <> 'accepted'
        and jr.expires_at <= now()
    )
  order by r.waiting_since;
$$;

revoke all on function public.venue_lobby(uuid) from public, anon;
grant execute on function public.venue_lobby(uuid) to authenticated;

-- Helpers for the service-role functions -----------------------------------------------
create function private.active_session_for_update(target_user_id uuid)
returns public.table_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
begin
  select * into s
  from public.table_sessions
  where user_id = target_user_id and status = 'active' and expires_at > now()
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'no_active_table';
  end if;
  return s;
end;
$$;

create function private.open_room_of_session(target_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.rooms
  where status <> 'closed'
    and (owner_session_id = target_session_id or guest_session_id = target_session_id)
  limit 1;
$$;

-- A table leaves every room it is in: its own rooms close, as a guest the room goes back to
-- waiting (and to the lobby if open). Returns the number of rooms touched.
create function private.release_rooms_of_session(target_session_id uuid)
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
      status = 'waiting', waiting_since = now(), last_activity_at = now()
  where guest_session_id = target_session_id and status <> 'closed';
  get diagnostics released_count = row_count;

  return closed_count + released_count;
end;
$$;

revoke all on function private.active_session_for_update(uuid) from public, anon, authenticated;
revoke all on function private.open_room_of_session(uuid) from public, anon, authenticated;
revoke all on function private.release_rooms_of_session(uuid) from public, anon, authenticated;

-- Room actions (service role only) --------------------------------------------------------
create function public.rooms_create(
  target_user_id uuid,
  new_concept text,
  new_visibility text
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  created public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null then
    raise exception using errcode = 'P0001', message = 'already_in_room';
  end if;

  insert into public.rooms (venue_id, owner_session_id, owner_alias, owner_headcount, concept, visibility)
  values (s.venue_id, s.id, s.alias, s.headcount, new_concept, new_visibility)
  returning * into created;
  return created;
end;
$$;

create function public.rooms_request_join(
  target_user_id uuid,
  target_room_id uuid,
  ttl_seconds integer,
  max_per_hour integer
)
returns public.join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  r public.rooms;
  owner public.table_sessions;
  created public.join_requests;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null then
    raise exception using errcode = 'P0001', message = 'already_in_room';
  end if;

  select * into r from public.rooms where id = target_room_id for update;
  select * into owner from public.table_sessions where id = r.owner_session_id;

  -- One answer for every reason the room cannot take this table, including blocks.
  if r.id is null
    or r.status <> 'waiting'
    or r.visibility <> 'open'
    or r.guest_session_id is not null
    or r.venue_id <> s.venue_id
    or r.owner_session_id = s.id
    or owner.status <> 'active'
    or owner.expires_at <= now()
    or private.is_blocked_between(owner.user_id, s.user_id)
    -- An 'unavailable' answer from this room is final for this table (MVP_SPEC §4.4).
    or exists (
      select 1 from public.join_requests
      where room_id = r.id and requester_session_id = s.id
        and status <> 'accepted' and expires_at <= now()
    )
  then
    raise exception using errcode = 'P0001', message = 'room_not_available';
  end if;

  -- At most one open request per table. A declined request counts until it expires, exactly
  -- like an unanswered one.
  if exists (
    select 1 from public.join_requests
    where requester_session_id = s.id
      and status in ('pending', 'declined')
      and expires_at > now()
  ) then
    raise exception using errcode = 'P0001', message = 'request_pending';
  end if;

  if (
    select count(*) from public.join_requests
    where requester_session_id = s.id and created_at > now() - interval '1 hour'
  ) >= max_per_hour then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.join_requests (room_id, requester_session_id, requester_alias, requester_headcount, expires_at)
  values (r.id, s.id, s.alias, s.headcount, now() + make_interval(secs => ttl_seconds))
  returning * into created;
  return created;
end;
$$;

-- The owner's answer. On accept both tables are in the room and the room's other pending
-- requests are declined (their requesters see 'unavailable' when those requests expire).
create function public.rooms_respond(
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
  select * into jr from public.join_requests where id = target_request_id for update;
  select * into r from public.rooms where id = jr.room_id for update;
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

  select * into requester from public.table_sessions where id = jr.requester_session_id for update;
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

-- "Odadan çık": the owner closes the room; a guest leaves it waiting. Idempotent.
create function public.rooms_leave(target_user_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  room_id uuid;
  result public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  room_id := private.open_room_of_session(s.id);
  if room_id is null then
    return null;
  end if;
  perform private.release_rooms_of_session(s.id);
  select * into result from public.rooms where id = room_id;
  return result;
end;
$$;

-- "Odayı bitir". M6 turns this into the reveal window for two-table rooms. Idempotent.
create function public.rooms_end(target_user_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  result public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  update public.rooms set status = 'closed', closed_at = now()
  where id = private.open_room_of_session(s.id)
  returning * into result;
  return result;
end;
$$;

revoke all on function public.rooms_create(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rooms_request_join(uuid, uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.rooms_respond(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.rooms_leave(uuid) from public, anon, authenticated;
revoke all on function public.rooms_end(uuid) from public, anon, authenticated;
grant execute on function public.rooms_create(uuid, text, text) to service_role;
grant execute on function public.rooms_request_join(uuid, uuid, integer, integer) to service_role;
grant execute on function public.rooms_respond(uuid, uuid, boolean) to service_role;
grant execute on function public.rooms_leave(uuid) to service_role;
grant execute on function public.rooms_end(uuid) to service_role;

-- Ending a table releases its rooms (MVP_SPEC §4.2) ---------------------------------------
create or replace function public.start_table_session(
  target_user_id uuid,
  target_venue_id uuid,
  new_alias text,
  new_headcount smallint,
  consent_version text,
  accuracy_m real default null
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
    for update
  loop
    perform private.release_rooms_of_session(old_session_id);
    update public.table_sessions set status = 'ended', ended_at = now() where id = old_session_id;
  end loop;

  insert into public.table_sessions (user_id, venue_id, alias, headcount, gps_accuracy_m, expires_at)
  values (target_user_id, target_venue_id, new_alias, new_headcount, accuracy_m, now() + interval '4 hours')
  returning * into created;

  return created;
end;
$$;

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
    for update
  loop
    perform private.release_rooms_of_session(old_session_id);
    update public.table_sessions set status = 'ended', ended_at = now() where id = old_session_id;
    ended := true;
  end loop;
  return ended;
end;
$$;

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
    for update skip locked
  loop
    perform private.release_rooms_of_session(old_session_id);
    update public.table_sessions set status = 'ended', ended_at = expires_at where id = old_session_id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Scheduled jobs ------------------------------------------------------------------------
-- Rooms without activity for 10 minutes close (MVP_SPEC §4.5). M6 adds 'ending' rooms.
create function private.close_idle_rooms(idle_minutes integer default 10)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.rooms set status = 'closed', closed_at = now()
  where status in ('waiting', 'active')
    and last_activity_at <= now() - make_interval(mins => idle_minutes);
  get diagnostics n = row_count;
  return n;
end;
$$;

create function private.expire_join_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.join_requests set status = 'expired'
  where status = 'pending' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.close_idle_rooms(integer) from public, anon, authenticated;
revoke all on function private.expire_join_requests() from public, anon, authenticated;

select cron.schedule('close-idle-rooms', '* * * * *', $$select private.close_idle_rooms()$$);
select cron.schedule('expire-join-requests', '* * * * *', $$select private.expire_join_requests()$$);
