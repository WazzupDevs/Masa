-- v2 step 4 (docs/SPEC_V2.md §6, §7): play history, friend requests, friendships, the mutual
-- "Arkadaş ekle" intents, DMs, history/DM reports and the inbox:/dm: Realtime channels.
-- Account ids of other users never reach the client: every table below is closed or hides its
-- "other account" columns, and the client reads through RLS or read-only RPCs.

-- play_history ---------------------------------------------------------------------------------
-- One row per account for each two-table encounter of at least 3 minutes (written by the
-- encounters migration's trigger). The other table's public_id is never stored.
create table public.play_history (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  other_user_id uuid references auth.users (id) on delete set null,
  other_profiled boolean not null default false,
  room_id uuid references public.rooms (id) on delete set null,
  concept text not null check (concept in ('tabu', 'sohbet')),
  mode text not null check (mode in ('voice', 'text')),
  own_alias text not null,
  other_alias text not null,
  other_headcount smallint not null,
  reveal_mutual boolean not null default false,
  -- The owner pressed "İstek gönder" or "Arkadaş ekle" on this row. Set on every press whatever
  -- happens next, so the row never shows whether the request was swallowed (§6.2).
  friend_action_at timestamptz,
  started_at timestamptz,
  played_at timestamptz not null default now(),
  available_at timestamptz not null,
  unique (user_id, encounter_id)
);

create index play_history_user_idx on public.play_history (user_id, played_at desc);
create index play_history_room_idx on public.play_history (room_id);
create index play_history_encounter_idx on public.play_history (encounter_id);
create index play_history_other_idx on public.play_history (other_user_id);

alter table public.play_history enable row level security;
revoke all on table public.play_history from anon, authenticated;
grant select (
  id, room_id, concept, mode, own_alias, other_alias, other_headcount, reveal_mutual,
  friend_action_at, played_at, available_at
) on table public.play_history to authenticated;

create policy "play_history: own rows once available"
  on public.play_history for select
  to authenticated
  using (user_id = (select auth.uid()) and available_at <= now());

-- friend_requests -------------------------------------------------------------------------------
-- Unique per account pair and direction: a later encounter never creates a new row, and a
-- decline is permanent (§6.2). Closed to the client; read through my_*_requests().
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  encounter_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create index friend_requests_to_idx on public.friend_requests (to_user_id, status);

alter table public.friend_requests enable row level security;
revoke all on table public.friend_requests from anon, authenticated;

-- friendships -----------------------------------------------------------------------------------
create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  source text not null check (source in ('room_end_mutual', 'request')),
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

create index friendships_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;
revoke all on table public.friendships from anon, authenticated;

-- mutual_friend_intents -------------------------------------------------------------------------
-- "Arkadaş ekle" after a mutual "Evet". Never shown to the other side (§6.5).
create table public.mutual_friend_intents (
  encounter_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (encounter_id, user_id)
);

alter table public.mutual_friend_intents enable row level security;
revoke all on table public.mutual_friend_intents from anon, authenticated;

-- DMs -------------------------------------------------------------------------------------------
-- A thread exists only while its friendship does (foreign key, on delete cascade).
create table public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null,
  user_b uuid not null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (user_a, user_b),
  foreign key (user_a, user_b) references public.friendships (user_a, user_b) on delete cascade
);

create table public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc);
create index dm_messages_sender_idx on public.dm_messages (sender_user_id, created_at desc);

create table public.dm_reads (
  thread_id uuid not null references public.dm_threads (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_reads enable row level security;
revoke all on table public.dm_threads from anon, authenticated;
revoke all on table public.dm_messages from anon, authenticated;
revoke all on table public.dm_reads from anon, authenticated;

-- reports: the game context of a history report -----------------------------------------------
alter table public.reports add column context jsonb;

-- Helpers ---------------------------------------------------------------------------------------
create function private.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships where user_a = least(a, b) and user_b = greatest(a, b)
  );
$$;

-- Friendship plus its DM thread; false if they were friends already.
create function private.make_friends(a uuid, b uuid, new_source text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  created boolean;
begin
  insert into public.friendships (user_a, user_b, source)
  values (least(a, b), greatest(a, b), new_source)
  on conflict do nothing;
  created := found;
  insert into public.dm_threads (user_a, user_b)
  values (least(a, b), greatest(a, b))
  on conflict do nothing;
  update public.friend_requests
  set status = 'accepted', responded_at = coalesce(responded_at, now())
  where status = 'pending'
    and ((from_user_id = a and to_user_id = b) or (from_user_id = b and to_user_id = a));
  return created;
end;
$$;

-- Ends a friendship: the thread and its messages go (cascade), accepted or pending requests
-- between the two go (a declined one stays: that decline is permanent), and so do the "Arkadaş
-- ekle" intents of their encounters, so a leftover intent can never restore the friendship.
create function private.end_friendship(a uuid, b uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.friendships where user_a = least(a, b) and user_b = greatest(a, b);
  delete from public.friend_requests
  where status <> 'declined'
    and ((from_user_id = a and to_user_id = b) or (from_user_id = b and to_user_id = a));
  delete from public.mutual_friend_intents i
  using public.play_history h
  where h.encounter_id = i.encounter_id
    and i.user_id in (a, b)
    and ((h.user_id = a and h.other_user_id = b) or (h.user_id = b and h.other_user_id = a));
$$;

create function private.thread_of(a uuid, b uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.dm_threads where user_a = least(a, b) and user_b = greatest(a, b);
$$;

-- Serialises every friendship change between two accounts (two opposite requests or two
-- "Arkadaş ekle" presses at the same moment see each other).
create function private.lock_pair(a uuid, b uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(least(a, b)::text || greatest(a, b)::text, 0));
$$;

-- The last 50 DMs of a thread as the reporter saw them; senders are "reporter" or "reported",
-- never an account id.
create function private.dm_snapshot(target_thread_id uuid, reporter uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'from', case when last50.sender_user_id = reporter then 'reporter' else 'reported' end,
           'body', last50.body,
           'created_at', last50.created_at
         ) order by last50.created_at), '[]'::jsonb)
  from (
    select sender_user_id, body, created_at from public.dm_messages
    where thread_id = target_thread_id
    order by created_at desc
    limit 50
  ) last50;
$$;

revoke all on function private.are_friends(uuid, uuid) from public, anon, authenticated;
revoke all on function private.make_friends(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.end_friendship(uuid, uuid) from public, anon, authenticated;
revoke all on function private.thread_of(uuid, uuid) from public, anon, authenticated;
revoke all on function private.lock_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function private.dm_snapshot(uuid, uuid) from public, anon, authenticated;

-- Profiles: friends see each other (docs/SPEC_V2.md §5.2) ----------------------------------------
create or replace function private.can_view_profile(viewer uuid, target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select viewer = target
    or (
      not private.is_blocked_between(viewer, target)
      and (private.are_friends(viewer, target) or private.shares_room_with_profile(viewer, target))
    );
$$;

-- Badge counts: + the number of different accounts played with in two-table encounters.
drop function public.user_stats(uuid);

create function public.user_stats(target_user_id uuid)
returns table (games integer, voice_tabu_wins integer, distinct_tables integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from public.game_results where user_id = target_user_id),
    (select count(*)::integer from public.game_results
      where user_id = target_user_id and concept = 'tabu' and mode = 'voice' and won),
    (select count(distinct other_user_id)::integer from public.play_history
      where user_id = target_user_id);
$$;

revoke all on function public.user_stats(uuid) from public, anon, authenticated;
grant execute on function public.user_stats(uuid) to service_role;

-- Photo hiding counts every report about the same photo: profile and history reports alike.
create function private.hide_photo_if_reported(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  reporters integer;
begin
  select * into p from public.profiles where id = target_user_id for update;
  if p.photo_path is null or p.photo_hidden_at is not null then
    return;
  end if;
  select count(distinct reporter_id) into reporters
  from public.reports
  where target_type in ('profile', 'history')
    and reported_user_id = p.id
    and profile_snapshot ->> 'photo_path' = p.photo_path;
  if reporters >= 2 then
    update public.profiles set photo_hidden_at = now() where id = p.id;
  end if;
end;
$$;

revoke all on function private.hide_photo_if_reported(uuid) from public, anon, authenticated;

create or replace function public.safety_report_profile(
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
begin
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

  perform private.hide_photo_if_reported(p.id);
  return true;
end;
$$;

-- History actions: the caller's own row, once available -----------------------------------------
create function private.own_history(target_user_id uuid, target_history_id uuid)
returns public.play_history
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.play_history
  where id = target_history_id and user_id = target_user_id and available_at <= now();
$$;

revoke all on function private.own_history(uuid, uuid) from public, anon, authenticated;

-- friends/request { historyId } (service role). Outcomes: 'ok' (nothing to tell: swallowed,
-- already sent, unknown row), 'request_created', 'friendship_created' (the other side had asked
-- first), 'already_friends'. The caller answers { ok: true } for all but the last.
create function public.friends_request(target_user_id uuid, target_history_id uuid)
returns table (outcome text, other_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.play_history;
  reverse_status text;
  new_id uuid;
begin
  select * into h from private.own_history(target_user_id, target_history_id);
  if h.id is null then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  update public.play_history set friend_action_at = coalesce(friend_action_at, now())
  where id = h.id;

  if h.other_user_id is null or private.is_blocked_between(target_user_id, h.other_user_id) then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  perform private.lock_pair(target_user_id, h.other_user_id);
  if private.are_friends(target_user_id, h.other_user_id) then
    return query select 'already_friends'::text, null::uuid;
    return;
  end if;

  select status into reverse_status from public.friend_requests
  where from_user_id = h.other_user_id and to_user_id = target_user_id
  for update;
  if reverse_status = 'pending' then
    perform private.make_friends(target_user_id, h.other_user_id, 'request');
    return query select 'friendship_created'::text, h.other_user_id;
    return;
  end if;

  insert into public.friend_requests (from_user_id, to_user_id, encounter_id)
  values (target_user_id, h.other_user_id, h.encounter_id)
  on conflict (from_user_id, to_user_id) do nothing
  returning id into new_id;
  if new_id is null then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  return query select 'request_created'::text, h.other_user_id;
end;
$$;

-- friends/respond (service role). Only the recipient's pending request that is still visible to
-- them (no block either way); anything else is request_not_found.
create function public.friends_respond(target_user_id uuid, target_request_id uuid, accept boolean)
returns table (outcome text, other_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  fr public.friend_requests;
begin
  select * into fr from public.friend_requests
  where id = target_request_id and to_user_id = target_user_id and status = 'pending'
  for update;
  if fr.id is null or private.is_blocked_between(target_user_id, fr.from_user_id) then
    raise exception using errcode = 'P0001', message = 'request_not_found';
  end if;
  perform private.lock_pair(target_user_id, fr.from_user_id);

  if not accept then
    update public.friend_requests set status = 'declined', responded_at = now() where id = fr.id;
    return query select 'declined'::text, null::uuid;
    return;
  end if;
  perform private.make_friends(target_user_id, fr.from_user_id, 'request');
  return query select 'friendship_created'::text, fr.from_user_id;
end;
$$;

-- friends/add-from-room { historyId } (service role): an intent on a mutual encounter; the second
-- intent makes the friendship. Anything else is 'ok' and writes nothing but friend_action_at.
create function public.friends_add_from_room(target_user_id uuid, target_history_id uuid)
returns table (outcome text, other_user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.play_history;
begin
  select * into h from private.own_history(target_user_id, target_history_id);
  if h.id is null or not h.reveal_mutual then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  update public.play_history set friend_action_at = coalesce(friend_action_at, now())
  where id = h.id;
  if h.other_user_id is null or private.is_blocked_between(target_user_id, h.other_user_id) then
    return query select 'ok'::text, null::uuid;
    return;
  end if;
  perform private.lock_pair(target_user_id, h.other_user_id);
  if private.are_friends(target_user_id, h.other_user_id) then
    return query select 'ok'::text, null::uuid;
    return;
  end if;

  insert into public.mutual_friend_intents (encounter_id, user_id)
  values (h.encounter_id, target_user_id)
  on conflict do nothing;

  if exists (
    select 1 from public.mutual_friend_intents
    where encounter_id = h.encounter_id and user_id = h.other_user_id
  ) and private.make_friends(target_user_id, h.other_user_id, 'room_end_mutual') then
    return query select 'friendship_created'::text, h.other_user_id;
    return;
  end if;
  return query select 'ok'::text, null::uuid;
end;
$$;

-- The friend behind a public_id, or not_friends.
create function private.friend_by_public_id(target_user_id uuid, target_public_id uuid)
returns public.profiles
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  select * into p from public.profiles where public_id = target_public_id;
  if p.id is null or not private.are_friends(target_user_id, p.id) then
    raise exception using errcode = 'P0001', message = 'not_friends';
  end if;
  return p;
end;
$$;

revoke all on function private.friend_by_public_id(uuid, uuid) from public, anon, authenticated;

-- friends/remove { publicId, report? } (service role). Silent for the other side. With a report,
-- the last 50 DMs are copied in the same transaction, before the thread goes.
create function public.friends_remove(
  target_user_id uuid,
  target_public_id uuid,
  report_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  thread uuid;
begin
  p := private.friend_by_public_id(target_user_id, target_public_id);
  thread := private.thread_of(target_user_id, p.id);
  if report_reason is not null then
    insert into public.reports (reporter_id, reported_user_id, reason, target_type, dm_thread_id,
                                messages_snapshot)
    values (target_user_id, p.id, report_reason, 'dm', thread,
            private.dm_snapshot(thread, target_user_id));
  end if;
  perform private.end_friendship(target_user_id, p.id);
end;
$$;

-- safety/block { publicId, report? } (service role): a friend (from the friend list, a DM or
-- their profile). Blocks, copies the DMs if asked, and ends the friendship; the other side sees
-- the same as a removal.
create function public.safety_block_friend(
  target_user_id uuid,
  target_public_id uuid,
  report_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
begin
  p := private.friend_by_public_id(target_user_id, target_public_id);
  perform public.friends_remove(target_user_id, target_public_id, report_reason);
  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, p.id, coalesce(p.display_name, ''))
  on conflict (blocker_id, blocked_id) do nothing;
end;
$$;

-- safety/report { target: 'dm', threadId } (service role): the last 50 DMs.
create function public.safety_report_dm(target_user_id uuid, target_thread_id uuid, new_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.dm_threads;
  other uuid;
begin
  select * into t from public.dm_threads
  where id = target_thread_id and target_user_id in (user_a, user_b);
  if t.id is null then
    raise exception using errcode = 'P0001', message = 'not_friends';
  end if;
  other := case when t.user_a = target_user_id then t.user_b else t.user_a end;
  insert into public.reports (reporter_id, reported_user_id, reason, target_type, dm_thread_id,
                              messages_snapshot)
  values (target_user_id, other, new_reason, 'dm', t.id, private.dm_snapshot(t.id, target_user_id));
end;
$$;

-- History reports work after the room has ended (docs/SPEC_V2.md §6.2, project owner's
-- requirement for step 4). If the other table joined with its profile, the profile is copied as
-- it is now (the photo from `photo`, downloaded by the caller from history_report_photo()); an
-- anonymous table gets no profile copy, only the game context. Room messages are copied while
-- they still exist (they go 24 hours after the room closed).
create function public.history_report_photo(target_user_id uuid, target_history_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.photo_path
  from private.own_history(target_user_id, target_history_id) h
  join public.profiles p on p.id = h.other_user_id
  where h.other_profiled;
$$;

create function private.history_report(
  reporter uuid,
  h public.play_history,
  new_reason text,
  reported_photo_path text,
  photo bytea
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p public.profiles;
  snapshot jsonb;
begin
  if h.other_profiled then
    select * into p from public.profiles where id = h.other_user_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'alias', last50.sender_alias, 'body', last50.body, 'created_at', last50.created_at
         ) order by last50.created_at), '[]'::jsonb)
  into snapshot
  from (
    select sender_alias, body, created_at from public.messages
    where room_id = h.room_id
      and created_at >= coalesce(h.started_at, '-infinity')
      and created_at <= h.played_at
    order by created_at desc
    limit 50
  ) last50;

  insert into public.reports (reporter_id, reported_user_id, room_id, reason, target_type,
                              history_id, context, messages_snapshot, profile_snapshot,
                              photo_copy)
  values (
    reporter, h.other_user_id, h.room_id, new_reason, 'history', h.id,
    jsonb_build_object('played_at', h.played_at, 'concept', h.concept, 'mode', h.mode,
                       'own_alias', h.own_alias, 'other_alias', h.other_alias,
                       'other_headcount', h.other_headcount, 'other_profiled', h.other_profiled,
                       'reveal_mutual', h.reveal_mutual),
    snapshot,
    case when p.id is not null then
      jsonb_build_object('display_name', p.display_name, 'bio', p.bio, 'photo_path', p.photo_path)
    end,
    case when p.photo_path is not null and p.photo_path = reported_photo_path then photo end
  );

  if p.id is not null then
    perform private.hide_photo_if_reported(p.id);
  end if;
end;
$$;

revoke all on function private.history_report(uuid, public.play_history, text, text, bytea)
  from public, anon, authenticated;

-- Silently nothing (false) for another account's row, a row not yet available, or when the
-- other account is gone.
create function public.safety_report_history(
  target_user_id uuid,
  target_history_id uuid,
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
  h public.play_history;
begin
  select * into h from private.own_history(target_user_id, target_history_id);
  if h.id is null or h.other_user_id is null then
    return false;
  end if;
  perform private.history_report(target_user_id, h, new_reason, reported_photo_path, photo);
  return true;
end;
$$;

-- safety/block { historyId, report? } (service role): blocks the account behind the caller's own
-- history row, with the alias of that encounter; ends a friendship if there is one. The report,
-- if asked, is written in the same transaction.
create function public.safety_block_history(
  target_user_id uuid,
  target_history_id uuid,
  report_reason text default null,
  reported_photo_path text default null,
  photo bytea default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.play_history;
begin
  select * into h from private.own_history(target_user_id, target_history_id);
  if h.id is null or h.other_user_id is null then
    return false;
  end if;
  if report_reason is not null then
    perform private.history_report(target_user_id, h, report_reason, reported_photo_path, photo);
  end if;
  if private.are_friends(target_user_id, h.other_user_id) then
    perform private.end_friendship(target_user_id, h.other_user_id);
  end if;
  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, h.other_user_id, h.other_alias)
  on conflict (blocker_id, blocked_id) do nothing;
  return true;
end;
$$;

-- DMs (service role) -----------------------------------------------------------------------------
-- The other member of a thread the caller is in; not_friends otherwise (a thread exists only while
-- the friendship does).
create function public.dm_send(
  target_user_id uuid,
  target_thread_id uuid,
  new_body text,
  min_interval_ms integer
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
  if exists (
    select 1 from public.dm_messages
    where sender_user_id = target_user_id
      and created_at > now() - make_interval(secs => min_interval_ms / 1000.0)
  ) then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.dm_messages (thread_id, sender_user_id, body)
  values (t.id, target_user_id, new_body);
  update public.dm_threads set last_message_at = now() where id = t.id;
  insert into public.dm_reads (thread_id, user_id, last_read_at)
  values (t.id, target_user_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
  return other;
end;
$$;

create function public.dm_mark_read(target_user_id uuid, target_thread_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.dm_threads
    where id = target_thread_id and target_user_id in (user_a, user_b)
  ) then
    raise exception using errcode = 'P0001', message = 'not_friends';
  end if;
  insert into public.dm_reads (thread_id, user_id, last_read_at)
  values (target_thread_id, target_user_id, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;

-- The friend list for friends/list (service role; the function signs photo URLs). No venue, no
-- position, no active table (§6.4).
create function public.friends_of(viewer uuid)
returns table (
  public_id uuid,
  display_name text,
  photo_path text,
  since timestamptz,
  thread_id uuid,
  last_message_at timestamptz,
  unread boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.public_id, p.display_name,
         case when p.photo_hidden_at is null then p.photo_path end,
         f.created_at, t.id, t.last_message_at,
         exists (
           select 1 from public.dm_messages m
           left join public.dm_reads r on r.thread_id = t.id and r.user_id = viewer
           where m.thread_id = t.id and m.sender_user_id <> viewer
             and m.created_at > coalesce(r.last_read_at, '-infinity')
         )
  from public.friendships f
  join public.profiles p on p.id = case when f.user_a = viewer then f.user_b else f.user_a end
  left join public.dm_threads t on t.user_a = f.user_a and t.user_b = f.user_b
  where viewer in (f.user_a, f.user_b)
    and not private.is_blocked_between(f.user_a, f.user_b)
  order by coalesce(t.last_message_at, f.created_at) desc;
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.history_report_photo(uuid, uuid)',
    'public.friends_request(uuid, uuid)',
    'public.friends_respond(uuid, uuid, boolean)',
    'public.friends_add_from_room(uuid, uuid)',
    'public.friends_remove(uuid, uuid, text)',
    'public.safety_block_friend(uuid, uuid, text)',
    'public.safety_report_dm(uuid, uuid, text)',
    'public.safety_report_history(uuid, uuid, text, text, bytea)',
    'public.safety_block_history(uuid, uuid, text, text, bytea)',
    'public.dm_send(uuid, uuid, text, integer)',
    'public.dm_mark_read(uuid, uuid)',
    'public.friends_of(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end;
$$;

-- Client reads (read only, security definer) ------------------------------------------------------
-- Requests to the caller, with the context of the caller's own history row. No public_id; blocked
-- pairs never show (§6.2).
create function public.my_incoming_requests()
returns table (
  request_id uuid,
  history_id uuid,
  played_at timestamptz,
  concept text,
  other_alias text,
  other_headcount smallint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select fr.id, h.id, h.played_at, h.concept, h.other_alias, h.other_headcount, fr.created_at
  from public.friend_requests fr
  join public.play_history h
    on h.user_id = fr.to_user_id and h.encounter_id = fr.encounter_id
  where fr.to_user_id = (select auth.uid())
    and fr.status = 'pending'
    and not private.is_blocked_between(fr.from_user_id, fr.to_user_id)
  order by fr.created_at desc;
$$;

-- Requests the caller sent. A declined request stays 'pending' for ever (§6.2).
create function public.my_sent_requests()
returns table (
  history_id uuid,
  played_at timestamptz,
  concept text,
  other_alias text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.played_at, h.concept, h.other_alias,
         case when fr.status = 'accepted' then 'accepted' else 'pending' end,
         fr.created_at
  from public.friend_requests fr
  join public.play_history h
    on h.user_id = fr.from_user_id and h.encounter_id = fr.encounter_id
  where fr.from_user_id = (select auth.uid())
  order by fr.created_at desc;
$$;

-- 50 messages of a thread the caller is in, newest first, older than `before` if given.
-- `from_me` instead of the sender's account id.
create function public.dm_messages_page(target_thread_id uuid, before timestamptz default null)
returns table (id uuid, body text, created_at timestamptz, from_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.body, m.created_at, m.sender_user_id = (select auth.uid())
  from public.dm_messages m
  join public.dm_threads t on t.id = m.thread_id
  where t.id = target_thread_id
    and (select auth.uid()) in (t.user_a, t.user_b)
    and (before is null or m.created_at < before)
  order by m.created_at desc
  limit 50;
$$;

revoke all on function public.my_incoming_requests() from public, anon;
revoke all on function public.my_sent_requests() from public, anon;
revoke all on function public.dm_messages_page(uuid, timestamptz) from public, anon;
grant execute on function public.my_incoming_requests() to authenticated;
grant execute on function public.my_sent_requests() to authenticated;
grant execute on function public.dm_messages_page(uuid, timestamptz) to authenticated;

-- Realtime: inbox:{user_id} (its owner only) and dm:{thread_id} (the two members); only the server
-- sends on either (rule 9).
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
