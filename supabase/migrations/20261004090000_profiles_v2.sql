-- v2 step 3 (docs/SPEC_V2.md §5): profiles, anonymous or profile participation, headcount 1–4,
-- the "profilli" lobby flag, profile photos and profile reports.

-- profiles -----------------------------------------------------------------------------------------
alter table public.profiles
  add column public_id uuid not null default gen_random_uuid(),
  add column display_name text
    check (display_name is null or char_length(display_name) between 2 and 24),
  add column bio text check (bio is null or char_length(bio) between 1 and 160),
  add column photo_path text,
  add column photo_hidden_at timestamptz,
  add column default_participation text not null default 'anonymous'
    check (default_participation in ('anonymous', 'profile')),
  add column notify_dm boolean not null default true,
  add column notify_friend_requests boolean not null default true,
  add constraint profiles_public_id_key unique (public_id);

-- Own row only (RLS, unchanged), and never the photo path or the hidden flag: photos always come as
-- short-lived signed URLs from the profile function.
revoke select on table public.profiles from authenticated;
grant select (
  id, age_confirmed_at, terms_accepted_at, terms_version, kvkk_accepted_at, kvkk_version,
  created_at, push_token, location_consent_at, location_consent_version,
  public_id, display_name, bio, default_participation, notify_dm, notify_friend_requests
) on table public.profiles to authenticated;

-- table_sessions: participation and "Kaç kişisiniz?" 1 / 2 / 3 / 4+ ------------------------------------
alter table public.table_sessions
  add column participation text not null default 'anonymous'
    check (participation in ('anonymous', 'profile'));

update public.table_sessions set headcount = 4 where status = 'active' and headcount > 4;
update public.rooms set owner_headcount = 4 where status <> 'closed' and owner_headcount > 4;
update public.rooms set guest_headcount = 4 where status <> 'closed' and guest_headcount > 4;
update public.join_requests set requester_headcount = 4
where status = 'pending' and requester_headcount > 4;

-- 4 means "4+". Ended sessions keep their old value (not valid: checked for new rows only).
alter table public.table_sessions drop constraint table_sessions_headcount_check;
alter table public.table_sessions
  add constraint table_sessions_headcount_check check (headcount between 1 and 4) not valid;

drop function public.start_table_session(uuid, uuid, text, smallint, text, real);

create function public.start_table_session(
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
    for update
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

-- join_requests: the owner's request window shows only a "profilli" flag ------------------------------
alter table public.join_requests
  add column requester_profiled boolean not null default false;

create function private.set_requester_profiled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.requester_profiled := coalesce(
    (select participation = 'profile' from public.table_sessions where id = new.requester_session_id),
    false
  );
  return new;
end;
$$;

revoke all on function private.set_requester_profiled() from public, anon, authenticated;

create trigger join_requests_requester_profiled
  before insert on public.join_requests
  for each row
  execute function private.set_requester_profiled();

-- Lobby: + profiled (the flag only; no public_id, no photo) ---------------------------------------------
drop function public.venue_lobby(uuid);

create function public.venue_lobby(target_venue_id uuid)
returns table (
  room_id uuid,
  alias text,
  headcount smallint,
  concept text,
  waiting_since timestamptz,
  profiled boolean
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
         owner.participation = 'profile'
  from public.rooms r
  join public.table_sessions owner on owner.id = r.owner_session_id
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

-- Who may see whose profile -------------------------------------------------------------------------
-- The two tables of a room share it while the room runs (waiting with both, active, ending) and only
-- when the other table joined with its profile. Friends are added in step 4 (docs/SPEC_V2.md §5.2).
-- Blocks either way hide everything.
create function private.shares_room_with_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    join public.table_sessions me
      on me.id in (r.owner_session_id, r.guest_session_id)
     and me.user_id = viewer and me.status = 'active'
    join public.table_sessions other
      on other.id in (r.owner_session_id, r.guest_session_id)
     and other.id <> me.id
     and other.user_id = target and other.status = 'active'
     and other.participation = 'profile'
    where r.status in ('waiting', 'active', 'ending')
  );
$$;

create function private.can_view_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer = target
    or (
      not private.is_blocked_between(viewer, target)
      and private.shares_room_with_profile(viewer, target)
    );
$$;

revoke all on function private.shares_room_with_profile(uuid, uuid) from public, anon, authenticated;
revoke all on function private.can_view_profile(uuid, uuid) from public, anon, authenticated;

-- The other table's profile id for a room member, only while the room runs and only if that table
-- joined with its profile; otherwise null. Read only.
create function public.room_member_profile(target_room_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.public_id
  from public.rooms r
  join public.table_sessions me
    on me.id in (r.owner_session_id, r.guest_session_id)
   and me.user_id = (select auth.uid()) and me.status = 'active'
  join public.table_sessions other
    on other.id in (r.owner_session_id, r.guest_session_id)
   and other.id <> me.id and other.status = 'active' and other.participation = 'profile'
  join public.profiles p on p.id = other.user_id
  where r.id = target_room_id
    and r.status in ('waiting', 'active', 'ending')
    and not private.is_blocked_between(me.user_id, other.user_id)
  limit 1;
$$;

revoke all on function public.room_member_profile(uuid) from public, anon;
grant execute on function public.room_member_profile(uuid) to authenticated;

-- profile/get (service role only): the profile if the viewer may see it, else no row. The caller
-- answers "no row" exactly like an unknown public_id.
create function public.profile_view(viewer uuid, target_public_id uuid)
returns table (
  user_id uuid,
  public_id uuid,
  display_name text,
  bio text,
  photo_path text,
  photo_hidden boolean,
  is_self boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.public_id, p.display_name, p.bio, p.photo_path, p.photo_hidden_at is not null,
         p.id = viewer
  from public.profiles p
  where p.public_id = target_public_id
    and private.can_view_profile(viewer, p.id);
$$;

revoke all on function public.profile_view(uuid, uuid) from public, anon, authenticated;
grant execute on function public.profile_view(uuid, uuid) to service_role;

-- game_results (badges) ----------------------------------------------------------------------------
-- Games the server knows about; written by the game functions from step 5 on. Own rows readable.
create table public.game_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  room_id uuid references public.rooms (id) on delete set null,
  concept text not null check (concept in ('tabu', 'sohbet')),
  mode text not null check (mode in ('voice', 'text')),
  completed_at timestamptz not null default now(),
  score integer,
  won boolean
);

create index game_results_user_idx on public.game_results (user_id);

alter table public.game_results enable row level security;
revoke all on table public.game_results from anon, authenticated;
grant select on table public.game_results to authenticated;

create policy "game_results: own rows"
  on public.game_results for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Counts behind the badges (pure/badges.ts decides which badges they unlock). Encounter-based
-- counts are added with play_history in step 4. Service role only.
create function public.user_stats(target_user_id uuid)
returns table (games integer, voice_tabu_wins integer)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer,
         (count(*) filter (where concept = 'tabu' and mode = 'voice' and won))::integer
  from public.game_results
  where user_id = target_user_id;
$$;

revoke all on function public.user_stats(uuid) from public, anon, authenticated;
grant execute on function public.user_stats(uuid) to service_role;

-- Profile photos (Storage) --------------------------------------------------------------------------
-- Private bucket, JPEG only, 300 KB. No client policy on storage.objects: uploads and reads go
-- through signed URLs issued by the profile function (rule 1).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 307200, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- reports: profile reports -------------------------------------------------------------------------
-- The reported photo is copied into the row (bytea) so the existing 30-day cleanup removes it with
-- the report; Storage objects cannot be deleted reliably from SQL.
alter table public.reports
  add column target_type text not null default 'room'
    check (target_type in ('room', 'dm', 'profile', 'history')),
  add column dm_thread_id uuid,
  add column history_id uuid,
  add column profile_snapshot jsonb,
  add column photo_copy bytea;

alter table public.reports alter column messages_snapshot drop not null;

-- Records a profile report and hides the reported photo once 2 different accounts reported it
-- (docs/SPEC_V2.md §5.3). Returns false and writes nothing if the reporter may not see that
-- profile. `photo` is the file the caller downloaded from `reported_photo_path`; it is kept only if
-- that is still the profile's photo.
create function public.safety_report_profile(
  target_user_id uuid,
  target_public_id uuid,
  new_reason text,
  reported_photo_path text default null,
  photo bytea default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  reporters integer;
begin
  -- Locked, so two reports arriving together both see each other when counting.
  select * into p from public.profiles where public_id = target_public_id for update;
  if p.id is null or p.id = target_user_id or not private.can_view_profile(target_user_id, p.id) then
    return false;
  end if;

  insert into public.reports (reporter_id, reported_user_id, reason, target_type, profile_snapshot,
                              photo_copy)
  values (target_user_id, p.id, new_reason, 'profile',
          jsonb_build_object('display_name', p.display_name, 'bio', p.bio,
                             'photo_path', p.photo_path),
          case when p.photo_path = reported_photo_path then photo end);

  if p.photo_path is not null and p.photo_hidden_at is null then
    select count(distinct reporter_id) into reporters
    from public.reports
    where target_type = 'profile'
      and reported_user_id = p.id
      and profile_snapshot ->> 'photo_path' = p.photo_path;
    if reporters >= 2 then
      update public.profiles set photo_hidden_at = now() where id = p.id;
    end if;
  end if;
  return true;
end;
$$;

revoke all on function public.safety_report_profile(uuid, uuid, text, text, bytea)
  from public, anon, authenticated;
grant execute on function public.safety_report_profile(uuid, uuid, text, text, bytea)
  to service_role;
