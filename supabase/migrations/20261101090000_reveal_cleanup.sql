-- Faz 3 step 23.4b (docs/SPEC_V3.md §23.H, §23.I, §23.K, §23.O): the "Tanışalım mı?" window's data
-- goes. Since 23.3b no road opens the window (private.table_end_on() is true), and step 23.4a took
-- every reader of its data out of the app, the Edge Functions and the scripts
-- (scripts/reveal-removed.test.ts). What is left is here, item by item as in the PR (§23.H):
--
--   1. A room still 'ending' closes; 'ending' leaves rooms.status. None is expected: nothing has
--      produced it since 23.3b and close_expired_reveals closed each within 30 seconds.
--   2. The switch and its branches: private.table_end_on() goes, and every function that asked it
--      keeps only the table's-end road (end_two_sided_room, close_idle_rooms, write_pair_history).
--      The window's other branches go with it (leave_room, close_stale_member_rows, room_phones,
--      room_member_profiles, room_member_profile, shares_room_with_profile).
--   3. The lobby hold: private.lobby_listed_from, private.room_listed_from, public.rooms_lobby_held;
--      venue_lobby and venue_running_rooms list a table without them.
--   4. The window's functions: public.reveal_decide, reveal_finalize, reveal_matches;
--      private.start_reveal, finish_reveal, close_expired_reveals (and its cron job),
--      reveal_participants, reveal_colors, reveal_emojis, reveal_decision_seconds.
--   5. Tables reveal_decisions and reveal_signals (their policies with them); columns
--      rooms.reveal_ends_at, reveal_result, reveal_token (their checks and grants with them).
--   6. Realtime (§23.I): realtime_topic_allowed without the ban on presence: in an ending room.
--
-- Kept: play_history.reveal_mutual. Records written by a window keep it, and friends_add_from_room
-- and pure/friends.ts → historyAction still read it (a record without friend_open opens only after
-- a mutual "Evet").
--
-- public.rooms_end keeps its decision_seconds argument, now with a default and unused: the rooms
-- Edge Function deployed before this migration sends it until the new one is deployed (deploy-dev
-- and docs/PILOT_RELEASE.md run the migration first, then the functions), and "Masayı bitir" must
-- not fail in between. The new function leaves it out. A small migration of its own drops it once
-- this one is live on the dev and production projects (docs/DECISIONS.md → 23.4b).
--
-- Lock order (rule 10): reveal_decisions and reveal_signals leave the order (§23.K); nothing else
-- changes. The functions below take the locks they took with the switch on.

-- 1. 'ending' ---------------------------------------------------------------------------------------
update public.rooms set status = 'closed', closed_at = now() where status = 'ending';

alter table public.rooms drop constraint rooms_status_check;
alter table public.rooms
  add constraint rooms_status_check check (status in ('waiting', 'active', 'closed'));

-- 2. The switch and its branches --------------------------------------------------------------------
-- A two-sided room closes at once and writes its pairs (§23.G).
drop function private.end_two_sided_room(uuid, integer);
create function private.end_two_sided_room(target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
begin
  update public.rooms set status = 'closed', closed_at = now(), last_activity_at = now()
  where id = target_room_id
  returning * into r;
  perform private.write_pair_history(target_room_id);
  return r;
end;
$$;

revoke all on function private.end_two_sided_room(uuid) from public, anon, authenticated;

create or replace function public.rooms_end(target_user_id uuid, decision_seconds integer default null)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  r public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  select * into r from public.rooms where id = private.open_room_of_session(s.id) for update;
  if r.id is null or r.status not in ('waiting', 'active') then
    return r;
  end if;
  if s.id is distinct from r.owner_session_id and s.id is distinct from r.guest_session_id then
    raise exception using errcode = 'P0001', message = 'not_leader';
  end if;
  if r.status = 'active' and r.guest_session_id is not null then
    return private.end_two_sided_room(r.id);
  end if;
  update public.rooms set status = 'closed', closed_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

-- Inactivity closes only a one-sided room (§23.G); a two-sided one stays open.
drop function private.close_idle_rooms(integer, integer);
create function private.close_idle_rooms(idle_minutes integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_count integer;
begin
  update public.rooms set status = 'closed', closed_at = now()
  where id in (
    select id from public.rooms
    where status in ('waiting', 'active')
      and guest_session_id is null
      and last_activity_at <= now() - make_interval(mins => idle_minutes)
    for update skip locked
  );
  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

revoke all on function private.close_idle_rooms(integer) from public, anon, authenticated;

select cron.unschedule('close-idle-rooms');
select cron.schedule(
  'close-idle-rooms',
  '* * * * *',
  $$select private.close_idle_rooms(30)$$
);

-- The close (no phone given) writes the pairs of the phones still at the table, the side's last
-- phone that has just left included (its row closed in this transaction); a phone leaving (given)
-- writes its own pairs. Every record is available at once and friend_open (§23.G).
create or replace function private.write_pair_history(target_room_id uuid, target_session_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  played text;
  pair record;
  encounter uuid;
  written integer := 0;
  n integer;
begin
  select * into r from public.rooms where id = target_room_id;
  if r.id is null or r.guest_session_id is null then
    return 0;
  end if;
  played := coalesce(r.concept, r.game_state -> 'lastGame' ->> 'concept', 'chat');

  for pair in
    with phones as (
      select distinct on (rm.session_id) rm.session_id, rm.side, rm.alias, rm.profiled, ts.user_id
      from public.room_members rm
      join public.table_sessions ts on ts.id = rm.session_id
      where rm.room_id = r.id
        and (
          (target_session_id is not null
            and (rm.session_id = target_session_id or rm.left_at is null))
          or (target_session_id is null and (rm.left_at is null or rm.left_at = now()))
        )
      order by rm.session_id, rm.joined_at desc
    ),
    spans as (
      select rm.session_id,
             case when rm.joined_at = first_row.at
                  then least(rm.joined_at, coalesce(r.guest_joined_at, rm.joined_at))
                  else rm.joined_at end as since,
             coalesce(rm.left_at, now()) as until
      from public.room_members rm
      join (
        select f.side, min(f.joined_at) as at from public.room_members f
        where f.room_id = r.id
        group by f.side
      ) first_row on first_row.side = rm.side
      where rm.room_id = r.id
    ),
    pairs as (
      select o.session_id as owner_session, o.alias as owner_alias, o.profiled as owner_profiled,
             o.user_id as owner_user,
             g.session_id as guest_session, g.alias as guest_alias, g.profiled as guest_profiled,
             g.user_id as guest_user
      from phones o
      join phones g on g.side = 'guest'
      where o.side = 'owner'
        and o.user_id <> g.user_id
        and (target_session_id is null or target_session_id in (o.session_id, g.session_id))
    )
    select pairs.*, together.total, together.since
    from pairs
    cross join lateral (
      select sum(greatest(least(x.until, y.until) - greatest(x.since, y.since), interval '0'))
               as total,
             min(greatest(x.since, y.since)) filter (
               where least(x.until, y.until) > greatest(x.since, y.since)
             ) as since
      from spans x
      join spans y on y.session_id = pairs.guest_session
      where x.session_id = pairs.owner_session
    ) together
    where together.total >= interval '3 minutes'
  loop
    encounter := gen_random_uuid();
    insert into public.play_history (
      encounter_id, user_id, other_user_id, other_profiled, room_id, concept, mode, intent,
      own_alias, other_alias, other_headcount, started_at, played_at, available_at, friend_open
    )
    values
      (encounter, pair.owner_user, pair.guest_user, pair.guest_profiled, r.id, played,
       case when played = 'tabu' then 'voice' else 'text' end, r.intent,
       pair.owner_alias, pair.guest_alias, private.room_side_headcount(r, 'guest'), pair.since,
       now(), now(), true),
      (encounter, pair.guest_user, pair.owner_user, pair.owner_profiled, r.id, played,
       case when played = 'tabu' then 'voice' else 'text' end, r.intent,
       pair.guest_alias, pair.owner_alias, private.room_side_headcount(r, 'owner'), pair.since,
       now(), now(), true)
    on conflict do nothing;
    get diagnostics n = row_count;
    written := written + n;
  end loop;
  return written;
end;
$$;

-- A phone leaving: a member writes its pairs and goes; a leader hands the side over to its next
-- phone; a side's last phone closes a one-sided room, or ends a two-sided one (§23.G).
create or replace function private.leave_room(target_room_id uuid, target_session_id uuid, how text)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  mine public.room_members;
  heir public.room_members;
  my_side text;
  leader boolean;
begin
  select * into r from public.rooms where id = target_room_id for update;
  if r.id is null or r.status = 'closed' then
    return r;
  end if;
  select * into mine from public.room_members
  where room_id = r.id and session_id = target_session_id and left_at is null
  for update;
  my_side := case
    when target_session_id = r.owner_session_id then 'owner'
    when target_session_id = r.guest_session_id then 'guest'
    else mine.side
  end;
  if my_side is null then
    return r;
  end if;
  leader := target_session_id in (r.owner_session_id, coalesce(r.guest_session_id, r.owner_session_id));

  if mine.id is not null then
    update public.room_members set left_at = now() where id = mine.id;
  end if;

  if not leader then
    update public.rooms
    set owner_phones = owner_phones - case when my_side = 'owner' then 1 else 0 end,
        guest_phones = guest_phones - case when my_side = 'guest' then 1 else 0 end
    where id = r.id
    returning * into r;
    perform private.write_pair_history(r.id, target_session_id);
    return r;
  end if;

  select * into heir from public.room_members
  where room_id = r.id and side = my_side and left_at is null and session_id <> target_session_id
  order by joined_at, id
  limit 1
  for update;
  if heir.id is not null then
    if my_side = 'owner' then
      update public.rooms
      set owner_session_id = heir.session_id, owner_alias = heir.alias,
          owner_profiled = heir.profiled, owner_phones = owner_phones - 1
      where id = r.id
      returning * into r;
    else
      update public.rooms
      set guest_session_id = heir.session_id, guest_alias = heir.alias,
          guest_profiled = heir.profiled, guest_phones = guest_phones - 1
      where id = r.id
      returning * into r;
    end if;
    -- A proposal stays the side's (22.3 keys it by side): the new leader holds it.
    update public.game_proposals set proposer_session_id = heir.session_id
    where room_id = r.id and proposer_session_id = target_session_id;
    perform private.write_pair_history(r.id, target_session_id);
    return r;
  end if;

  if r.guest_session_id is null then
    update public.rooms set status = 'closed', closed_at = now() where id = r.id
    returning * into r;
    return r;
  end if;
  return private.end_two_sided_room(r.id);
end;
$$;

-- A table's member rows in rooms that are over close when it starts or joins another room.
create or replace function private.close_stale_member_rows(target_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_members rm set left_at = now()
  from public.rooms r
  where r.id = rm.room_id
    and rm.session_id = target_session_id and rm.left_at is null
    and r.status not in ('waiting', 'active');
end;
$$;

-- The phones of a room, to its members, while it lasts.
create or replace function public.room_phones(target_room_id uuid)
returns table (
  session_id uuid, side text, alias text, profiled boolean, is_leader boolean,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select rm.session_id, rm.side, rm.alias, rm.profiled,
         rm.session_id = r.owner_session_id or rm.session_id is not distinct from r.guest_session_id,
         rm.joined_at
  from public.rooms r
  join public.room_members rm on rm.room_id = r.id
  where r.id = target_room_id
    and private.is_room_member(r.id)
    and r.status in ('waiting', 'active')
    and rm.left_at is null
  order by rm.side desc, rm.joined_at, rm.id;
$$;

-- The profiled phones' profile ids, to the room's members, while it lasts (rule 4).
create or replace function public.room_member_profiles(target_room_id uuid)
returns table (session_id uuid, public_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (rm.session_id) rm.session_id, p.public_id
  from public.rooms r
  join public.table_sessions me
    on me.user_id = (select auth.uid()) and me.status = 'active'
  join public.room_members rm on rm.room_id = r.id
  join public.table_sessions other on other.id = rm.session_id
  join public.profiles p on p.id = other.user_id
  where r.id = target_room_id
    and (me.id in (r.owner_session_id, r.guest_session_id)
         or exists (
           select 1 from public.room_members mine
           where mine.room_id = r.id and mine.session_id = me.id and mine.left_at is null
         ))
    and rm.profiled
    and other.user_id <> me.user_id
    and r.status in ('waiting', 'active')
    and rm.left_at is null
    and not private.is_blocked_between(me.user_id, other.user_id)
  order by rm.session_id;
$$;

create or replace function public.room_member_profile(target_room_id uuid)
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
   and other.id <> me.id and other.status = 'active'
  join public.profiles p on p.id = other.user_id
  where r.id = target_room_id
    and r.status in ('waiting', 'active')
    and case when other.id = r.owner_session_id then r.owner_profiled else r.guest_profiled end
    and not private.is_blocked_between(me.user_id, other.user_id)
  limit 1;
$$;

create or replace function private.shares_room_with_profile(viewer uuid, target uuid)
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
    where r.status in ('waiting', 'active')
      and case when other.id = r.owner_session_id then r.owner_profiled else r.guest_profiled end
  );
$$;

-- 3. The lobby hold ---------------------------------------------------------------------------------
-- A table is listed from the moment it waits; no window holds it back.
create or replace function public.venue_lobby(target_venue_id uuid)
returns table (
  room_id uuid, alias text, headcount smallint, intent text, waiting_since timestamptz,
  profiled boolean, spot_id uuid, spot_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select ts.id as session_id, ts.user_id, ts.team_capable
    from public.table_sessions ts
    where ts.user_id = (select auth.uid())
      and ts.venue_id = target_venue_id
      and ts.status = 'active'
      and ts.expires_at > now()
  )
  select r.id, r.owner_alias, private.side_headcount(r.owner_headcount, r.owner_phones), r.intent,
         r.waiting_since,
         false,
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
    and not exists (
      select 1 from public.room_members rm
      where rm.room_id = r.id and rm.session_id = me.session_id and rm.left_at is null
    )
    and owner.status = 'active'
    and owner.expires_at > now()
    and not private.room_blocked_for(r.id, me.user_id)
    and (r.owner_phones = 1 or me.team_capable)
    and not exists (
      select 1 from public.join_requests jr
      where jr.room_id = r.id
        and jr.requester_session_id = me.session_id
        and not jr.as_member
        and jr.status <> 'accepted'
        and jr.expires_at <= now()
    )
  order by 5;
$$;

create or replace function public.venue_running_rooms(target_venue_id uuid)
returns table (
  room_id uuid, owner_alias text, guest_alias text, owner_phones smallint, guest_phones smallint,
  owner_headcount smallint, guest_headcount smallint, owner_open boolean, guest_open boolean,
  spot_id uuid, spot_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select ts.id as session_id, ts.user_id, ts.team_capable
    from public.table_sessions ts
    where ts.user_id = (select auth.uid())
      and ts.venue_id = target_venue_id
      and ts.status = 'active'
      and ts.expires_at > now()
  )
  select r.id, r.owner_alias, r.guest_alias, r.owner_phones, r.guest_phones,
         private.side_headcount(r.owner_headcount, r.owner_phones),
         private.side_headcount(r.guest_headcount, r.guest_phones),
         me.team_capable and r.owner_phones < private.max_side_phones(),
         me.team_capable and r.guest_phones < private.max_side_phones(),
         r.spot_id,
         sp.name
  from public.rooms r
  join public.table_sessions owner on owner.id = r.owner_session_id
  join public.table_sessions guest on guest.id = r.guest_session_id
  left join public.venue_spots sp on sp.id = r.spot_id
  cross join me
  where r.venue_id = target_venue_id
    and r.status = 'active'
    and r.visibility = 'open'
    and owner.team_capable
    and guest.team_capable
    and owner.status = 'active' and owner.expires_at > now()
    and guest.status = 'active' and guest.expires_at > now()
    and me.session_id not in (r.owner_session_id, r.guest_session_id)
    and not exists (
      select 1 from public.room_members rm
      where rm.room_id = r.id and rm.session_id = me.session_id and rm.left_at is null
    )
    and not private.room_blocked_for(r.id, me.user_id)
  order by r.guest_joined_at, r.id;
$$;

drop function public.rooms_lobby_held(uuid);
drop function private.room_listed_from(uuid);
drop function private.lobby_listed_from(uuid);

-- 4. The window's functions -------------------------------------------------------------------------
select cron.unschedule('close-expired-reveals');

drop function public.reveal_decide(uuid, uuid, boolean, jsonb);
drop function public.reveal_finalize(uuid, uuid);
drop function public.reveal_matches(uuid, uuid);
drop function private.close_expired_reveals();
drop function private.finish_reveal(uuid, boolean);
drop function private.start_reveal(uuid, integer);
drop function private.reveal_participants(public.rooms);
drop function private.reveal_colors();
drop function private.reveal_emojis();
drop function private.reveal_decision_seconds();
drop function private.table_end_on();

-- 5. Tables and columns -----------------------------------------------------------------------------
drop table public.reveal_signals;
drop table public.reveal_decisions;

alter table public.rooms
  drop column reveal_ends_at,
  drop column reveal_result,
  drop column reveal_token;

-- 6. Realtime (§23.I) -------------------------------------------------------------------------------
-- The room's channels: the two leaders and the phones in the room (rule 9, Faz 2), with no window.
create or replace function private.realtime_topic_allowed(channel_topic text, sending boolean)
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
  elsif kind = 'venue_chat' then
    return not sending
      and (private.venue_chat_session((select auth.uid()), target_id)).id is not null;
  elsif kind = 'session' then
    return not sending and exists (
      select 1 from public.table_sessions
      where id = target_id and user_id = (select auth.uid())
    );
  elsif kind in ('room', 'messages', 'game', 'presence') then
    return private.is_room_member(target_id);
  elsif kind = 'inbox' then
    return not sending and target_id = (select auth.uid());
  elsif kind = 'dm' then
    return not sending and exists (
      select 1 from public.dm_threads
      where id = target_id and (select auth.uid()) in (user_a, user_b)
    );
  elsif kind = 'dm_typing' then
    return exists (
      select 1 from public.dm_threads t
      where t.id = target_id and (select auth.uid()) in (t.user_a, t.user_b)
        and not private.is_blocked_between(t.user_a, t.user_b)
    );
  end if;
  return false;
end;
$$;
