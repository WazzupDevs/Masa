-- Replies and reactions in the three chats (docs/SPEC_V3.md §21): the DM, the room chat and the
-- venue chat.
--
-- Replies: each message table gets reply_to_id (on delete set null) and `replied`, so a reply whose
-- quoted message is gone still says so ("Mesaj artık yok"). The quote is never copied: the pages
-- build it when read, by the reader's own rules (rule 4: never an account id, a public_id or a
-- photo; a profiled venue message by its display name, an anonymous one by its alias).
--
-- Reactions: one per person per message (DM and venue chat: the account; room chat: the table
-- session), set, changed or removed through the Edge Functions (rule 1). The venue chat answers
-- only counts per emoji, never who (rule 4); the room chat the table aliases; the DM from_me.
--
-- Realtime (rule 9): no new channel; the function sends a data-free broadcast on the message's own
-- channel (dm:, messages:, venue_chat:) and the reader reads its page again.
-- Lock order (rule 10): a reaction table right after its message table; the venue chat's reaction
-- limit after venue_chat_rate. A reply takes no new lock (the quoted message is read unlocked).

-- Columns -----------------------------------------------------------------------------------------
alter table public.messages
  add column reply_to_id uuid references public.messages (id) on delete set null,
  add column replied boolean not null default false;
alter table public.dm_messages
  add column reply_to_id uuid references public.dm_messages (id) on delete set null,
  add column replied boolean not null default false;
alter table public.venue_chat_messages
  add column reply_to_id uuid references public.venue_chat_messages (id) on delete set null,
  add column replied boolean not null default false;

-- Tables (rule 2: RLS on; no client policy, reads go through the pages) ---------------------------
create table public.dm_reactions (
  message_id uuid not null references public.dm_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.dm_reactions enable row level security;
revoke all on table public.dm_reactions from anon, authenticated;

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, session_id)
);
create index message_reactions_session_idx on public.message_reactions (session_id);
alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from anon, authenticated;

create table public.venue_chat_reactions (
  message_id uuid not null references public.venue_chat_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index venue_chat_reactions_user_idx on public.venue_chat_reactions (user_id);
create index dm_reactions_user_idx on public.dm_reactions (user_id);
alter table public.venue_chat_reactions enable row level security;
revoke all on table public.venue_chat_reactions from anon, authenticated;

-- The venue chat's reaction limit (§21.2): per account, window_max requests per window.
create table public.venue_chat_reaction_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  count integer not null
);
alter table public.venue_chat_reaction_rate enable row level security;
revoke all on table public.venue_chat_reaction_rate from anon, authenticated;

-- Quotes and reaction summaries (private) ---------------------------------------------------------
-- null without a reply; { gone: true } when the quoted message is deleted or the reader cannot
-- see it (which one is not told).
create function private.dm_quote(viewer uuid, m public.dm_messages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not m.replied then null
    when q.id is null then jsonb_build_object('gone', true)
    else jsonb_build_object('id', q.id, 'body', left(q.body, 80), 'from_me', q.sender_user_id = viewer)
  end
  from (select 1) one
  left join public.dm_messages q on q.id = m.reply_to_id and q.thread_id = m.thread_id;
$$;

create function private.dm_reaction_list(viewer uuid, target_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('emoji', r.emoji, 'from_me', r.user_id = viewer)
      order by r.created_at, r.user_id = viewer),
    '[]'::jsonb)
  from public.dm_reactions r
  where r.message_id = target_message_id;
$$;

create function private.venue_quote(viewer uuid, m public.venue_chat_messages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not m.replied then null
    when q.id is null or q.venue_id <> m.venue_id then jsonb_build_object('gone', true)
    else jsonb_build_object(
      'id', q.id,
      'body', left(q.body, 80),
      'from_me', q.sender_user_id = viewer,
      'name', case when q.profiled then p.display_name else q.sender_alias end
    )
  end
  from (select 1) one
  left join lateral (
    select v.* from private.visible_venue_chat_message(viewer, m.reply_to_id) v
    where v.id is not null
  ) q on true
  left join public.profiles p on p.id = q.sender_user_id;
$$;

-- Per emoji: how many and whether the caller is one of them. Never who.
create function private.venue_reaction_list(viewer uuid, target_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('emoji', e.emoji, 'count', e.n, 'mine', e.mine)
      order by e.first_at),
    '[]'::jsonb)
  from (
    select r.emoji, count(*)::int as n, bool_or(r.user_id = viewer) as mine,
           min(r.created_at) as first_at
    from public.venue_chat_reactions r
    where r.message_id = target_message_id
    group by r.emoji
  ) e;
$$;

-- The room chat: the quote by its table alias; gone when deleted or older than the reader's
-- joining (a guest reads from guest_joined_at on, like the messages' own policy).
create function private.room_quote(viewer_session uuid, m public.messages)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not m.replied then null
    when q.id is null
      or (r.guest_session_id = viewer_session and r.owner_session_id <> viewer_session
          and q.created_at < r.guest_joined_at)
      then jsonb_build_object('gone', true)
    else jsonb_build_object(
      'id', q.id, 'body', left(q.body, 80), 'from_me', q.session_id = viewer_session,
      'name', q.sender_alias
    )
  end
  from public.rooms r
  left join public.messages q on q.id = m.reply_to_id and q.room_id = m.room_id
  where r.id = m.room_id;
$$;

-- Per emoji: how many, the reacting tables' aliases, and whether the caller's table is one.
create function private.room_reaction_list(viewer_session uuid, target_message_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('emoji', e.emoji, 'count', e.n, 'aliases', e.aliases,
                                 'mine', e.mine)
      order by e.first_at),
    '[]'::jsonb)
  from (
    select r.emoji, count(*)::int as n,
           jsonb_agg(ts.alias order by r.created_at) as aliases,
           bool_or(r.session_id = viewer_session) as mine,
           min(r.created_at) as first_at
    from public.message_reactions r
    join public.table_sessions ts on ts.id = r.session_id
    where r.message_id = target_message_id
    group by r.emoji
  ) e;
$$;

revoke all on function private.dm_quote(uuid, public.dm_messages) from public, anon, authenticated;
revoke all on function private.dm_reaction_list(uuid, uuid) from public, anon, authenticated;
revoke all on function private.venue_quote(uuid, public.venue_chat_messages)
  from public, anon, authenticated;
revoke all on function private.venue_reaction_list(uuid, uuid) from public, anon, authenticated;
revoke all on function private.room_quote(uuid, public.messages) from public, anon, authenticated;
revoke all on function private.room_reaction_list(uuid, uuid) from public, anon, authenticated;

-- Send with a reply (service role) ----------------------------------------------------------------
-- Each send takes reply_to (default null, so the deployed functions keep working until the new
-- ones are out). The quoted message must be in the same room, thread or venue and visible to the
-- sender now; otherwise reply_unavailable and nothing is written.
drop function public.chat_send(uuid, uuid, text, integer);

create function public.chat_send(
  target_user_id uuid,
  target_room_id uuid,
  new_body text,
  min_interval_ms integer,
  reply_to uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  s public.table_sessions;
  r public.rooms;
  created public.messages;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into s from public.table_sessions where id = m.session_id;

  if reply_to is not null then
    select * into r from public.rooms where id = target_room_id;
    if not exists (
      select 1 from public.messages q
      where q.id = reply_to and q.room_id = target_room_id
        and (m.is_owner or q.created_at >= r.guest_joined_at)
    ) then
      raise exception using errcode = 'P0001', message = 'reply_unavailable';
    end if;
  end if;

  if exists (
    select 1 from public.messages
    where session_id = s.id
      and created_at > clock_timestamp() - make_interval(secs => min_interval_ms / 1000.0)
  ) then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.messages
    (room_id, session_id, sender_alias, body, created_at, reply_to_id, replied)
  values
    (target_room_id, s.id, s.alias, new_body, clock_timestamp(), reply_to, reply_to is not null)
  returning * into created;

  update public.rooms set last_activity_at = now() where id = target_room_id;
  return created;
end;
$$;

drop function public.dm_send_message(uuid, uuid, text, integer);
drop function public.dm_send(uuid, uuid, text, integer);

create function public.dm_send(
  target_user_id uuid,
  target_thread_id uuid,
  new_body text,
  min_interval_ms integer,
  reply_to uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.dm_threads;
  other uuid;
begin
  select * into t from public.dm_threads
  where id = target_thread_id and target_user_id in (user_a, user_b)
  for update;
  if t.id is null then
    raise exception using errcode = 'P0001', message = 'not_friends';
  end if;
  other := case when t.user_a = target_user_id then t.user_b else t.user_a end;
  if private.is_blocked_between(target_user_id, other) then
    raise exception using errcode = 'P0001', message = 'not_friends';
  end if;
  if reply_to is not null and not exists (
    select 1 from public.dm_messages where id = reply_to and thread_id = t.id
  ) then
    raise exception using errcode = 'P0001', message = 'reply_unavailable';
  end if;
  if exists (
    select 1 from public.dm_messages
    where sender_user_id = target_user_id
      and created_at > now() - make_interval(secs => min_interval_ms / 1000.0)
  ) then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.dm_messages (thread_id, sender_user_id, body, reply_to_id, replied)
  values (t.id, target_user_id, new_body, reply_to, reply_to is not null);
  update public.dm_threads set last_message_at = now() where id = t.id;
  insert into public.dm_reads (thread_id, user_id, last_read_at)
  values (t.id, target_user_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return other;
end;
$$;

create function public.dm_send_message(
  target_user_id uuid,
  target_thread_id uuid,
  new_body text,
  min_interval_ms integer,
  reply_to uuid default null
)
returns table (other_user_id uuid, message_id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  other uuid;
begin
  other := public.dm_send(target_user_id, target_thread_id, new_body, min_interval_ms, reply_to);
  -- The row dm_send just wrote: the rate limit allows one per sender per transaction time.
  return query
    select other, m.id, m.created_at
    from public.dm_messages m
    where m.thread_id = target_thread_id
      and m.sender_user_id = target_user_id
      and m.created_at = now()
    order by m.id
    limit 1;
end;
$$;

drop function public.venue_chat_send(uuid, uuid, text, boolean, integer, integer, integer);

create function public.venue_chat_send(
  target_user_id uuid,
  target_venue_id uuid,
  new_body text,
  profiled boolean,
  min_interval_ms integer,
  window_seconds integer,
  window_max integer,
  reply_to uuid default null
)
returns public.venue_chat_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts public.table_sessions;
  rate public.venue_chat_rate;
  msg public.venue_chat_messages;
begin
  select * into ts from public.table_sessions
  where user_id = target_user_id and venue_id = target_venue_id
    and status = 'active' and expires_at > now()
  for no key update;
  if ts.id is null then
    raise exception using errcode = 'P0001', message = 'no_active_table';
  end if;
  if reply_to is not null and (
    (private.visible_venue_chat_message(target_user_id, reply_to)).venue_id
      is distinct from target_venue_id
  ) then
    raise exception using errcode = 'P0001', message = 'reply_unavailable';
  end if;

  insert into public.venue_chat_rate (user_id, window_started_at, count, last_sent_at)
  values (target_user_id, '-infinity', 0, '-infinity')
  on conflict (user_id) do nothing;
  select * into rate from public.venue_chat_rate where user_id = target_user_id for update;
  if now() - rate.last_sent_at < make_interval(secs => min_interval_ms / 1000.0) then
    raise exception using errcode = 'P0001', message = 'too_soon';
  end if;
  if now() - rate.window_started_at >= make_interval(secs => window_seconds) then
    update public.venue_chat_rate
    set window_started_at = now(), count = 1, last_sent_at = now()
    where user_id = target_user_id;
  elsif rate.count >= window_max then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  else
    update public.venue_chat_rate
    set count = count + 1, last_sent_at = now()
    where user_id = target_user_id;
  end if;

  insert into public.venue_chat_messages
    (venue_id, session_id, sender_user_id, sender_alias, profiled, body, reply_to_id, replied)
  values
    (target_venue_id, ts.id, target_user_id, ts.alias, profiled, new_body, reply_to,
     reply_to is not null)
  returning * into msg;
  return msg;
end;
$$;

-- React (service role) ----------------------------------------------------------------------------
-- new_emoji null removes the caller's reaction. The emoji is checked in the Edge Function
-- (pure/reactions.ts). Each returns the channel's id (thread, room or venue) and whether anything
-- changed, so a repeat sends no broadcast. A message the caller cannot see answers not_found, like
-- one that does not exist.
create function public.dm_react(target_user_id uuid, target_message_id uuid, new_emoji text)
returns table (thread_id uuid, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.dm_messages;
  t public.dm_threads;
  before_emoji text;
begin
  select * into msg from public.dm_messages where id = target_message_id;
  if msg.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into t from public.dm_threads
  where id = msg.thread_id and target_user_id in (user_a, user_b)
  for update;
  if t.id is null or private.is_blocked_between(t.user_a, t.user_b) then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  select emoji into before_emoji from public.dm_reactions
  where message_id = msg.id and user_id = target_user_id;
  if new_emoji is null then
    delete from public.dm_reactions where message_id = msg.id and user_id = target_user_id;
  else
    insert into public.dm_reactions (message_id, user_id, emoji)
    values (msg.id, target_user_id, new_emoji)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now()
    where public.dm_reactions.emoji <> excluded.emoji;
  end if;
  return query select t.id, before_emoji is distinct from new_emoji;
end;
$$;

create function public.chat_react(target_user_id uuid, target_message_id uuid, new_emoji text)
returns table (room_id uuid, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.messages;
  m record;
  r public.rooms;
  before_emoji text;
begin
  -- Read unlocked first (rule 10: the session and the room lock before the room's rows).
  select * into msg from public.messages where id = target_message_id;
  if msg.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into m from private.room_membership(target_user_id, msg.room_id);
  select * into r from public.rooms where id = msg.room_id;
  if not m.is_owner and msg.created_at < r.guest_joined_at then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  select emoji into before_emoji from public.message_reactions
  where message_id = msg.id and session_id = m.session_id;
  if new_emoji is null then
    delete from public.message_reactions where message_id = msg.id and session_id = m.session_id;
  else
    insert into public.message_reactions (message_id, session_id, emoji)
    values (msg.id, m.session_id, new_emoji)
    on conflict (message_id, session_id) do update set emoji = excluded.emoji, created_at = now()
    where public.message_reactions.emoji <> excluded.emoji;
  end if;
  return query select msg.room_id, before_emoji is distinct from new_emoji;
end;
$$;

create function public.venue_chat_react(
  target_user_id uuid,
  target_message_id uuid,
  new_emoji text,
  window_seconds integer,
  window_max integer
)
returns table (venue_id uuid, changed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  msg public.venue_chat_messages;
  ts public.table_sessions;
  rate public.venue_chat_reaction_rate;
  before_emoji text;
begin
  -- A hidden message takes no reaction, not even from its sender.
  select * into msg from private.visible_venue_chat_message(target_user_id, target_message_id);
  if msg.id is null or msg.hidden_at is not null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;
  select * into ts from public.table_sessions
  where id = (private.venue_chat_session(target_user_id, msg.venue_id)).id
  for no key update;
  if ts.id is null then
    raise exception using errcode = 'P0001', message = 'not_found';
  end if;

  insert into public.venue_chat_reaction_rate (user_id, window_started_at, count)
  values (target_user_id, '-infinity', 0)
  on conflict (user_id) do nothing;
  select * into rate from public.venue_chat_reaction_rate
  where user_id = target_user_id for update;
  if now() - rate.window_started_at >= make_interval(secs => window_seconds) then
    update public.venue_chat_reaction_rate set window_started_at = now(), count = 1
    where user_id = target_user_id;
  elsif rate.count >= window_max then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  else
    update public.venue_chat_reaction_rate set count = count + 1 where user_id = target_user_id;
  end if;

  select emoji into before_emoji from public.venue_chat_reactions
  where message_id = msg.id and user_id = target_user_id;
  if new_emoji is null then
    delete from public.venue_chat_reactions
    where message_id = msg.id and user_id = target_user_id;
  else
    insert into public.venue_chat_reactions (message_id, user_id, emoji)
    values (msg.id, target_user_id, new_emoji)
    on conflict (message_id, user_id) do update set emoji = excluded.emoji, created_at = now()
    where public.venue_chat_reactions.emoji <> excluded.emoji;
  end if;
  return query select msg.venue_id, before_emoji is distinct from new_emoji;
end;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.chat_send(uuid, uuid, text, integer, uuid)',
    'public.dm_send(uuid, uuid, text, integer, uuid)',
    'public.dm_send_message(uuid, uuid, text, integer, uuid)',
    'public.venue_chat_send(uuid, uuid, text, boolean, integer, integer, integer, uuid)',
    'public.dm_react(uuid, uuid, text)',
    'public.chat_react(uuid, uuid, text)',
    'public.venue_chat_react(uuid, uuid, text, integer, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Pages -------------------------------------------------------------------------------------------
-- The DM page, as before plus reply_to and reactions ([{ emoji, from_me }]).
drop function public.dm_messages_page(uuid, timestamptz);

create function public.dm_messages_page(target_thread_id uuid, before timestamptz default null)
returns table (
  id uuid,
  body text,
  created_at timestamptz,
  from_me boolean,
  status text,
  reply_to jsonb,
  reactions jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.body, m.created_at, m.sender_user_id = (select auth.uid()),
         case when m.sender_user_id = (select auth.uid())
           then private.dm_status(t.id, m.sender_user_id, m.created_at)
         end,
         private.dm_quote((select auth.uid()), m),
         private.dm_reaction_list((select auth.uid()), m.id)
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

-- The venue chat page behind venue-chat/page, as before plus reply_to and reactions
-- ([{ emoji, count, mine }]).
drop function public.venue_chat_page_for(uuid, uuid, timestamptz, integer);

create function public.venue_chat_page_for(
  target_user_id uuid,
  target_venue_id uuid,
  before timestamptz default null,
  page_size integer default 50
)
returns table (
  id uuid,
  profiled boolean,
  sender_alias text,
  display_name text,
  photo_path text,
  body text,
  created_at timestamptz,
  from_me boolean,
  reply_to jsonb,
  reactions jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.profiled,
         case when m.profiled then null else m.sender_alias end,
         case when m.profiled then p.display_name else null end,
         case when m.profiled and p.photo_hidden_at is null then p.photo_path else null end,
         m.body, m.created_at, m.sender_user_id = target_user_id,
         private.venue_quote(target_user_id, m),
         private.venue_reaction_list(target_user_id, m.id)
  from public.venue_chat_messages m
  left join public.profiles p on p.id = m.sender_user_id
  where m.venue_id = target_venue_id
    and (private.venue_chat_session(target_user_id, target_venue_id)).id is not null
    and (before is null or m.created_at < before)
    and (m.hidden_at is null or m.sender_user_id = target_user_id)
    and not private.is_blocked_between(target_user_id, m.sender_user_id)
  order by m.created_at desc
  limit least(greatest(page_size, 1), 100);
$$;

revoke all on function public.venue_chat_page_for(uuid, uuid, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.venue_chat_page_for(uuid, uuid, timestamptz, integer)
  to service_role;

-- The room chat's quotes and reactions (client, read only): the messages themselves still come
-- from the table (RLS) and Postgres Changes. Only rows with a reply or a reaction, for a member of
-- the room, by the messages' own policy (a guest from guest_joined_at on). Table aliases and
-- session ids only, never an account id.
create function public.room_chat_extras(target_room_id uuid)
returns table (message_id uuid, reply_to jsonb, reactions jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select ts.id as session_id, r.owner_session_id = ts.id as is_owner, r.guest_joined_at
    from public.rooms r
    join public.table_sessions ts
      on ts.user_id = (select auth.uid()) and ts.id in (r.owner_session_id, r.guest_session_id)
    where r.id = target_room_id
    limit 1
  )
  select m.id,
         private.room_quote(v.session_id, m),
         private.room_reaction_list(v.session_id, m.id)
  from viewer v
  join public.messages m on m.room_id = target_room_id
  where (v.is_owner or m.created_at >= v.guest_joined_at)
    and (m.replied or exists (select 1 from public.message_reactions x where x.message_id = m.id));
$$;

revoke all on function public.room_chat_extras(uuid) from public, anon;
grant execute on function public.room_chat_extras(uuid) to authenticated;
