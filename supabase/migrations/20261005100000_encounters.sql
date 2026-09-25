-- v2 step 4 (docs/SPEC_V2.md §6.1, §6.5): play history rows at the end of a two-table encounter.
--
-- One trigger on rooms covers every transition that ends an encounter, whichever function makes
-- it: "Odayı bitir" (waiting/active -> ending), the guest table leaving, blocking or ending its
-- table (guest_session_id -> null), the owner leaving or ending its table and idle rooms closing
-- (-> closed). Only encounters that stayed two-table for at least 3 minutes are written.
--
-- available_at: reveal_ends_at when the window opened, otherwise now. A mutual "Evet" closes the
-- window early; both rows then become reveal_mutual and available at once (the result is already
-- shown to both tables). Every other outcome keeps reveal_ends_at, the same for both sides.

create function private.on_room_encounter()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_s public.table_sessions;
  guest_s public.table_sessions;
  encounter uuid;
  available timestamptz;
  game_mode text;
begin
  -- A mutual result: open both rows of the encounter that this window belongs to.
  if old.status = 'ending' and new.status = 'closed' and new.reveal_result = 'mutual' then
    update public.play_history
    set reveal_mutual = true, available_at = now()
    where room_id = new.id and available_at = old.reveal_ends_at;
    return null;
  end if;

  -- The end of a two-table encounter.
  if old.guest_session_id is null or old.status not in ('waiting', 'active') then
    return null;
  end if;
  if new.status in ('waiting', 'active')
     and new.guest_session_id is not distinct from old.guest_session_id then
    return null;
  end if;
  if old.guest_joined_at is null or now() - old.guest_joined_at < interval '3 minutes' then
    return null;
  end if;

  select * into owner_s from public.table_sessions where id = old.owner_session_id;
  select * into guest_s from public.table_sessions where id = old.guest_session_id;
  if owner_s.user_id is null or guest_s.user_id is null or owner_s.user_id = guest_s.user_id then
    return null;
  end if;

  available := case when new.status = 'ending' then new.reveal_ends_at else now() end;
  -- The concept decides the mode (docs/SPEC_V2.md §8.1).
  game_mode := case old.concept when 'tabu' then 'voice' else 'text' end;
  encounter := gen_random_uuid();

  insert into public.play_history (
    encounter_id, user_id, other_user_id, other_profiled, room_id, concept, mode,
    own_alias, other_alias, other_headcount, started_at, played_at, available_at
  )
  values
    (encounter, owner_s.user_id, guest_s.user_id, guest_s.participation = 'profile', old.id,
     old.concept, game_mode, old.owner_alias, old.guest_alias, old.guest_headcount,
     old.guest_joined_at, now(), available),
    (encounter, guest_s.user_id, owner_s.user_id, owner_s.participation = 'profile', old.id,
     old.concept, game_mode, old.guest_alias, old.owner_alias, old.owner_headcount,
     old.guest_joined_at, now(), available)
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.on_room_encounter() from public, anon, authenticated;

create trigger rooms_record_encounter
  after update on public.rooms
  for each row
  execute function private.on_room_encounter();
