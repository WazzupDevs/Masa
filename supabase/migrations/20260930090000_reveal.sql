-- M6: end of a two-table room and the mutual "Tanışalım mı?" signal (MVP_SPEC §4.6).

alter table public.rooms
  add column reveal_result text check (reveal_result in ('mutual', 'none')),
  add column reveal_token jsonb,
  add column reveal_ends_at timestamptz,
  add constraint rooms_reveal_token_only_when_mutual
    check (reveal_token is null or reveal_result = 'mutual');

-- reveal_decisions -----------------------------------------------------------------------
-- Each table reads only its own answer. Nobody ever learns the other table's answer: the room
-- row carries only the shared result.
create table public.reveal_decisions (
  room_id uuid not null references public.rooms (id) on delete cascade,
  session_id uuid not null references public.table_sessions (id) on delete cascade,
  wants_meet boolean not null,
  created_at timestamptz not null default now(),
  primary key (room_id, session_id)
);

alter table public.reveal_decisions enable row level security;
revoke all on table public.reveal_decisions from anon, authenticated;
grant select on table public.reveal_decisions to authenticated;

create function private.owns_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.table_sessions
    where id = target_session_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_session(uuid) from public, anon;
grant execute on function private.owns_session(uuid) to authenticated;

create policy "reveal_decisions: own answer only"
  on public.reveal_decisions for select
  to authenticated
  using (private.owns_session(session_id));

-- Helpers ------------------------------------------------------------------------------------
create function private.start_reveal(target_room_id uuid, decision_seconds integer)
returns public.rooms
language sql
security definer
set search_path = ''
as $$
  update public.rooms
  set status = 'ending', last_activity_at = now(),
      reveal_ends_at = now() + make_interval(secs => decision_seconds)
  where id = target_room_id
  returning *;
$$;

-- Closes an ending room. 'mutual' only when both tables said yes (then the token is shown on both
-- screens); every other case is 'none', the same for both tables.
create function private.finish_reveal(target_room_id uuid, token jsonb)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  yes_count integer;
  result public.rooms;
begin
  select count(*) filter (where wants_meet) into yes_count
  from public.reveal_decisions where room_id = target_room_id;

  update public.rooms
  set status = 'closed', closed_at = now(),
      reveal_result = case when yes_count = 2 and token is not null then 'mutual' else 'none' end,
      reveal_token = case when yes_count = 2 and token is not null then token else null end
  where id = target_room_id and status = 'ending'
  returning * into result;
  return result;
end;
$$;

revoke all on function private.start_reveal(uuid, integer) from public, anon, authenticated;
revoke all on function private.finish_reveal(uuid, jsonb) from public, anon, authenticated;

-- A table leaving (or ending) closes an ending room with 'none'.
create or replace function private.release_rooms_of_session(target_session_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed_count integer;
  released_count integer;
  ending_count integer;
begin
  update public.rooms
  set status = 'closed', closed_at = now(), reveal_result = 'none', reveal_token = null
  where status = 'ending'
    and (owner_session_id = target_session_id or guest_session_id = target_session_id);
  get diagnostics ending_count = row_count;

  update public.rooms
  set status = 'closed', closed_at = now()
  where owner_session_id = target_session_id and status <> 'closed';
  get diagnostics closed_count = row_count;

  update public.rooms
  set guest_session_id = null, guest_alias = null, guest_headcount = null,
      status = 'waiting', waiting_since = now(), last_activity_at = now(),
      game_state = case when concept = 'tabu' then '{}'::jsonb else game_state end
  where guest_session_id = target_session_id and status <> 'closed';
  get diagnostics released_count = row_count;

  return ending_count + closed_count + released_count;
end;
$$;

-- "Odayı bitir": a two-table room opens the reveal window, a one-table room closes. Idempotent.
drop function public.rooms_end(uuid);

create function public.rooms_end(target_user_id uuid, decision_seconds integer)
returns public.rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.table_sessions;
  r public.rooms;
begin
  s := private.active_session_for_update(target_user_id);
  select * into r from public.rooms where id = private.open_room_of_session(s.id) for update;
  if r.id is null or r.status = 'ending' then
    return r;
  end if;
  if r.status = 'active' and r.guest_session_id is not null then
    return private.start_reveal(r.id, decision_seconds);
  end if;
  update public.rooms set status = 'closed', closed_at = now() where id = r.id returning * into r;
  return r;
end;
$$;

revoke all on function public.rooms_end(uuid, integer) from public, anon, authenticated;
grant execute on function public.rooms_end(uuid, integer) to service_role;

-- Tabu's last turn ends the room into the reveal window (MVP_SPEC §4.6: "Tabu bittiğinde").
drop function public.tabu_end_turn(uuid, uuid);

create function public.tabu_end_turn(
  target_user_id uuid,
  target_room_id uuid,
  decision_seconds integer
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
  next_describer uuid;
  next_card public.cards;
  next_turn public.tabu_turns;
begin
  select * into m from private.room_membership(target_user_id, target_room_id);
  select * into r from public.rooms where id = target_room_id for update;
  if r.concept <> 'tabu' or r.game_state ->> 'phase' is distinct from 'playing' then
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

  perform private.tabu_close_card(r, t, 'timeout', false);

  if t.turn_no >= (r.game_state ->> 'totalTurns')::integer then
    update public.rooms
    set last_activity_at = now(), game_state = game_state || jsonb_build_object('phase', 'finished')
    where id = r.id
    returning * into r;
    insert into public.game_events (room_id, type, payload)
    values (r.id, 'game_completed', jsonb_build_object('score', (r.game_state ->> 'score')::integer));
    return private.start_reveal(r.id, decision_seconds);
  end if;

  -- Tables take turns describing: odd turns the owner (Masa A), even turns the guest (Masa B).
  next_no := t.turn_no + 1;
  next_describer := case when next_no % 2 = 1 then r.owner_session_id else r.guest_session_id end;
  next_card := private.pick_card(r.id, 'tabu');
  insert into public.tabu_turns (room_id, game_no, turn_no, describer_session_id, card_id, ends_at)
  values (r.id, t.game_no, next_no, next_describer, next_card.id,
          now() + make_interval(secs => (r.game_state ->> 'turnSeconds')::integer))
  returning * into next_turn;

  update public.rooms
  set last_activity_at = now(),
      game_state = game_state || jsonb_build_object(
        'turnNo', next_no, 'describerSessionId', next_describer,
        'turnEndsAt', next_turn.ends_at, 'passesUsed', 0
      )
  where id = r.id
  returning * into r;

  insert into public.game_events (room_id, turn_id, session_id, type, payload)
  values (r.id, next_turn.id, next_describer, 'turn_started', jsonb_build_object('turnNo', next_no));
  return r;
end;
$$;

revoke all on function public.tabu_end_turn(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.tabu_end_turn(uuid, uuid, integer) to service_role;

-- reveal (service role only) -------------------------------------------------------------------
-- One answer per table, final. When both have answered the room closes at once (MVP_SPEC §9).
-- `token` is the color and emoji picked by the Edge Function; used only on a mutual yes.
create function public.reveal_decide(
  target_user_id uuid,
  target_room_id uuid,
  wants boolean,
  token jsonb
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
  if r.status <> 'ending' or now() >= r.reveal_ends_at then
    raise exception using errcode = 'P0001', message = 'reveal_closed';
  end if;

  insert into public.reveal_decisions (room_id, session_id, wants_meet)
  values (r.id, m.session_id, wants)
  on conflict (room_id, session_id) do nothing;

  if (select count(*) from public.reveal_decisions where room_id = r.id) = 2 then
    return private.finish_reveal(r.id, token);
  end if;
  return r;
end;
$$;

-- Called by either table when the 60 seconds are over. Idempotent.
create function public.reveal_finalize(target_user_id uuid, target_room_id uuid)
returns public.rooms
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
    -- Both yes closes at the second answer, so no token is needed here: the result is 'none'.
    return private.finish_reveal(r.id, null);
  end if;
  return r;
end;
$$;

revoke all on function public.reveal_decide(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.reveal_finalize(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reveal_decide(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.reveal_finalize(uuid, uuid) to service_role;

-- Safety net: reveal windows nobody finalized close a minute later (MVP_SPEC §9 Zamanlama).
create function private.close_expired_reveals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_id uuid;
  n integer := 0;
begin
  for room_id in
    select id from public.rooms
    where status = 'ending' and reveal_ends_at <= now() - interval '1 minute'
    for update skip locked
  loop
    perform private.finish_reveal(room_id, null);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function private.close_expired_reveals() from public, anon, authenticated;

select cron.schedule('close-expired-reveals', '* * * * *', $$select private.close_expired_reveals()$$);
