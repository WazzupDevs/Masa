-- v3 step 2: the campus pilot (docs/SPEC_V3.md §4). A venue may have a boundary (a polygon; the
-- check-in accepts it with a tolerance) and spots (named places inside it that a table declares).
-- Spots have no coordinates, and nothing ever returns how many tables are at a spot.

-- venues.boundary -----------------------------------------------------------------------------------
-- Public like the rest of the venue row: a campus boundary is not personal data.
alter table public.venues add column boundary extensions.geography(polygon, 4326);

-- venue_spots -----------------------------------------------------------------------------------------
-- Seeded from content/venues-campus.json. `ref` is the permanent key; a removed spot is set
-- inactive, never deleted, so the tables at it stay valid.
create table public.venue_spots (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  ref text not null check (ref ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (char_length(name) between 1 and 40),
  sort smallint not null default 0,
  is_active boolean not null default true,
  unique (venue_id, ref)
);

alter table public.venue_spots enable row level security;
revoke all on table public.venue_spots from anon, authenticated;
grant select on table public.venue_spots to authenticated;

create policy "venue_spots: authenticated users read"
  on public.venue_spots for select
  to authenticated
  using (true);

-- The table's own spot, and the room's (the owner's spot when the room was created; a table in a
-- room cannot change its spot, so the two stay equal).
alter table public.table_sessions add column spot_id uuid references public.venue_spots (id) on delete set null;
alter table public.rooms add column spot_id uuid references public.venue_spots (id) on delete set null;

create function private.set_room_spot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.spot_id := (select spot_id from public.table_sessions where id = new.owner_session_id);
  return new;
end;
$$;

revoke all on function private.set_room_spot() from public, anon, authenticated;

create trigger rooms_set_spot
  before insert on public.rooms
  for each row
  execute function private.set_room_spot();

-- Check-in: boundary or radius ------------------------------------------------------------------------
-- Service role only. Decides in one call without storing the coordinates: inside the boundary or
-- within tolerance_m of it; a venue without a boundary within radius_m of its point. Null when the
-- venue does not exist or is inactive. The numbers come from pure/checkin.ts, not from SQL.
create function public.venue_contains(
  target_venue_id uuid,
  lat double precision,
  lng double precision,
  tolerance_m double precision,
  radius_m double precision
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when v.boundary is not null then extensions.st_dwithin(v.boundary, here.p, tolerance_m)
           else extensions.st_dwithin(v.location, here.p, radius_m)
         end
  from public.venues v
  cross join (
    select extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as p
  ) here
  where v.id = target_venue_id and v.is_active;
$$;

revoke all on function public.venue_contains(uuid, double precision, double precision, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.venue_contains(uuid, double precision, double precision, double precision, double precision)
  to service_role;

-- The spot a check-in or a spot change may use: an active spot of the venue. A venue with active
-- spots needs one ('spot_required'); a venue without spots takes none ('spot_invalid').
create function private.check_spot(target_venue_id uuid, target_spot_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if target_spot_id is null then
    if exists (select 1 from public.venue_spots where venue_id = target_venue_id and is_active) then
      raise exception using errcode = 'P0001', message = 'spot_required';
    end if;
    return;
  end if;
  if not exists (
    select 1 from public.venue_spots
    where id = target_spot_id and venue_id = target_venue_id and is_active
  ) then
    raise exception using errcode = 'P0001', message = 'spot_invalid';
  end if;
end;
$$;

revoke all on function private.check_spot(uuid, uuid) from public, anon, authenticated;

-- start_table_session + the spot. Otherwise as in 20261007090000_lock_order.sql.
drop function public.start_table_session(uuid, uuid, text, smallint, text, real, text);

create function public.start_table_session(
  target_user_id uuid,
  target_venue_id uuid,
  new_alias text,
  new_headcount smallint,
  consent_version text,
  accuracy_m real default null,
  new_participation text default 'anonymous',
  new_spot_id uuid default null
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
  perform private.check_spot(target_venue_id, new_spot_id);

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
    (user_id, venue_id, alias, headcount, gps_accuracy_m, participation, spot_id, expires_at)
  values
    (target_user_id, target_venue_id, new_alias, new_headcount, accuracy_m, new_participation,
     new_spot_id, now() + interval '4 hours')
  returning * into created;

  return created;
end;
$$;

revoke all on function public.start_table_session(uuid, uuid, text, smallint, text, real, text, uuid)
  from public, anon, authenticated;
grant execute on function public.start_table_session(uuid, uuid, text, smallint, text, real, text, uuid)
  to service_role;

-- "Bu noktadayım" and changing the spot (§4.3): no new position, the table's time stays. Refused
-- while the table is in a room or has a request out; a declined request counts until it expires,
-- exactly like an unanswered one (rule 5).
create function public.change_table_spot(target_user_id uuid, target_spot_id uuid)
returns public.table_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null
    or exists (
      select 1 from public.join_requests
      where requester_session_id = s.id
        and status in ('pending', 'declined')
        and expires_at > now()
    )
  then
    raise exception using errcode = 'P0001', message = 'in_room';
  end if;
  if target_spot_id is null then
    raise exception using errcode = 'P0001', message = 'spot_invalid';
  end if;
  perform private.check_spot(s.venue_id, target_spot_id);

  update public.table_sessions set spot_id = target_spot_id where id = s.id
  returning * into s;
  return s;
end;
$$;

revoke all on function public.change_table_spot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.change_table_spot(uuid, uuid) to service_role;

-- Join requests: the same spot only (face to face). Checked after every 'room_not_available'
-- reason, so 'different_spot' says nothing beyond the spot the lobby already shows. Otherwise as
-- in 20260927090000_rooms_lobby_join_requests.sql.
create or replace function public.rooms_request_join(
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

  if r.spot_id is distinct from s.spot_id then
    raise exception using errcode = 'P0001', message = 'different_spot';
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

-- Lobby: + the room's spot (id and name) so the screen groups rooms by spot. Rooms at every spot
-- are listed, as before; no count per spot. Otherwise as in 20261004090000_profiles_v2.sql.
drop function public.venue_lobby(uuid);

create function public.venue_lobby(target_venue_id uuid)
returns table (
  room_id uuid,
  alias text,
  headcount smallint,
  concept text,
  waiting_since timestamptz,
  profiled boolean,
  spot_id uuid,
  spot_name text
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
  select r.id, r.owner_alias, r.owner_headcount, r.concept,
         greatest(r.waiting_since, private.lobby_listed_from(r.owner_session_id)),
         owner.participation = 'profile',
         r.spot_id,
         sp.name
  from public.rooms r
  join public.table_sessions owner on owner.id = r.owner_session_id
  left join public.venue_spots sp on sp.id = r.spot_id
  cross join me
  where r.venue_id = target_venue_id
    and r.status = 'waiting'
    and r.visibility = 'open'
    and r.guest_session_id is null
    and r.owner_session_id <> me.session_id
    and owner.status = 'active'
    and coalesce(private.lobby_listed_from(r.owner_session_id), '-infinity') <= now()
    and owner.expires_at > now()
    and not private.is_blocked_between(owner.user_id, me.user_id)
    and not exists (
      select 1 from public.join_requests jr
      where jr.room_id = r.id
        and jr.requester_session_id = me.session_id
        and jr.status <> 'accepted'
        and jr.expires_at <= now()
    )
  order by 5;
$$;

revoke all on function public.venue_lobby(uuid) from public, anon;
grant execute on function public.venue_lobby(uuid) to authenticated;

-- Keşfet: every running or upcoming event within event_days (the single-venue view lists them all)
-- and the boundary's outer ring as [lng, lat] pairs (the check-in warning). Still no count of
-- people or tables. Otherwise as in 20261003090000_explore.sql.
drop function public.explore_venues(integer);

create function public.explore_venues(event_days integer default 7)
returns table (
  venue_id uuid,
  name text,
  district text,
  lat double precision,
  lng double precision,
  bucket text,
  events jsonb,
  boundary jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id,
         v.name,
         v.district,
         extensions.st_y(v.location::extensions.geometry),
         extensions.st_x(v.location::extensions.geometry),
         coalesce(a.bucket, 'calm'),
         coalesce(e.events, '[]'::jsonb),
         case when v.boundary is not null
           then (extensions.st_asgeojson(v.boundary::extensions.geometry)::jsonb -> 'coordinates' -> 0)
         end
  from public.venues v
  left join public.venue_activity a on a.venue_id = v.id
  left join lateral (
    select jsonb_agg(
             jsonb_build_object('title', ev.title, 'startsAt', ev.starts_at, 'endsAt', ev.ends_at)
             order by ev.starts_at
           ) as events
    from public.venue_events ev
    where ev.venue_id = v.id
      and ev.ends_at > now()
      and ev.starts_at <= now() + make_interval(days => least(greatest(event_days, 0), 14))
  ) e on true
  where v.is_active
  order by v.name;
$$;

revoke all on function public.explore_venues(integer) from public, anon;
grant execute on function public.explore_venues(integer) to authenticated;
