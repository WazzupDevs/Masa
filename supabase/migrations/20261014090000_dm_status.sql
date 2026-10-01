-- v3 step 6, PR 2 (docs/SPEC_V3.md §18.2): the Mesajlar list, the ticks of a DM and the typing
-- channel.
--
-- Ticks: each own message is 'sent', 'delivered' or 'read', from the other member's dm_reads row.
-- Only the status reaches the client, never the other member's times. 'read' is last_read_at
-- (dm/read, also set when they send); 'delivered' is the new last_delivered_at (dm/delivered, which
-- the app calls when it comes to the foreground and on an inbox broadcast: with the app closed
-- nothing is delivered). When a status really moves, the dm function broadcasts dm_status on
-- dm:{thread_id} without data; the sender rereads the page. This replaces "no read receipts" of
-- docs/SPEC_V2.md §7.
--
-- Lock order (rule 10): dm_threads → dm_messages, dm_reads. The new writes lock dm_reads only.

alter table public.dm_reads add column last_delivered_at timestamptz;

-- The status of a message from `sender` for the thread's other member: read when their read mark
-- has reached it, delivered when their delivery mark has, sent otherwise.
create function private.dm_status(
  target_thread_id uuid,
  sender uuid,
  sent_at timestamptz
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when r.last_read_at >= sent_at then 'read'
           when r.last_delivered_at >= sent_at then 'delivered'
           else 'sent'
         end
  from (select 1) as one
  left join public.dm_reads r on r.thread_id = target_thread_id and r.user_id <> sender;
$$;

revoke all on function private.dm_status(uuid, uuid, timestamptz) from public, anon, authenticated;

-- dm/read: also whether a message of the other member became read (the dm function then
-- broadcasts dm_status). The return type changes, so the function is replaced.
drop function public.dm_mark_read(uuid, uuid);

create function public.dm_mark_read(target_user_id uuid, target_thread_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous timestamptz;
begin
  if not exists (
    select 1 from public.dm_threads
    where id = target_thread_id and target_user_id in (user_a, user_b)
  ) then
    raise exception using errcode = 'P0001', message = 'not_friends';
  end if;
  select last_read_at into previous from public.dm_reads
  where thread_id = target_thread_id and user_id = target_user_id
  for update;
  insert into public.dm_reads (thread_id, user_id, last_read_at)
  values (target_thread_id, target_user_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return exists (
    select 1 from public.dm_messages m
    where m.thread_id = target_thread_id and m.sender_user_id <> target_user_id
      and m.created_at > coalesce(previous, '-infinity') and m.created_at <= now()
  );
end;
$$;

-- dm/delivered: in every thread of the caller, the delivery mark moves to the newest message of the
-- other member the caller's snapshot sees (not to now(), so a message committed later is not
-- marked). Returns the threads where a message changed from sent to delivered. A new dm_reads row
-- gets last_read_at -infinity: delivery is not reading.
create function public.dm_mark_delivered(target_user_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t record;
  newest timestamptz;
  r public.dm_reads;
begin
  for t in
    select id from public.dm_threads
    where target_user_id in (user_a, user_b)
    order by id
  loop
    select max(created_at) into newest from public.dm_messages
    where thread_id = t.id and sender_user_id <> target_user_id;
    continue when newest is null;

    select * into r from public.dm_reads
    where thread_id = t.id and user_id = target_user_id
    for update;
    continue when r.thread_id is not null
      and greatest(coalesce(r.last_delivered_at, '-infinity'), r.last_read_at) >= newest;

    insert into public.dm_reads (thread_id, user_id, last_read_at, last_delivered_at)
    values (t.id, target_user_id, '-infinity', newest)
    on conflict (thread_id, user_id) do update
      set last_delivered_at = greatest(public.dm_reads.last_delivered_at, excluded.last_delivered_at);
    return next t.id;
  end loop;
end;
$$;

-- Mesajlar (service role; the dm function signs the photo URLs like friends/list): one row per
-- friendship, newest conversation first; a friendship without messages by when it began. The
-- preview is cut to 80 characters here. No venue, no position, no active table.
create function public.dm_inbox(viewer uuid)
returns table (
  thread_id uuid,
  public_id uuid,
  display_name text,
  photo_path text,
  last_body text,
  last_from_me boolean,
  last_message_at timestamptz,
  unread_count integer,
  last_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, p.public_id, p.display_name,
         case when p.photo_hidden_at is null then p.photo_path end,
         left(last.body, 80),
         last.sender_user_id = viewer,
         last.created_at,
         coalesce((
           select count(*)::integer from public.dm_messages m
           left join public.dm_reads r on r.thread_id = t.id and r.user_id = viewer
           where m.thread_id = t.id and m.sender_user_id <> viewer
             and m.created_at > coalesce(r.last_read_at, '-infinity')
         ), 0),
         case when last.sender_user_id = viewer
           then private.dm_status(t.id, viewer, last.created_at)
         end
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = viewer then f.user_b else f.user_a end
  left join public.dm_threads t on t.user_a = f.user_a and t.user_b = f.user_b
  left join lateral (
    select m.body, m.sender_user_id, m.created_at from public.dm_messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) last on true
  where viewer in (f.user_a, f.user_b)
    and not private.is_blocked_between(f.user_a, f.user_b)
  order by coalesce(last.created_at, f.created_at) desc;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.dm_mark_read(uuid, uuid)',
    'public.dm_mark_delivered(uuid)',
    'public.dm_inbox(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- The DM page with the status of the caller's own messages (null on the other member's).
drop function public.dm_messages_page(uuid, timestamptz);

create function public.dm_messages_page(target_thread_id uuid, before timestamptz default null)
returns table (id uuid, body text, created_at timestamptz, from_me boolean, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.body, m.created_at, m.sender_user_id = (select auth.uid()),
         case when m.sender_user_id = (select auth.uid())
           then private.dm_status(t.id, m.sender_user_id, m.created_at)
         end
  from public.dm_messages m
  join public.dm_threads t on t.id = m.thread_id
  where t.id = target_thread_id
    and (select auth.uid()) in (t.user_a, t.user_b)
    and (before is null or m.created_at < before)
  order by m.created_at desc
  limit 50;
$$;

revoke all on function public.dm_messages_page(uuid, timestamptz) from public, anon;
grant execute on function public.dm_messages_page(uuid, timestamptz) to authenticated;

-- Realtime: dm_typing:{thread_id}, the one channel where clients send (rule 9). The two members
-- of the thread join and send while they are friends and neither blocks the other; a removed
-- friendship takes the thread with it. Event 'typing', empty payload, nothing stored. dm: and
-- inbox: stay server-only. Otherwise as in 20261012090000_venue_chat.sql.
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
    return exists (
      select 1
      from public.rooms r
      join public.table_sessions ts on ts.id in (r.owner_session_id, r.guest_session_id)
      where r.id = target_id and ts.user_id = (select auth.uid())
    );
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
