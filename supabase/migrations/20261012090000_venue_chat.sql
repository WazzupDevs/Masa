-- v3 step 5 (docs/SPEC_V3.md §7): one group chat per venue, for the accounts with an active table
-- there. Reads go through venue_chat_page (security definer, read only); writes through the
-- venue-chat, safety, profile and friends Edge Functions (service role). Numbers come from
-- pure/venueChat.ts as parameters.
--
-- Privacy (rules 4 and 9):
-- - A profiled message shows the display name and never the table alias; an anonymous one the
--   alias. The sender's account id and public_id never leave the server.
-- - Realtime carries a data-free `venue_chat` broadcast on venue_chat:{venue_id}.
-- Lock order (rule 10): table_sessions → venue_chat_rate → venue_chat_messages →
-- venue_chat_reports. A friend request from the chat starts at the pair lock, then
-- venue_chat_friend_presses → friend_requests.

-- Tables ------------------------------------------------------------------------------------------
create table public.venue_chat_messages (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  sender_alias text not null,
  profiled boolean not null,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now(),
  hidden_at timestamptz
);

create index venue_chat_messages_venue_idx
  on public.venue_chat_messages (venue_id, created_at desc);
create index venue_chat_messages_created_idx on public.venue_chat_messages (created_at);

alter table public.venue_chat_messages enable row level security;
revoke all on table public.venue_chat_messages from anon, authenticated;

create table public.venue_chat_reports (
  message_id uuid not null references public.venue_chat_messages (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, reporter_user_id)
);

alter table public.venue_chat_reports enable row level security;
revoke all on table public.venue_chat_reports from anon, authenticated;

create table public.venue_chat_rate (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null,
  count integer not null,
  last_sent_at timestamptz not null
);

alter table public.venue_chat_rate enable row level security;
revoke all on table public.venue_chat_rate from anon, authenticated;

-- "Arkadaşlık isteği gönder" presses from the chat. The sender's sent list comes from these, not
-- from request rows, so a request swallowed for any reason (blocked, declined before, over the
-- daily limit, already sent) looks exactly like one that waits (rule 5). Server only.
create table public.venue_chat_friend_presses (
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  to_name text,
  venue_name text,
  created_at timestamptz not null default now(),
  primary key (from_user_id, to_user_id)
);

alter table public.venue_chat_friend_presses enable row level security;
revoke all on table public.venue_chat_friend_presses from anon, authenticated;

-- Reports and friend requests learn the venue chat ------------------------------------------------
alter table public.reports drop constraint reports_target_type_check;
alter table public.reports
  add constraint reports_target_type_check
    check (target_type in ('room', 'dm', 'profile', 'history', 'venue_chat')),
  add column venue_chat_message_id uuid
    references public.venue_chat_messages (id) on delete set null;

alter table public.friend_requests
  alter column encounter_id drop not null,
  add column source text not null default 'encounter'
    check (source in ('encounter', 'venue_chat')),
  -- Venue name, the date and the names both sides showed; never the message text.
  add column venue_chat_context jsonb,
  add constraint friend_requests_source_check_encounter
    check ((source = 'encounter') = (encounter_id is not null));

-- Helpers -----------------------------------------------------------------------------------------
-- The caller's live table at the venue (status active and not expired), or null.
create function private.venue_chat_session(target_user_id uuid, target_venue_id uuid)
returns public.table_sessions
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.table_sessions
  where user_id = target_user_id and venue_id = target_venue_id
    and status = 'active' and expires_at > now()
  limit 1;
$$;

revoke all on function private.venue_chat_session(uuid, uuid) from public, anon, authenticated;

-- A message the caller may see now: it exists, the caller has a live table at its venue, there is
-- no block either way, and it is not hidden (its sender still sees it).
create function private.visible_venue_chat_message(target_user_id uuid, target_message_id uuid)
returns public.venue_chat_messages
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.venue_chat_messages m
  where m.id = target_message_id
    and (private.venue_chat_session(target_user_id, m.venue_id)).id is not null
    and not private.is_blocked_between(target_user_id, m.sender_user_id)
    and (m.hidden_at is null or m.sender_user_id = target_user_id);
$$;

revoke all on function private.visible_venue_chat_message(uuid, uuid)
  from public, anon, authenticated;

-- Send (service role) ------------------------------------------------------------------------------
-- The body is trimmed and filtered in the Edge Function (pure/chat.ts, pure/profanity.ts).
create function public.venue_chat_send(
  target_user_id uuid,
  target_venue_id uuid,
  new_body text,
  profiled boolean,
  min_interval_ms integer,
  window_seconds integer,
  window_max integer
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
    (venue_id, session_id, sender_user_id, sender_alias, profiled, body)
  values (target_venue_id, ts.id, target_user_id, ts.alias, profiled, new_body)
  returning * into msg;
  return msg;
end;
$$;

-- Read (client) ----------------------------------------------------------------------------------
-- The caller's venue chat, newest first, one page before `before`. Empty without a live table at
-- the venue. A profiled message carries the display name and no alias; an anonymous one the alias
-- and no name. Never an account id, a public_id or a photo.
create function public.venue_chat_page(
  target_venue_id uuid,
  before timestamptz default null,
  page_size integer default 50
)
returns table (
  id uuid,
  profiled boolean,
  sender_alias text,
  display_name text,
  body text,
  created_at timestamptz,
  from_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.profiled,
         case when m.profiled then null else m.sender_alias end,
         case when m.profiled then p.display_name else null end,
         m.body, m.created_at, m.sender_user_id = (select auth.uid())
  from public.venue_chat_messages m
  left join public.profiles p on p.id = m.sender_user_id
  where m.venue_id = target_venue_id
    and (private.venue_chat_session((select auth.uid()), target_venue_id)).id is not null
    and (before is null or m.created_at < before)
    and (m.hidden_at is null or m.sender_user_id = (select auth.uid()))
    and not private.is_blocked_between((select auth.uid()), m.sender_user_id)
  order by m.created_at desc
  limit least(greatest(page_size, 1), 100);
$$;

revoke all on function public.venue_chat_page(uuid, timestamptz, integer) from public, anon;
grant execute on function public.venue_chat_page(uuid, timestamptz, integer) to authenticated;

-- Profile behind a profiled message (service role; profile/get { venueChatMessageId }) -------------
-- The sender's account for a visible, profiled message, or null. The caller answers not_found for
-- null: no live table, anonymous, hidden, deleted, blocked and unknown all look alike.
create function public.venue_chat_profile_owner(target_user_id uuid, target_message_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.sender_user_id
  from private.visible_venue_chat_message(target_user_id, target_message_id) m
  where m.id is not null and m.profiled and m.hidden_at is null;
$$;

-- Report (service role) ---------------------------------------------------------------------------
-- Copies the reported message and the venue's last `snapshot_size` visible messages (sender alias,
-- display name of a profiled message, time). The same account counts once; the sender's own
-- report counts nothing. `hide_after` different accounts hide the message. Returns true when the
-- message became hidden (the caller broadcasts), false otherwise, including for a message the
-- caller cannot see.
create function public.safety_report_venue_chat(
  target_user_id uuid,
  target_message_id uuid,
  new_reason text,
  snapshot_size integer,
  hide_after integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts public.table_sessions;
  m public.venue_chat_messages;
  snapshot jsonb;
  added integer;
  reporters integer;
begin
  select * into m from private.visible_venue_chat_message(target_user_id, target_message_id);
  if m.id is null or m.sender_user_id = target_user_id then
    return false;
  end if;
  select * into ts from public.table_sessions
  where id = (private.venue_chat_session(target_user_id, m.venue_id)).id
  for no key update;
  select * into m from public.venue_chat_messages where id = target_message_id for update;
  if m.id is null then
    return false;
  end if;

  select coalesce(jsonb_agg(row order by row ->> 'created_at'), '[]'::jsonb) into snapshot
  from (
    select jsonb_build_object(
      'sender_alias', x.sender_alias,
      'display_name', case when x.profiled then p.display_name end,
      'body', x.body,
      'created_at', x.created_at,
      'reported', x.id = m.id
    ) as row
    from public.venue_chat_messages x
    left join public.profiles p on p.id = x.sender_user_id
    where x.venue_id = m.venue_id and (x.hidden_at is null or x.id = m.id)
    order by x.created_at desc
    limit snapshot_size
  ) last;

  insert into public.reports (reporter_id, reported_user_id, reason, target_type,
                              venue_chat_message_id, messages_snapshot)
  values (target_user_id, m.sender_user_id, new_reason, 'venue_chat', m.id, snapshot);

  insert into public.venue_chat_reports (message_id, reporter_user_id)
  values (m.id, target_user_id)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added = 0 or m.hidden_at is not null then
    return false;
  end if;
  select count(*) into reporters from public.venue_chat_reports
  where message_id = m.id and reporter_user_id <> m.sender_user_id;
  if reporters >= hide_after then
    update public.venue_chat_messages set hidden_at = now() where id = m.id;
    return true;
  end if;
  return false;
end;
$$;

-- Block (service role) ----------------------------------------------------------------------------
-- Blocks the sender of a message the caller can see. The block list shows the alias of an
-- anonymous message and the display name of a profiled one (never its table alias). Ends a
-- friendship like every block. Returns false for a message the caller cannot see or its own.
create function public.safety_block_venue_chat(target_user_id uuid, target_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.venue_chat_messages;
  shown text;
begin
  select * into m from private.visible_venue_chat_message(target_user_id, target_message_id);
  if m.id is null or m.sender_user_id = target_user_id then
    return false;
  end if;
  if m.profiled then
    select display_name into shown from public.profiles where id = m.sender_user_id;
  end if;
  perform private.lock_pair(target_user_id, m.sender_user_id);
  if private.are_friends(target_user_id, m.sender_user_id) then
    perform private.remove_friend(target_user_id, m.sender_user_id);
  end if;
  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, m.sender_user_id, coalesce(shown, m.sender_alias))
  on conflict (blocker_id, blocked_id) do nothing;
  return true;
end;
$$;

-- Friend request from the chat (service role) ----------------------------------------------------
-- Only to the sender of a visible, profiled message. Outcomes as friends_request: 'ok' (nothing to
-- tell: anonymous, hidden, unknown, blocked, declined before, already sent, over the daily limit),
-- 'request_created', 'friendship_created' (the other side had asked first), 'already_friends'.
create function public.friends_request_venue_chat(
  target_user_id uuid,
  target_message_id uuid,
  daily_max integer
)
returns table (outcome text, other_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.venue_chat_messages;
  reverse_status text;
  sent_today integer;
  venue_name text;
  my_name text;
  their_name text;
  new_id uuid;
begin
  select * into m from private.visible_venue_chat_message(target_user_id, target_message_id);
  if m.id is null or not m.profiled or m.hidden_at is not null
     or m.sender_user_id = target_user_id then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  perform private.lock_pair(target_user_id, m.sender_user_id);

  -- The press is kept whatever happens next: the sender's list shows it as waiting.
  select v.name into venue_name from public.venues v where v.id = m.venue_id;
  select display_name into my_name from public.profiles where id = target_user_id;
  select display_name into their_name from public.profiles where id = m.sender_user_id;
  insert into public.venue_chat_friend_presses (from_user_id, to_user_id, to_name, venue_name)
  values (target_user_id, m.sender_user_id, their_name, venue_name)
  on conflict (from_user_id, to_user_id) do nothing;

  if private.is_blocked_between(target_user_id, m.sender_user_id) then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  if private.are_friends(target_user_id, m.sender_user_id) then
    return query select 'already_friends'::text, null::uuid;
    return;
  end if;

  select status into reverse_status from public.friend_requests
  where from_user_id = m.sender_user_id and to_user_id = target_user_id
  for update;
  if reverse_status = 'pending' then
    perform private.make_friends(target_user_id, m.sender_user_id, 'request');
    return query select 'friendship_created'::text, m.sender_user_id;
    return;
  end if;

  select count(*) into sent_today from public.friend_requests
  where from_user_id = target_user_id and source = 'venue_chat'
    and created_at > now() - interval '1 day';
  if sent_today >= daily_max then
    return query select 'ok'::text, null::uuid;
    return;
  end if;

  insert into public.friend_requests (from_user_id, to_user_id, source, venue_chat_context)
  values (target_user_id, m.sender_user_id, 'venue_chat',
          jsonb_build_object('venueName', venue_name, 'fromName', my_name, 'toName', their_name))
  on conflict (from_user_id, to_user_id) do nothing
  returning id into new_id;
  if new_id is null then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  return query select 'request_created'::text, m.sender_user_id;
end;
$$;

-- Incoming requests from the chat (service role; friends/incoming signs the photo) --------------
-- The sender's display name, birth date (the function answers the age only) and photo path unless
-- hidden. Never a public_id or the sender's table alias.
create function public.friends_incoming_venue_chat(target_user_id uuid)
returns table (
  request_id uuid,
  venue_name text,
  display_name text,
  birth_date date,
  photo_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select fr.id, fr.venue_chat_context ->> 'venueName', p.display_name, p.birth_date,
         case when p.photo_hidden_at is null then p.photo_path end, fr.created_at
  from public.friend_requests fr
  join public.profiles p on p.id = fr.from_user_id
  where fr.to_user_id = target_user_id
    and fr.source = 'venue_chat'
    and fr.status = 'pending'
    and not private.is_blocked_between(fr.from_user_id, fr.to_user_id)
  order by fr.created_at desc;
$$;

-- Block from such a request: the list shows the sender's display name.
create function public.safety_block_friend_request(target_user_id uuid, target_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.friend_requests;
  shown text;
begin
  select * into fr from public.friend_requests
  where id = target_request_id and to_user_id = target_user_id and source = 'venue_chat';
  if fr.id is null then
    return false;
  end if;
  select display_name into shown from public.profiles where id = fr.from_user_id;
  perform private.lock_pair(target_user_id, fr.from_user_id);
  if private.are_friends(target_user_id, fr.from_user_id) then
    perform private.remove_friend(target_user_id, fr.from_user_id);
  end if;
  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, fr.from_user_id, coalesce(shown, fr.venue_chat_context ->> 'fromName', ''))
  on conflict (blocker_id, blocked_id) do nothing;
  return true;
end;
$$;

-- Report such a request: a copy of the sender's profile as the recipient saw it.
create function public.safety_report_friend_request(
  target_user_id uuid,
  target_request_id uuid,
  new_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.friend_requests;
  p public.profiles;
begin
  select * into fr from public.friend_requests
  where id = target_request_id and to_user_id = target_user_id and source = 'venue_chat';
  if fr.id is null then
    return false;
  end if;
  select * into p from public.profiles where id = fr.from_user_id;
  insert into public.reports (reporter_id, reported_user_id, reason, target_type,
                              profile_snapshot, context)
  values (target_user_id, fr.from_user_id, new_reason, 'venue_chat',
          jsonb_build_object('display_name', p.display_name, 'photo_path', p.photo_path),
          fr.venue_chat_context || jsonb_build_object('friendRequestId', fr.id));
  return true;
end;
$$;

-- Requests the caller sent from the chat: one row per press, with the name the other side showed
-- and the status. 'accepted' only while they are friends; anything else, a decline or a swallowed
-- request included, is 'pending' for ever (rule 5).
create function public.my_sent_venue_chat_requests()
returns table (to_name text, venue_name text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.to_name, p.venue_name,
         case when private.are_friends(p.from_user_id, p.to_user_id) then 'accepted'
              else 'pending' end,
         p.created_at
  from public.venue_chat_friend_presses p
  where p.from_user_id = (select auth.uid())
  order by p.created_at desc;
$$;

revoke all on function public.my_sent_venue_chat_requests() from public, anon;
grant execute on function public.my_sent_venue_chat_requests() to authenticated;

-- Service-role only ------------------------------------------------------------------------------
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.venue_chat_send(uuid, uuid, text, boolean, integer, integer, integer)',
    'public.venue_chat_profile_owner(uuid, uuid)',
    'public.safety_report_venue_chat(uuid, uuid, text, integer, integer)',
    'public.safety_block_venue_chat(uuid, uuid)',
    'public.friends_request_venue_chat(uuid, uuid, integer)',
    'public.friends_incoming_venue_chat(uuid)',
    'public.safety_block_friend_request(uuid, uuid)',
    'public.safety_report_friend_request(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Realtime: venue_chat:{venue_id}, the accounts with a live table there; only the server sends.
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
  end if;
  return false;
end;
$$;

-- Messages last a day; the report copies stay (their 30-day job) --------------------------------
create function private.delete_old_venue_chat(keep_hours integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted integer;
begin
  delete from public.venue_chat_messages
  where id in (
    select id from public.venue_chat_messages
    where created_at < now() - make_interval(hours => keep_hours)
    for update skip locked
  );
  get diagnostics deleted = row_count;
  delete from public.venue_chat_rate
  where last_sent_at < now() - make_interval(hours => keep_hours);
  return deleted;
end;
$$;

revoke all on function private.delete_old_venue_chat(integer) from public, anon, authenticated;

select cron.schedule('delete-old-venue-chat', '17 * * * *', 'select private.delete_old_venue_chat(24)');
