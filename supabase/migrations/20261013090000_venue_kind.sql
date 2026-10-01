-- v3 step 6 (docs/SPEC_V3.md §18.1): what a venue is, for Keşfet's map pins and list.
-- 'cafe' (a point with the 300 m radius) or 'campus' (a boundary). The seed writes it for every
-- venue from content/ (pure/venueKind.ts); the default and the update below make rows that exist
-- before the seed runs consistent with it: campus rows are those from venues-campus.json.

alter table public.venues
  add column kind text not null default 'cafe' check (kind in ('cafe', 'campus'));

update public.venues set kind = 'campus' where source = 'campus';

-- Keşfet: as in 20261009090000_campus.sql, plus the kind.
drop function public.explore_venues(integer);

create function public.explore_venues(event_days integer default 7)
returns table (
  venue_id uuid,
  name text,
  district text,
  kind text,
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
         v.kind,
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
