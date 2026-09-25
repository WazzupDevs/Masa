-- v2 Keşfet (docs/SPEC_V2.md §4): per-venue activity buckets and planned events. The app reads both
-- only through explore_venues(); no count of tables or people ever leaves the database.

-- venue_activity ---------------------------------------------------------------------------------
-- Written every ACTIVITY_REFRESH_MINUTES by cron; a single table's arrival or departure is not
-- visible in real time, and 0–2 tables look the same ("calm").
create table public.venue_activity (
  venue_id uuid primary key references public.venues (id) on delete cascade,
  bucket text not null check (bucket in ('calm', 'lively', 'buzzing')),
  computed_at timestamptz not null default now()
);

alter table public.venue_activity enable row level security;
revoke all on table public.venue_activity from anon, authenticated;

-- venue_events -----------------------------------------------------------------------------------
-- Planned events ("Salı 20.00 Masa gecesi"), entered only with `pnpm admin:event` (service role).
-- ends_at is always set: the script fills EVENT_DEFAULT_HOURS when it is not given.
create table public.venue_events (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index venue_events_venue_idx on public.venue_events (venue_id, ends_at);

alter table public.venue_events enable row level security;
revoke all on table public.venue_events from anon, authenticated;

-- Buckets ----------------------------------------------------------------------------------------
-- Thresholds come from pure/explore.ts (ACTIVITY_THRESHOLDS) through the cron command below;
-- supabase/tests/explore.test.ts checks the two agree.
create function private.refresh_venue_activity(calm_max integer, lively_max integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.venue_activity (venue_id, bucket, computed_at)
  select v.id,
         case
           when coalesce(c.tables, 0) <= calm_max then 'calm'
           when c.tables <= lively_max then 'lively'
           else 'buzzing'
         end,
         now()
  from public.venues v
  left join (
    select venue_id, count(*) as tables
    from public.table_sessions
    where status = 'active' and expires_at > now()
    group by venue_id
  ) c on c.venue_id = v.id
  where v.is_active
  on conflict (venue_id) do update
    set bucket = excluded.bucket, computed_at = excluded.computed_at;
  get diagnostics n = row_count;

  delete from public.venue_activity a
  using public.venues v
  where v.id = a.venue_id and not v.is_active;
  return n;
end;
$$;

revoke all on function private.refresh_venue_activity(integer, integer) from public, anon, authenticated;

select cron.schedule(
  'refresh-venue-activity',
  '*/5 * * * *',
  $$select private.refresh_venue_activity(2, 5)$$
);

-- Keşfet (read only, security definer) -----------------------------------------------------------
-- Active venues with their bucket (calm until the first refresh) and, per venue, the running event
-- or the next one starting within event_days. Venue coordinates are public already (venues).
create function public.explore_venues(event_days integer default 7)
returns table (
  venue_id uuid,
  name text,
  district text,
  lat double precision,
  lng double precision,
  bucket text,
  event_title text,
  event_starts_at timestamptz,
  event_ends_at timestamptz
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
         e.title,
         e.starts_at,
         e.ends_at
  from public.venues v
  left join public.venue_activity a on a.venue_id = v.id
  left join lateral (
    select ev.title, ev.starts_at, ev.ends_at
    from public.venue_events ev
    where ev.venue_id = v.id
      and ev.ends_at > now()
      and ev.starts_at <= now() + make_interval(days => least(greatest(event_days, 0), 14))
    order by ev.starts_at
    limit 1
  ) e on true
  where v.is_active
  order by v.name;
$$;

revoke all on function public.explore_venues(integer) from public, anon;
grant execute on function public.explore_venues(integer) to authenticated;
