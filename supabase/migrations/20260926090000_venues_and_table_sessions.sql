-- M2: venues, table sessions (check-in), table alias words, nearby search and expiry.

-- venues ----------------------------------------------------------------------
-- Seeded from content/venues-pilot.json (OpenStreetMap). Users cannot add venues.
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  district text not null,
  location extensions.geography(point, 4326) not null,
  source text not null,
  source_ref text not null,
  is_active boolean not null default true,
  unique (source, source_ref)
);

create index venues_location_idx on public.venues using gist (location);

alter table public.venues enable row level security;
revoke all on table public.venues from anon, authenticated;
grant select on table public.venues to authenticated;

create policy "venues: authenticated users read"
  on public.venues for select
  to authenticated
  using (true);

-- alias_words -----------------------------------------------------------------
-- Seeded from content/aliases-tr.json; only server code reads it.
create table public.alias_words (
  kind text not null check (kind in ('adjective', 'animal')),
  word text not null,
  primary key (kind, word)
);

alter table public.alias_words enable row level security;
revoke all on table public.alias_words from anon, authenticated;

-- table_sessions --------------------------------------------------------------
-- One phone = one table. Coordinates are never stored; gps_accuracy_m is only the accuracy
-- radius the device reported, kept to tune the check-in radius in the field.
create table public.table_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  alias text not null,
  headcount smallint not null check (headcount between 1 and 6),
  status text not null default 'active' check (status in ('active', 'ended')),
  gps_accuracy_m real check (gps_accuracy_m >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  check ((status = 'ended') = (ended_at is not null))
);

create unique index table_sessions_one_active_per_user
  on public.table_sessions (user_id)
  where status = 'active';

create unique index table_sessions_unique_active_alias
  on public.table_sessions (venue_id, alias)
  where status = 'active';

create index table_sessions_active_expiry
  on public.table_sessions (expires_at)
  where status = 'active';

alter table public.table_sessions enable row level security;
revoke all on table public.table_sessions from anon, authenticated;
grant select on table public.table_sessions to authenticated;

create policy "table_sessions: read own rows"
  on public.table_sessions for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- Location consent (KVKK explicit consent), written on the first check-in.
alter table public.profiles
  add column location_consent_at timestamptz,
  add column location_consent_version text,
  add constraint profiles_location_consent_pair
    check ((location_consent_at is null) = (location_consent_version is null));

-- nearby_venues ---------------------------------------------------------------
-- Security invoker: venues are readable anyway. The coordinates are only parameters.
create function public.nearby_venues(lat double precision, lng double precision)
returns table (id uuid, name text, district text, distance_m double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select v.id, v.name, v.district,
         extensions.st_distance(
           v.location,
           extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
         ) as distance_m
  from public.venues v
  where v.is_active
    and extensions.st_dwithin(
      v.location,
      extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography,
      300
    )
  order by distance_m, v.name;
$$;

revoke all on function public.nearby_venues(double precision, double precision) from public, anon;
grant execute on function public.nearby_venues(double precision, double precision) to authenticated;

-- Service role only: the checkin Edge Function's server-side distance check.
-- Returns null when the venue does not exist or is inactive.
create function public.venue_distance_m(
  target_venue_id uuid,
  lat double precision,
  lng double precision
)
returns double precision
language sql
stable
security invoker
set search_path = ''
as $$
  select extensions.st_distance(
    v.location,
    extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
  )
  from public.venues v
  where v.id = target_venue_id and v.is_active;
$$;

revoke all on function public.venue_distance_m(uuid, double precision, double precision)
  from public, anon, authenticated;
grant execute on function public.venue_distance_m(uuid, double precision, double precision)
  to service_role;

-- Expiry ----------------------------------------------------------------------
-- Ends tables past their 4 hours. M3 adds closing the ended tables' rooms here.
create function private.end_expired_table_sessions()
returns integer
language sql
security definer
set search_path = ''
as $$
  with ended as (
    update public.table_sessions
    set status = 'ended', ended_at = expires_at
    where status = 'active' and expires_at <= now()
    returning 1
  )
  select count(*)::integer from ended;
$$;

revoke all on function private.end_expired_table_sessions() from public, anon, authenticated;

select cron.schedule(
  'end-expired-table-sessions',
  '* * * * *',
  $$select private.end_expired_table_sessions()$$
);

-- Check-in write ----------------------------------------------------------------
-- Service role only (checkin Edge Function). In one transaction: record location consent on the
-- first check-in, end the user's current table and open the new one. Distance and alias are
-- decided by the caller. A taken alias raises unique_violation (23505) so the caller can retry.
create function public.start_table_session(
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
begin
  update public.profiles
  set location_consent_at = now(), location_consent_version = consent_version
  where id = target_user_id
    and location_consent_version is distinct from consent_version;

  -- M3 closes the ended table's rooms here as well.
  update public.table_sessions
  set status = 'ended', ended_at = now()
  where user_id = target_user_id and status = 'active';

  insert into public.table_sessions (user_id, venue_id, alias, headcount, gps_accuracy_m, expires_at)
  values (target_user_id, target_venue_id, new_alias, new_headcount, accuracy_m, now() + interval '4 hours')
  returning * into created;

  return created;
end;
$$;

revoke all on function public.start_table_session(uuid, uuid, text, smallint, text, real)
  from public, anon, authenticated;
grant execute on function public.start_table_session(uuid, uuid, text, smallint, text, real)
  to service_role;

-- Service role only: "Mekandan ayrıl". Idempotent; returns whether a table was ended.
create function public.end_table_session(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  -- M3 closes the ended table's rooms here as well.
  with ended as (
    update public.table_sessions
    set status = 'ended', ended_at = now()
    where user_id = target_user_id and status = 'active'
    returning 1
  )
  select exists (select 1 from ended);
$$;

revoke all on function public.end_table_session(uuid) from public, anon, authenticated;
grant execute on function public.end_table_session(uuid) to service_role;
