-- v3 step 3: the room flow (docs/SPEC_V3.md §5). A room starts as a chat; a game starts only when
-- one table proposes it and the other accepts (a one-table room plays at once). Anonymity is
-- chosen per room. "Odayı bitir" is the only way out: blocking, leaving the venue and idleness
-- open the "Tanışalım mı?" window of a two-table room like "Odayı bitir", with the leaving or
-- blocking table's answer written as "Hayır". Table aliases are adjective + noun and may be drawn
-- again three times per check-in.

-- The reveal window's length, for the paths that open it without a caller passing it (leaving,
-- blocking, idleness). The same number as pure/reveal.ts → REVEAL.decisionSeconds; a test checks
-- that they agree.
create function private.reveal_decision_seconds()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 30;
$$;

revoke all on function private.reveal_decision_seconds() from public, anon, authenticated;

-- rooms ---------------------------------------------------------------------------------------------
-- concept is the room's activity: null = chat, 'tabu' or 'sohbet' = the running game. Between games
-- game_state keeps only the game counter and the last game's result (lastGame).
alter table public.rooms alter column concept drop not null;
alter table public.rooms
  add column intent text check (intent in ('game', 'chat')),
  -- Flags, never a profile id (rule 9): each table's choice for this room.
  add column owner_profiled boolean not null default false,
  add column guest_profiled boolean not null default false;

-- Rooms still open keep what their tables chose at check-in.
update public.rooms r
set owner_profiled = coalesce(
      (select participation = 'profile' from public.table_sessions where id = r.owner_session_id),
      false),
    guest_profiled = coalesce(
      (select participation = 'profile' from public.table_sessions where id = r.guest_session_id),
      false)
where r.status <> 'closed';

-- A game state without a running game: the counter (tabu_turns are keyed by game number) and,
-- optionally, the last game's result.
create function private.between_games(state jsonb, last_game jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object('gameNo', state -> 'gameNo', 'lastGame', last_game));
$$;

revoke all on function private.between_games(jsonb, jsonb) from public, anon, authenticated;

-- A table's open request: pending, or declined but not yet expired (rule 5: the requester cannot
-- tell the two apart until expires_at).
create function private.has_open_request(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.join_requests
    where requester_session_id = target_session_id
      and status in ('pending', 'declined')
      and expires_at > now()
  );
$$;

revoke all on function private.has_open_request(uuid) from public, anon, authenticated;

-- game_proposals ------------------------------------------------------------------------------------
-- One open proposal per room. Both tables read it (Postgres Changes on the room channel); only the
-- server writes. A declined or expired proposal is deleted: the proposer sees the same text for
-- both ("Öneri kabul edilmedi", S7).
create table public.game_proposals (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  proposer_session_id uuid not null references public.table_sessions (id) on delete cascade,
  concept text not null check (concept in ('tabu', 'sohbet')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table public.game_proposals enable row level security;
revoke all on table public.game_proposals from anon, authenticated;
grant select on table public.game_proposals to authenticated;

create policy "game_proposals: room members read"
  on public.game_proposals for select
  to authenticated
  using (private.is_room_member(room_id));

alter publication supabase_realtime add table public.game_proposals;

-- table_sessions: alias draws --------------------------------------------------------------------------
alter table public.table_sessions
  add column alias_rerolls smallint not null default 0 check (alias_rerolls >= 0);

-- alias_words: adjective + noun (S13). The old animals are nouns too; the seed replaces the list.
alter table public.alias_words drop constraint alias_words_kind_check;
update public.alias_words set kind = 'noun' where kind = 'animal';
alter table public.alias_words
  add constraint alias_words_kind_check check (kind in ('adjective', 'noun'));

-- play_history: the last game played, or 'chat'; the room's intent ------------------------------------
alter table public.play_history drop constraint play_history_concept_check;
alter table public.play_history
  add constraint play_history_concept_check check (concept in ('tabu', 'sohbet', 'chat')),
  add column intent text check (intent in ('game', 'chat'));
grant select (intent) on table public.play_history to authenticated;

-- Creating rooms ----------------------------------------------------------------------------------------
drop function public.rooms_create(uuid, text, text);

-- "Oda kur": always open to the venue, no game chosen (S4).
create function public.rooms_create(
  target_user_id uuid,
  profiled boolean,
  new_intent text default null
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  created public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null then
    raise exception using errcode = 'P0001', message = 'already_in_room';
  end if;

  insert into public.rooms
    (venue_id, owner_session_id, owner_alias, owner_headcount, concept, visibility, intent,
     owner_profiled)
  values (s.venue_id, s.id, s.alias, s.headcount, null, 'open', new_intent, profiled)
  returning * into created;
  return created;
end;
$$;

-- "Masanla oyna": a private one-table room, anonymous, never in the lobby.
create function public.rooms_create_solo(target_user_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  created public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null then
    raise exception using errcode = 'P0001', message = 'already_in_room';
  end if;

  insert into public.rooms
    (venue_id, owner_session_id, owner_alias, owner_headcount, concept, visibility)
  values (s.venue_id, s.id, s.alias, s.headcount, null, 'private')
  returning * into created;
  return created;
end;
$$;

revoke all on function public.rooms_create(uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.rooms_create_solo(uuid) from public, anon, authenticated;
grant execute on function public.rooms_create(uuid, boolean, text) to service_role;
grant execute on function public.rooms_create_solo(uuid) to service_role;

-- Join requests: the requester's choice for this room -----------------------------------------------------
drop trigger join_requests_requester_profiled on public.join_requests;
drop function private.set_requester_profiled();
drop function public.rooms_request_join(uuid, uuid, integer, integer);

-- As in 20261009090000_campus.sql, with the requester's choice: anonymous or with the profile.
create function public.rooms_request_join(
  target_user_id uuid,
  target_room_id uuid,
  ttl_seconds integer,
  max_per_hour integer,
  profiled boolean
)
returns public.join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  r public.rooms;
  owner public.table_sessions;
  created public.join_requests;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null then
    raise exception using errcode = 'P0001', message = 'already_in_room';
  end if;

  select * into r from public.rooms where id = target_room_id for update;
  select * into owner from public.table_sessions where id = r.owner_session_id;

  -- One answer for every reason the room cannot take this table, including blocks.
  if r.id is null
    or r.status <> 'waiting'
    or r.visibility <> 'open'
    or r.guest_session_id is not null
    or r.venue_id <> s.venue_id
    or r.owner_session_id = s.id
    or owner.status <> 'active'
    or owner.expires_at <= now()
    or private.is_blocked_between(owner.user_id, s.user_id)
    -- An 'unavailable' answer from this room is final for this table (MVP_SPEC §4.4).
    or exists (
      select 1 from public.join_requests
      where room_id = r.id and requester_session_id = s.id
        and status <> 'accepted' and expires_at <= now()
    )
  then
    raise exception using errcode = 'P0001', message = 'room_not_available';
  end if;

  if r.spot_id is distinct from s.spot_id then
    raise exception using errcode = 'P0001', message = 'different_spot';
  end if;

  if private.has_open_request(s.id) then
    raise exception using errcode = 'P0001', message = 'request_pending';
  end if;

  if (
    select count(*) from public.join_requests
    where requester_session_id = s.id and created_at > now() - interval '1 hour'
  ) >= max_per_hour then
    raise exception using errcode = 'P0001', message = 'rate_limited';
  end if;

  insert into public.join_requests
    (room_id, requester_session_id, requester_alias, requester_headcount, requester_profiled,
     expires_at)
  values (r.id, s.id, s.alias, s.headcount, profiled, now() + make_interval(secs => ttl_seconds))
  returning * into created;
  return created;
end;
$$;

revoke all on function public.rooms_request_join(uuid, uuid, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.rooms_request_join(uuid, uuid, integer, integer, boolean)
  to service_role;

-- The owner's answer. As in 20261007090000_lock_order.sql; on accept the guest's choice for the
-- room is copied and the room returns to chat: a one-table game in progress ends (§5.3).
create or replace function public.rooms_respond(
  target_user_id uuid,
  target_request_id uuid,
  accept boolean
)
returns public.join_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  jr public.join_requests;
  r public.rooms;
  owner public.table_sessions;
  requester public.table_sessions;
begin
  select * into jr from public.join_requests where id = target_request_id;
  if jr.id is null then
    raise exception using errcode = 'P0001', message = 'request_not_found';
  end if;

  select * into requester from public.table_sessions
  where id = jr.requester_session_id
  for no key update;
  select * into r from public.rooms where id = jr.room_id for update;
  select * into jr from public.join_requests where id = target_request_id for update;
  select * into owner from public.table_sessions where id = r.owner_session_id;

  if jr.id is null or owner.user_id is distinct from target_user_id then
    raise exception using errcode = 'P0001', message = 'request_not_found';
  end if;
  if jr.status <> 'pending' or jr.expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'request_expired';
  end if;

  if not accept then
    update public.join_requests set status = 'declined', responded_at = now()
    where id = jr.id returning * into jr;
    return jr;
  end if;

  if r.status <> 'waiting'
    or r.guest_session_id is not null
    or owner.status <> 'active' or owner.expires_at <= now()
    or requester.status <> 'active' or requester.expires_at <= now()
    or requester.venue_id <> r.venue_id
    or private.open_room_of_session(requester.id) is not null
    or private.is_blocked_between(owner.user_id, requester.user_id)
  then
    raise exception using errcode = 'P0001', message = 'request_expired';
  end if;

  update public.rooms
  set guest_session_id = requester.id, guest_alias = requester.alias,
      guest_headcount = requester.headcount, guest_profiled = jr.requester_profiled,
      status = 'active', last_activity_at = now(),
      concept = null, game_state = private.between_games(game_state, null)
  where id = r.id;

  update public.join_requests set status = 'declined', responded_at = now()
  where room_id = r.id and status = 'pending' and id <> jr.id;

  update public.join_requests set status = 'accepted', responded_at = now()
  where id = jr.id returning * into jr;
  return jr;
end;
$$;

-- The only way out is "Odayı bitir" (§5.5).
drop function public.rooms_leave(uuid);

-- Leaving a room without "Odayı bitir" ----------------------------------------------------------------------
-- A table leaving the venue, checking in again or running out of time: its one-table rooms close; a
-- two-table room opens the reveal window with this table's answer "Hayır" (S5), exactly as if it
-- had pressed "Odayı bitir" and "Hayır". Rooms already 'ending' are never closed early.
create or replace function private.release_rooms_of_session(target_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  closed_count integer;
  n integer := 0;
begin
  update public.rooms
  set status = 'closed', closed_at = now()
  where owner_session_id = target_session_id
    and guest_session_id is null
    and status in ('waiting', 'active');
  get diagnostics closed_count = row_count;

  for rid in
    select id from public.rooms
    where status in ('waiting', 'active')
      and guest_session_id is not null
      and target_session_id in (owner_session_id, guest_session_id)
  loop
    perform private.start_reveal(rid, private.reveal_decision_seconds());
    insert into public.reveal_decisions (room_id, session_id, wants_meet)
    values (rid, target_session_id, false)
    on conflict (room_id, session_id) do update set wants_meet = false;
    n := n + 1;
  end loop;

  return closed_count + n;
end;
$$;

-- Blocking in a room: like "Odayı bitir" with "Hayır" (S5). In a window already open the blocking
-- table's answer becomes "Hayır" too, so a blocked table can never get a mutual result. The other
-- table cannot tell a block from "Hayır" by rows, broadcasts or timing (rule 5).
drop function public.safety_block(uuid, uuid);

create function public.safety_block(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  blocked uuid;
  r public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  if m.other_session_id is null then
    raise exception using errcode = 'P0001', message = 'nothing_to_block';
  end if;
  select user_id into blocked from public.table_sessions where id = m.other_session_id;

  insert into public.blocks (blocker_id, blocked_id, blocked_alias)
  values (target_user_id, blocked, m.other_alias)
  on conflict (blocker_id, blocked_id) do nothing;

  select * into r from public.rooms where id = target_room_id;
  if r.status in ('waiting', 'active') then
    r := private.start_reveal(r.id, private.reveal_decision_seconds());
  end if;
  if r.status = 'ending' then
    insert into public.reveal_decisions (room_id, session_id, wants_meet)
    values (r.id, m.session_id, false)
    on conflict (room_id, session_id) do update set wants_meet = false;
  end if;
  return r;
end;
$$;

revoke all on function public.safety_block(uuid, uuid) from public, anon, authenticated;
grant execute on function public.safety_block(uuid, uuid) to service_role;

-- Idle rooms: a one-table room closes; a two-table room opens the window for both tables alike, with
-- no answer written for either (S5). Rows a user action holds are skipped until the next run.
drop function private.close_idle_rooms(integer);

create function private.close_idle_rooms(idle_minutes integer, decision_seconds integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  closed_count integer;
  n integer := 0;
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

  for rid in
    select id from public.rooms
    where status in ('waiting', 'active')
      and guest_session_id is not null
      and last_activity_at <= now() - make_interval(mins => idle_minutes)
    for update skip locked
  loop
    perform private.start_reveal(rid, decision_seconds);
    n := n + 1;
  end loop;
  return closed_count + n;
end;
$$;

revoke all on function private.close_idle_rooms(integer, integer) from public, anon, authenticated;

select cron.unschedule('close-idle-rooms');
select cron.schedule(
  'close-idle-rooms',
  '* * * * *',
  $$select private.close_idle_rooms(10, 30)$$
);

-- Profiles: the room's flags, not the table's check-in choice (§5.4) -------------------------------------------
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
    where r.status in ('waiting', 'active', 'ending')
      and case when other.id = r.owner_session_id then r.owner_profiled else r.guest_profiled end
  );
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
    and r.status in ('waiting', 'active', 'ending')
    and case when other.id = r.owner_session_id then r.owner_profiled else r.guest_profiled end
    and not private.is_blocked_between(me.user_id, other.user_id)
  limit 1;
$$;

-- Lobby: + the intent, − the concept; "profilli" is the owner's choice for this room. Otherwise as
-- in 20261009090000_campus.sql.
drop function public.venue_lobby(uuid);

create function public.venue_lobby(target_venue_id uuid)
returns table (
  room_id uuid,
  alias text,
  headcount smallint,
  intent text,
  waiting_since timestamptz,
  profiled boolean,
  spot_id uuid,
  spot_name text
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
  select r.id, r.owner_alias, r.owner_headcount, r.intent,
         greatest(r.waiting_since, private.lobby_listed_from(r.owner_session_id)),
         r.owner_profiled,
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

revoke all on function public.venue_lobby(uuid) from public, anon;
grant execute on function public.venue_lobby(uuid) to authenticated;

-- Play history: the room's flags and intent; the game is the one running at the end, else the last
-- one played, else 'chat' (§5.5). Otherwise as in 20261005100000_encounters.sql.
create or replace function private.on_room_encounter()
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
  played text;
begin
  if old.status = 'ending' and new.status = 'closed' and new.reveal_result = 'mutual' then
    update public.play_history
    set reveal_mutual = true, available_at = now()
    where room_id = new.id and available_at = old.reveal_ends_at;
    return null;
  end if;

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
  played := coalesce(old.concept, old.game_state -> 'lastGame' ->> 'concept', 'chat');
  encounter := gen_random_uuid();

  insert into public.play_history (
    encounter_id, user_id, other_user_id, other_profiled, room_id, concept, mode, intent,
    own_alias, other_alias, other_headcount, started_at, played_at, available_at
  )
  values
    (encounter, owner_s.user_id, guest_s.user_id, old.guest_profiled, old.id, played,
     case when played = 'tabu' then 'voice' else 'text' end, old.intent,
     old.owner_alias, old.guest_alias, old.guest_headcount, old.guest_joined_at, now(), available),
    (encounter, guest_s.user_id, owner_s.user_id, old.owner_profiled, old.id, played,
     case when played = 'tabu' then 'voice' else 'text' end, old.intent,
     old.guest_alias, old.owner_alias, old.owner_headcount, old.guest_joined_at, now(), available)
  on conflict do nothing;
  return null;
end;
$$;

-- Games -----------------------------------------------------------------------------------------------------
-- Two-table Tabu starts from an accepted proposal; the owner's table describes first. The body of
-- the old tabu/start (20261006090000_voice_tabu.sql) without its caller checks.
drop function public.tabu_start(uuid, uuid, integer, integer, integer, integer);

create function private.start_voice_tabu(
  r public.rooms,
  turn_seconds integer,
  total_turns integer,
  max_passes integer,
  cards_per_turn integer
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_game integer;
  turn public.tabu_turns;
begin
  next_game := coalesce((r.game_state ->> 'gameNo')::integer, 0) + 1;
  r.game_state := jsonb_build_object(
    'concept', 'tabu', 'mode', 'voice', 'phase', 'playing', 'gameNo', next_game,
    'turnNo', 1, 'totalTurns', total_turns, 'turnSeconds', turn_seconds,
    'cardsPerTurn', cards_per_turn, 'describingTable', 'owner',
    'scores', jsonb_build_object('owner', 0, 'guest', 0),
    'passesUsed', 0, 'maxPasses', max_passes, 'cardIndex', 0
  );
  turn := private.open_turn(r, 1, next_game);

  update public.rooms
  set concept = 'tabu', last_activity_at = now(),
      game_state = r.game_state || jsonb_build_object('turnEndsAt', turn.ends_at)
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.start_voice_tabu(public.rooms, integer, integer, integer, integer)
  from public, anon, authenticated;

-- The next Sohbet card, 5 seconds apart per room.
create function private.deal_sohbet(r public.rooms, cooldown_ms integer)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  card public.cards;
begin
  if (r.game_state ->> 'nextAllowedAt')::timestamptz > now() then
    raise exception using errcode = 'P0001', message = 'too_soon';
  end if;
  card := private.pick_card(r.id, 'sohbet');
  update public.rooms
  set concept = 'sohbet', last_activity_at = now(),
      game_state = private.between_games(r.game_state, null) || jsonb_build_object(
        'concept', 'sohbet', 'cardId', card.id, 'theme', card.theme, 'prompt', card.prompt,
        'nextAllowedAt', now() + make_interval(secs => cooldown_ms / 1000.0)
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function private.deal_sohbet(public.rooms, integer) from public, anon, authenticated;

-- rooms/propose-game: only in a two-table room with no game and no open proposal (rule 3).
create function public.rooms_propose_game(
  target_user_id uuid,
  target_room_id uuid,
  new_concept text,
  ttl_seconds integer
)
returns public.game_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  created public.game_proposals;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.status <> 'active' or r.guest_session_id is null then
    raise exception using errcode = 'P0001', message = 'needs_two_tables';
  end if;
  if r.concept is not null then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;

  delete from public.game_proposals where room_id = r.id and expires_at <= now();
  if exists (select 1 from public.game_proposals where room_id = r.id) then
    raise exception using errcode = 'P0001', message = 'proposal_pending';
  end if;

  insert into public.game_proposals (room_id, proposer_session_id, concept, expires_at)
  values (r.id, m.session_id, new_concept, now() + make_interval(secs => ttl_seconds))
  returning * into created;
  update public.rooms set last_activity_at = now() where id = r.id;
  return created;
end;
$$;

-- rooms/answer-game: only the other table answers. A decline deletes the proposal (the proposer sees
-- it at once, the same text as a timeout); an accept deletes it and starts the game.
create function public.rooms_answer_game(
  target_user_id uuid,
  target_room_id uuid,
  accept boolean,
  turn_seconds integer,
  total_turns integer,
  max_passes integer,
  cards_per_turn integer,
  cooldown_ms integer
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  p public.game_proposals;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  select * into p from public.game_proposals where room_id = r.id for update;
  if p.room_id is null or p.expires_at <= now() or p.proposer_session_id = m.session_id then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  delete from public.game_proposals where room_id = r.id;

  if not accept then
    return r;
  end if;
  if r.status <> 'active' or r.guest_session_id is null then
    raise exception using errcode = 'P0001', message = 'needs_two_tables';
  end if;
  if r.concept is not null then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;

  if p.concept = 'tabu' then
    return private.start_voice_tabu(r, turn_seconds, total_turns, max_passes, cards_per_turn);
  end if;
  return private.deal_sohbet(r, cooldown_ms);
end;
$$;

-- rooms/end-game ("Oyunu bitir"): the room returns to chat. Idempotent. A voice Tabu ended early
-- writes no result.
create function public.rooms_end_game(target_user_id uuid, target_room_id uuid)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept is null then
    return r;
  end if;
  update public.rooms
  set concept = null, last_activity_at = now(),
      game_state = private.between_games(game_state, jsonb_build_object('concept', r.concept))
  where id = r.id
  returning * into r;
  return r;
end;
$$;

revoke all on function public.rooms_propose_game(uuid, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.rooms_answer_game(uuid, uuid, boolean, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.rooms_end_game(uuid, uuid) from public, anon, authenticated;
grant execute on function public.rooms_propose_game(uuid, uuid, text, integer) to service_role;
grant execute on function public.rooms_answer_game(uuid, uuid, boolean, integer, integer, integer, integer, integer)
  to service_role;
grant execute on function public.rooms_end_game(uuid, uuid) to service_role;

-- Proposals past their 30 seconds are deleted by the next propose/answer and by this job.
create function private.expire_game_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.game_proposals
  where room_id in (
    select room_id from public.game_proposals
    where expires_at <= now()
    for update skip locked
  );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.expire_game_proposals() from public, anon, authenticated;

select cron.schedule(
  'expire-game-proposals',
  '* * * * *',
  $$select private.expire_game_proposals()$$
);

-- One-table games start at once (§5.3). Tabu: the deck, the phone runs the game; the room's
-- activity becomes 'tabu' until "Oyunu bitir" or a second table joins.
create or replace function public.tabu_local_deck(
  target_user_id uuid,
  target_room_id uuid,
  deck_size integer
)
returns table (word text, forbidden text[])
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.guest_session_id is not null then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  if r.concept is not null and r.concept <> 'tabu' then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;
  update public.rooms
  set concept = 'tabu', last_activity_at = now(),
      game_state = private.between_games(game_state, null)
  where id = r.id;
  return query
    select c.word, c.forbidden from public.cards c
    where c.deck = 'tabu' and c.is_active
    order by random()
    limit deck_size;
end;
$$;

-- Sohbet kartları: in a two-table room only once accepted; a one-table room starts it at once.
create or replace function public.sohbet_next(
  target_user_id uuid,
  target_room_id uuid,
  cooldown_ms integer
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept is not distinct from 'sohbet' then
    return private.deal_sohbet(r, cooldown_ms);
  end if;
  if r.concept is not null then
    raise exception using errcode = 'P0001', message = 'game_in_progress';
  end if;
  if r.guest_session_id is not null then
    raise exception using errcode = 'P0001', message = 'no_proposal';
  end if;
  return private.deal_sohbet(r, cooldown_ms);
end;
$$;

-- Tabu turns: the concept may be null now, so the checks compare with IS DISTINCT FROM. As in
-- 20260929090000_concepts.sql.
create or replace function private.tabu_playing_room(target_user_id uuid, target_room_id uuid)
returns table (room public.rooms, session_id uuid, turn public.tabu_turns)
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  t public.tabu_turns;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id;
  if r.concept is distinct from 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
    raise exception using errcode = 'P0001', message = 'no_game';
  end if;
  select * into t from public.tabu_turns
  where room_id = r.id
    and game_no = (r.game_state ->> 'gameNo')::integer
    and turn_no = (r.game_state ->> 'turnNo')::integer
  for update;
  return query select r, m.session_id, t;
end;
$$;

-- The last turn ends the game and the room returns to chat: concept null, the result kept as
-- lastGame. Otherwise as in 20261006090000_voice_tabu.sql.
create or replace function public.tabu_end_turn(
  target_user_id uuid,
  target_room_id uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  r public.rooms;
  t public.tabu_turns;
  next_no integer;
  next_turn public.tabu_turns;
  owner_score integer;
  guest_score integer;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.concept is distinct from 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
    return r;
  end if;
  select * into t from public.tabu_turns
  where room_id = r.id
    and game_no = (r.game_state ->> 'gameNo')::integer
    and turn_no = (r.game_state ->> 'turnNo')::integer
  for update;
  if now() < t.ends_at then
    return r;
  end if;

  if t.turn_no >= (r.game_state ->> 'totalTurns')::integer then
    owner_score := (r.game_state -> 'scores' ->> 'owner')::integer;
    guest_score := (r.game_state -> 'scores' ->> 'guest')::integer;
    insert into public.game_results (user_id, room_id, concept, mode, score, won)
    select ts.user_id, r.id, 'tabu', 'voice',
           case when ts.id = r.owner_session_id then owner_score else guest_score end,
           case when ts.id = r.owner_session_id then owner_score > guest_score
                else guest_score > owner_score end
    from public.table_sessions ts
    where ts.id in (r.owner_session_id, r.guest_session_id);
    insert into public.game_events (room_id, type, payload)
    values (r.id, 'game_completed', jsonb_build_object('scores', r.game_state -> 'scores'));

    update public.rooms
    set concept = null, last_activity_at = now(),
        game_state = private.between_games(
          game_state,
          jsonb_build_object('concept', 'tabu', 'scores', game_state -> 'scores')
        )
    where id = r.id
    returning * into r;
    return r;
  end if;

  next_no := t.turn_no + 1;
  next_turn := private.open_turn(r, next_no, t.game_no);
  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnNo', next_no, 'turnEndsAt', next_turn.ends_at, 'passesUsed', 0, 'cardIndex', 0,
        'describingTable', case when next_no % 2 = 1 then 'owner' else 'guest' end
      )
  where id = r.id
  returning * into r;
  return r;
end;
$$;

-- Masa adını yeniden çek (§5.6) ------------------------------------------------------------------------------
-- Not in a room and not with a request out; at most max_rerolls per check-in. A taken alias raises
-- 23505 (the Edge Function draws another). Old aliases stay in history and the block list.
create function public.reroll_table_alias(
  target_user_id uuid,
  new_alias text,
  max_rerolls integer
)
returns public.table_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
begin
  s := private.active_session_for_update(target_user_id);
  if private.open_room_of_session(s.id) is not null or private.has_open_request(s.id) then
    raise exception using errcode = 'P0001', message = 'in_room';
  end if;
  if s.alias_rerolls >= max_rerolls then
    raise exception using errcode = 'P0001', message = 'reroll_limit';
  end if;
  update public.table_sessions
  set alias = new_alias, alias_rerolls = alias_rerolls + 1
  where id = s.id
  returning * into s;
  return s;
end;
$$;

revoke all on function public.reroll_table_alias(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reroll_table_alias(uuid, text, integer) to service_role;
