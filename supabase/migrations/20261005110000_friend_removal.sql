-- v2 step 4, project owner's rule for ending a friendship (CLAUDE.md rule 5):
-- removal works as a permanent decline for the removed side. The removed account's new request
-- to the remover is swallowed ({ ok: true }, no row) and looks pending for ever to its sender;
-- the remover may ask again. Blocking a friend ends the friendship the same way, so the removed
-- side cannot tell a removal from a block. Existing declines are never deleted or overwritten.

alter table public.friend_requests drop constraint friend_requests_status_check;
alter table public.friend_requests
  add constraint friend_requests_status_check
  check (status in ('pending', 'accepted', 'declined', 'removed'));

-- The remover's own requests to the removed account go (except a real decline it received, which
-- stays permanent), so it can ask again. The removed account's direction becomes 'removed'
-- unless it already holds a real decline. Thread, messages (cascade) and the "Arkadaş ekle"
-- intents of their encounters go too.
create function private.remove_friend(remover uuid, removed uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships
  where user_a = least(remover, removed) and user_b = greatest(remover, removed);

  delete from public.friend_requests
  where from_user_id = remover and to_user_id = removed and status <> 'declined';

  insert into public.friend_requests (from_user_id, to_user_id, encounter_id, status, responded_at)
  values (removed, remover, gen_random_uuid(), 'removed', now())
  on conflict (from_user_id, to_user_id) do update
    set status = 'removed', responded_at = now()
    where public.friend_requests.status <> 'declined';

  delete from public.mutual_friend_intents i
  using public.play_history h
  where h.encounter_id = i.encounter_id
    and i.user_id in (remover, removed)
    and ((h.user_id = remover and h.other_user_id = removed)
      or (h.user_id = removed and h.other_user_id = remover));
end;
$$;

revoke all on function private.remove_friend(uuid, uuid) from public, anon, authenticated;

create or replace function public.friends_remove(
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
  perform private.lock_pair(target_user_id, p.id);
  thread := private.thread_of(target_user_id, p.id);
  if report_reason is not null then
    insert into public.reports (reporter_id, reported_user_id, reason, target_type, dm_thread_id,
                                messages_snapshot)
    values (target_user_id, p.id, report_reason, 'dm', thread,
            private.dm_snapshot(thread, target_user_id));
  end if;
  perform private.remove_friend(target_user_id, p.id);
end;
$$;

-- A block from a history row ends a friendship the same way as a removal.
create or replace function public.safety_block_history(
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
  perform private.lock_pair(target_user_id, h.other_user_id);
  if private.are_friends(target_user_id, h.other_user_id) then
    perform private.remove_friend(target_user_id, h.other_user_id);
  end if;
  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, h.other_user_id, h.other_alias)
  on conflict (blocker_id, blocked_id) do nothing;
  return true;
end;
$$;

-- The sender's view comes from its own presses of "İstek gönder" (play_history.friend_action_at),
-- not from request rows: a request swallowed for any reason (removed, blocked, declined earlier,
-- already sent) looks exactly like one that waits. 'accepted' only while they are friends.
drop function public.my_sent_requests();

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
         case when h.other_user_id is not null
                   and private.are_friends(h.user_id, h.other_user_id)
              then 'accepted' else 'pending' end,
         h.friend_action_at
  from public.play_history h
  where h.user_id = (select auth.uid())
    and h.friend_action_at is not null
    and not h.reveal_mutual
    and h.available_at <= now()
  order by h.friend_action_at desc;
$$;

revoke all on function public.my_sent_requests() from public, anon;
grant execute on function public.my_sent_requests() to authenticated;
