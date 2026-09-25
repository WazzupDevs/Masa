-- A table's actions lock its own session row, then the room. Both tables ending a Tabu turn at once
-- deadlocked (40P01): the owner, holding the room, inserts the next turn whose describer is the
-- guest's session, and that foreign key check needs KEY SHARE on the guest's row, which the guest
-- held FOR UPDATE while it waited for the room. FOR NO KEY UPDATE still serializes every action of
-- the same table (they all take it; updates and deletes of the row conflict with it) but lets rows
-- that only reference the session be written.
create or replace function private.active_session_for_update(target_user_id uuid)
returns public.table_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
begin
  select * into s
  from public.table_sessions
  where user_id = target_user_id and status = 'active' and expires_at > now()
  for no key update;
  if not found then
    raise exception using errcode = 'P0001', message = 'no_active_table';
  end if;
  return s;
end;
$$;
revoke all on function private.active_session_for_update(uuid) from public, anon, authenticated;
