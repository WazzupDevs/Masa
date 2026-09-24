-- Lobby hold after a reveal window (MVP_SPEC §4.6). A table that said "Hayır" (or left) may go on
-- at once, but the rooms it opens stay out of the lobby until the old room's reveal_ends_at, so
-- the table that said "Evet" cannot tell "no" from "no answer" by a new room of the other table.
-- Private rooms and one-table games are not affected.

-- The earliest moment a table's rooms may be listed: the end of the last reveal window it was in
-- (null if none). Its waiting time in the lobby also counts from then.
create function private.lobby_listed_from(target_session_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(reveal_ends_at) from public.rooms
  where target_session_id in (owner_session_id, guest_session_id);
$$;

revoke all on function private.lobby_listed_from(uuid) from public, anon, authenticated;

create or replace function public.venue_lobby(target_venue_id uuid)
returns table (
  room_id uuid,
  alias text,
  headcount smallint,
  concept text,
  waiting_since timestamptz
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
         greatest(r.waiting_since, private.lobby_listed_from(r.owner_session_id))
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


-- Whether a room is still held out of the lobby. The rooms Edge Function sends no lobby_changed
-- for a held room, so the venue channel says nothing during the window either.
create function public.rooms_lobby_held(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.lobby_listed_from(owner_session_id) > now(), false)
  from public.rooms where id = target_room_id;
$$;

revoke all on function public.rooms_lobby_held(uuid) from public, anon, authenticated;
grant execute on function public.rooms_lobby_held(uuid) to service_role;

-- reveal_finalize returns the venue when this call closed the window (else null), so the Edge
-- Function announces the lobby change once, at reveal_ends_at, the same way in every
-- non-mutual case.
drop function public.reveal_finalize(uuid, uuid);

create function public.reveal_finalize(target_user_id uuid, target_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.rooms;
  member boolean;
begin
  select * into r from public.rooms where id = target_room_id for update;
  select exists (
    select 1 from public.table_sessions ts
    where ts.user_id = target_user_id and ts.id in (r.owner_session_id, r.guest_session_id)
  ) into member;
  if r.id is null or not member then
    raise exception using errcode = 'P0001', message = 'not_in_room';
  end if;
  if r.status = 'ending' and now() >= r.reveal_ends_at then
    perform private.finish_reveal(r.id, null);
    return r.venue_id;
  end if;
  return null;
end;
$$;

revoke all on function public.reveal_finalize(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reveal_finalize(uuid, uuid) to service_role;
