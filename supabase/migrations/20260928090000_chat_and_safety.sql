-- M4: chat, profanity list, reports, blocking actions and cleanup jobs.

-- profanity_terms ----------------------------------------------------------------
-- Seeded from content/profanity-tr.json; only server code reads it.
create table public.profanity_terms (
  term text primary key
);

alter table public.profanity_terms enable row level security;
revoke all on table public.profanity_terms from anon, authenticated;

-- Guest join time ------------------------------------------------------------------
-- A guest reads the room's messages from the moment it joined, never an earlier guest's.
alter table public.rooms add column guest_joined_at timestamptz;

create function private.set_guest_joined_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.guest_session_id is distinct from old.guest_session_id then
    new.guest_joined_at := case when new.guest_session_id is null then null else now() end;
  end if;
  return new;
end;
$$;

revoke all on function private.set_guest_joined_at() from public, anon, authenticated;

create trigger rooms_guest_joined_at
  before update of guest_session_id on public.rooms
  for each row
  execute function private.set_guest_joined_at();

-- messages -------------------------------------------------------------------------
-- Written only by the chat Edge Function. sender_alias is copied so messages stay readable after
-- the sender's table leaves the room.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  sender_alias text not null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

create index messages_room_idx on public.messages (room_id, created_at);
create index messages_session_idx on public.messages (session_id, created_at);

alter table public.messages enable row level security;
revoke all on table public.messages from anon, authenticated;
grant select on table public.messages to authenticated;

create function private.can_read_room_message(target_room_id uuid, sent_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.rooms r
    join public.table_sessions ts on ts.user_id = (select auth.uid())
    where r.id = target_room_id
      and (
        ts.id = r.owner_session_id
        or (ts.id = r.guest_session_id and sent_at >= r.guest_joined_at)
      )
  );
$$;

revoke all on function private.can_read_room_message(uuid, timestamptz) from public, anon;
grant execute on function private.can_read_room_message(uuid, timestamptz) to authenticated;

create policy "messages: room members read (guests since joining)"
  on public.messages for select
  to authenticated
  using (private.can_read_room_message(room_id, created_at));

alter publication supabase_realtime add table public.messages;

-- reports ---------------------------------------------------------------------------
-- Kept 30 days; no client access. The snapshot is the last 50 messages the reporter could see.
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  reported_user_id uuid references auth.users (id) on delete set null,
  room_id uuid references public.rooms (id) on delete set null,
  reason text not null check (reason in ('harassment', 'inappropriate', 'spam', 'other')),
  messages_snapshot jsonb not null,
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
revoke all on table public.reports from anon, authenticated;

-- Helpers -----------------------------------------------------------------------------
-- The caller's active table and its role in the room; raises not_in_room otherwise.
create function private.room_membership(target_user_id uuid, target_room_id uuid)
returns table (session_id uuid, is_owner boolean, other_session_id uuid, other_alias text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  r public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.id is null
    or r.status = 'closed'
    or (r.owner_session_id <> s.id and r.guest_session_id is distinct from s.id)
  then
    raise exception using errcode = 'P0001', message = 'not_in_room';
  end if;

  if r.owner_session_id = s.id then
    return query select s.id, true, r.guest_session_id, r.guest_alias;
  else
    return query select s.id, false, r.owner_session_id, r.owner_alias;
  end if;
end;
$$;

revoke all on function private.room_membership(uuid, uuid) from public, anon, authenticated;

-- chat_send (service role only) ----------------------------------------------------------
-- The Edge Function has already checked length and profanity. One message per table per
-- min_interval_ms (MVP_SPEC §7).
create function public.chat_send(
  target_user_id uuid,
  target_room_id uuid,
  new_body text,
  min_interval_ms integer
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  s public.table_sessions;
  created public.messages;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into s from public.table_sessions where id = m.session_id;

  if exists (
    select 1 from public.messages
    where session_id = s.id
      and created_at > clock_timestamp() - make_interval(secs => min_interval_ms / 1000.0)
  ) then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.messages (room_id, session_id, sender_alias, body, created_at)
  values (target_room_id, s.id, s.alias, new_body, clock_timestamp())
  returning * into created;

  update public.rooms set last_activity_at = now() where id = target_room_id;
  return created;
end;
$$;

-- safety_report (service role only) --------------------------------------------------------
create function public.safety_report(target_user_id uuid, target_room_id uuid, new_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  reported uuid;
  snapshot jsonb;
  guest_since timestamptz;
  report_id uuid;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select user_id into reported from public.table_sessions where id = m.other_session_id;
  select case when m.is_owner then null else guest_joined_at end into guest_since
  from public.rooms where id = target_room_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'alias', last50.sender_alias, 'body', last50.body, 'created_at', last50.created_at
         ) order by last50.created_at), '[]'::jsonb)
  into snapshot
  from (
    select sender_alias, body, created_at from public.messages
    where room_id = target_room_id and (guest_since is null or created_at >= guest_since)
    order by created_at desc
    limit 50
  ) last50;

  insert into public.reports (reporter_id, reported_user_id, room_id, reason, messages_snapshot)
  values (target_user_id, reported, target_room_id, new_reason, snapshot)
  returning id into report_id;
  return report_id;
end;
$$;

-- safety_block (service role only) -------------------------------------------------------------
-- Blocks the other table's account (user based, MVP_SPEC §8) and takes the blocker out of the
-- room. Returns the room so the caller can refresh the lobby.
create function public.safety_block(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  blocked uuid;
  result public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  if m.other_session_id is null then
    raise exception using errcode = 'P0001', message = 'nothing_to_block';
  end if;
  select user_id into blocked from public.table_sessions where id = m.other_session_id;

  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, blocked, m.other_alias)
  on conflict (blocker_id, blocked_id) do nothing;

  perform private.release_rooms_of_session(m.session_id);
  select * into result from public.rooms where id = target_room_id;
  return result;
end;
$$;

create function public.safety_unblock(target_user_id uuid, target_blocked_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from public.blocks
    where blocker_id = target_user_id and blocked_id = target_blocked_id
    returning 1
  )
  select exists (select 1 from removed);
$$;

revoke all on function public.chat_send(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.safety_report(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.safety_block(uuid, uuid) from public, anon, authenticated;
revoke all on function public.safety_unblock(uuid, uuid) from public, anon, authenticated;
grant execute on function public.chat_send(uuid, uuid, text, integer) to service_role;
grant execute on function public.safety_report(uuid, uuid, text) to service_role;
grant execute on function public.safety_block(uuid, uuid) to service_role;
grant execute on function public.safety_unblock(uuid, uuid) to service_role;

-- Cleanup (hourly) ---------------------------------------------------------------------------
-- Messages go 24 hours after their room closed; reports (with their copies) after 30 days.
create function private.delete_old_messages()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.messages m
  using public.rooms r
  where r.id = m.room_id and r.status = 'closed' and r.closed_at <= now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

create function private.delete_old_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.reports where created_at <= now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.delete_old_messages() from public, anon, authenticated;
revoke all on function private.delete_old_reports() from public, anon, authenticated;

select cron.schedule('delete-old-messages', '0 * * * *', $$select private.delete_old_messages()$$);
select cron.schedule('delete-old-reports', '0 * * * *', $$select private.delete_old_reports()$$);
