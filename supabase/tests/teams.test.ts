// Faz 2 step 22.2 (docs/SPEC_V3.md §22.B–§22.D, §22.I, §22.K, §22.M): teams. A side takes up to 4
// phones, its leader and up to 3 members; "Bu masadayım" asks the side's leader; a phone leaves on
// its own, its leader's block or the end of its table; the side's oldest member leads when the
// leader goes. Old apps (no `teams` at check-in) keep today's room: the existing tests of
// rooms.test.ts, reveal.test.ts and the others run unchanged against the same functions.
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { CURRENT_LOCATION_CONSENT_VERSION } from '../functions/_shared/pure/consent.ts';
import { sessionChannel } from '../functions/_shared/pure/rooms.ts';
import { MAX_SIDE_PHONES, sideHeadcount } from '../functions/_shared/pure/teams.ts';
import { deleteAccount } from '../../scripts/admin/account.ts';
import {
  ANCHOR,
  deleteFixtureVenues,
  FIXTURE_VENUES,
  insertFixtureVenues,
  offset,
} from './fixtures/venues.ts';
import { errorBody, onboarded, PHONES, waitForBroadcast, waitUntilBlocked } from './helpers.ts';
import { admin, type Client, dbUrl, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

let venue: Record<string, string> = {};
const V = 'at-anchor';

// A full room: two sides of 4 phones ([auth.sms.test_otp] in config.toml).
const TEAM_PHONES = [
  ...PHONES,
  '+905550000004',
  '+905550000005',
  '+905550000006',
  '+905550000007',
  '+905550000008',
] as const;

beforeAll(async () => {
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  for (const phone of TEAM_PHONES) await deleteUserByPhone(phone);
});

afterAll(async () => {
  await deleteFixtureVenues(sql);
  await sql.end();
});

type Phone = { client: Client; sessionId: string; alias: string; userId: string };

// Checks in at the venue; `teams: true` unless told otherwise (an old app sends nothing).
async function table(
  n: number,
  opts: { teams?: boolean; headcount?: number } = {},
): Promise<Phone> {
  const phone = TEAM_PHONES[n];
  if (!phone) throw new Error(`no test phone ${n}`);
  const client = await onboarded(phone, { displayName: `Kişi ${n}` });
  const fixture = FIXTURE_VENUES.find((v) => v.key === V);
  if (!fixture) throw new Error('no fixture');
  const here = offset(ANCHOR, fixture.distanceM, fixture.bearingDeg);
  const res = await invoke(client, 'checkin', {
    action: 'check-in',
    venueId: venue[V],
    lat: here.lat,
    lng: here.lng,
    accuracyM: 10,
    headcount: opts.headcount ?? 2,
    locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
    ...(opts.teams === false ? {} : { teams: true }),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const { sessionId, alias } = res.body as { sessionId: string; alias: string };
  return { client, sessionId, alias, userId: await userIdOf(client) };
}

type TupleOf<T, N extends number, R extends T[] = []> = R['length'] extends N
  ? R
  : TupleOf<T, N, [T, ...R]>;

// Phones 0 … count-1, all with `teams: true`.
async function tables<N extends number>(count: N): Promise<TupleOf<Phone, N>> {
  return (await Promise.all(Array.from({ length: count }, (_, i) => table(i)))) as TupleOf<
    Phone,
    N
  >;
}

const rooms = (p: Phone, body: Record<string, unknown>) => invoke(p.client, 'rooms', body);

async function createRoom(owner: Phone): Promise<string> {
  const res = await rooms(owner, { action: 'create', profiled: false });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { roomId: string }).roomId;
}

// "Katıl" (side omitted) or "Bu masadayım" (side given).
function ask(p: Phone, roomId: string, side?: 'owner' | 'guest') {
  return rooms(p, { action: 'request-join', roomId, profiled: false, ...(side ? { side } : {}) });
}

async function requestIdOf(p: Phone, roomId: string): Promise<string> {
  const [row] = await sql`
    select id from public.join_requests
    where room_id = ${roomId} and requester_session_id = ${p.sessionId} and status = 'pending'
  `;
  if (!row) throw new Error('no pending request');
  return row.id as string;
}

async function respond(leader: Phone, requestId: string, accept: boolean) {
  return rooms(leader, { action: 'respond', requestId, accept });
}

// The request and its accept, both expected to go through.
async function join(p: Phone, leader: Phone, roomId: string, side?: 'owner' | 'guest') {
  const asked = await ask(p, roomId, side);
  expect(asked.status, JSON.stringify(asked.body)).toBe(200);
  const answered = await respond(leader, await requestIdOf(p, roomId), true);
  expect(answered, JSON.stringify(answered.body)).toEqual({ status: 200, body: { ok: true } });
}

// An owner with a guest's side ("Katıl"), then members on the given sides.
async function room(
  owner: Phone,
  guest: Phone | null,
  members: { owner?: Phone[]; guest?: Phone[] } = {},
): Promise<string> {
  const roomId = await createRoom(owner);
  if (guest) await join(guest, owner, roomId);
  for (const m of members.owner ?? []) await join(m, owner, roomId, 'owner');
  for (const m of members.guest ?? []) await join(m, guest ?? owner, roomId, 'guest');
  return roomId;
}

const leave = (p: Phone, roomId: string) => rooms(p, { action: 'leave', roomId });
const block = (p: Phone, roomId: string, target?: Phone) =>
  invoke(p.client, 'safety', {
    action: 'block',
    roomId,
    ...(target ? { sessionId: target.sessionId } : {}),
  });

async function roomRow(roomId: string) {
  const [row] = await sql`select * from public.rooms where id = ${roomId}`;
  if (!row) throw new Error('no room');
  return row;
}

async function phonesOf(p: Phone, roomId: string) {
  const { data, error } = await p.client.rpc('room_phones', { target_room_id: roomId });
  expect(error).toBeNull();
  return data ?? [];
}

async function myRequests(p: Phone) {
  const { data, error } = await p.client.from('my_join_requests').select('*').order('created_at');
  expect(error).toBeNull();
  return data ?? [];
}

// rooms and room_members agree (§22.B): each leader has an open row on its side and the phone counts
// are the open rows. Checked after every path that moves a phone.
async function expectConsistent(roomId: string): Promise<void> {
  const r = await roomRow(roomId);
  if (!['waiting', 'active'].includes(r.status as string)) return;
  const rows = await sql`
    select session_id, side from public.room_members where room_id = ${roomId} and left_at is null
  `;
  const on = (side: string) => rows.filter((x) => x.side === side).map((x) => x.session_id);
  expect(on('owner')).toContain(r.owner_session_id);
  expect(r.owner_phones).toBe(on('owner').length);
  if (r.guest_session_id) {
    expect(on('guest')).toContain(r.guest_session_id);
    expect(r.guest_phones).toBe(on('guest').length);
  } else {
    expect(r.guest_phones).toBeNull();
    expect(on('guest')).toEqual([]);
  }
}

async function readsRoom(p: Phone, roomId: string): Promise<boolean> {
  const { data } = await p.client.from('rooms').select('id').eq('id', roomId);
  return (data ?? []).length === 1;
}

async function expireRequests(roomId: string) {
  await sql`update public.join_requests set expires_at = now() - interval '1 second' where room_id = ${roomId}`;
}

// Joins a private channel; resolves with the final status.
function joinChannel(p: Phone, topic: string): Promise<string> {
  const channel = p.client.channel(topic, { config: { private: true } });
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      void p.client.removeChannel(channel);
      resolve('TIMED_OUT');
    }, 8000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        void p.client.removeChannel(channel);
        resolve(status);
      }
    });
  });
}

describe('old apps (§22.B)', () => {
  it('keeps a table without `teams` a leader only: no running room, no "Bu masadayım"', async () => {
    const [owner, guest, viewer] = await Promise.all([
      table(0, { teams: false }),
      table(1, { teams: false }),
      table(2),
    ]);
    const roomId = await room(owner, guest);
    expect((await roomRow(roomId)).owner_phones).toBe(1);
    expect(
      await viewer.client.rpc('venue_running_rooms', { target_venue_id: venue[V] ?? '' }),
    ).toMatchObject({
      data: [],
    });
    expect(await ask(viewer, roomId, 'owner')).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
    expect(await ask(viewer, roomId, 'guest')).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });

    // An open room of a table without `teams`: "Bu masadayım" is closed, "Katıl" as before.
    const other = await table(3, { teams: false });
    const openRoom = await createRoom(other);
    const { data: lobbyPhones } = await viewer.client.rpc('venue_lobby_phones', {
      target_venue_id: venue[V] ?? '',
    });
    expect(lobbyPhones).toEqual([{ room_id: openRoom, phones: 1, member_open: false }]);
    expect(await ask(viewer, openRoom, 'owner')).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
    expect((await ask(viewer, openRoom)).status).toBe(200);
  });

  it('refuses "Bu masadayım" from a table without `teams`', async () => {
    const [owner, old] = await Promise.all([table(0), table(1, { teams: false })]);
    const roomId = await createRoom(owner);
    expect(await ask(old, roomId, 'owner')).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
  });

  // "Ters yön": an old app never becomes the guest leader of a room with members.
  it('hides an owner side with members from a table without `teams` and refuses its "Katıl", also at accept', async () => {
    const [owner, member, old, owner2] = await Promise.all([
      table(0),
      table(1),
      table(2, { teams: false }),
      table(3),
    ]);
    const roomId = await room(owner, null, { owner: [member] });
    const lobby = async (p: Phone) =>
      ((await p.client.rpc('venue_lobby', { target_venue_id: venue[V] ?? '' })).data ?? []).map(
        (r) => r.room_id,
      );
    expect(await lobby(old)).not.toContain(roomId);
    expect(await ask(old, roomId)).toEqual({ status: 409, body: errorBody('room_not_available') });

    // The same table's "Katıl" to a room without members works as before; a member arriving while
    // it waits makes the accept room_not_available, and the request stays pending until it expires.
    const room2 = await createRoom(owner2);
    expect(await lobby(old)).toContain(room2);
    expect((await ask(old, room2)).status).toBe(200);
    await leave(member, roomId);
    await join(member, owner2, room2, 'owner');
    expect(await lobby(old)).not.toContain(room2);
    expect(await respond(owner2, await requestIdOf(old, room2), true)).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
    expect((await myRequests(old)).map((r) => r.status)).toEqual(['pending']);
    await expireRequests(room2);
    expect((await myRequests(old)).map((r) => r.status)).toEqual(['unavailable']);
    expect((await roomRow(room2)).guest_session_id).toBeNull();
  });
});

describe('"Bu masadayım" (§22.C)', () => {
  it("goes to the side's leader; the accept opens the phone's row", async () => {
    const [owner, guest, friend] = await tables(3);
    const roomId = await room(owner, guest);
    const listener = waitForBroadcast(
      guest.client,
      sessionChannel(guest.sessionId),
      'join_request',
    );
    await listener.subscribed;
    expect((await ask(friend, roomId, 'guest')).status).toBe(200);
    await expect(listener.received).resolves.toBeUndefined();
    await listener.close();

    // Only the guest's leader reads the request; the owner does not, the requester never.
    const read = async (p: Phone) =>
      (await p.client.from('join_requests').select('requester_alias, side, as_member')).data;
    expect(await read(guest)).toEqual([
      { requester_alias: friend.alias, side: 'guest', as_member: true },
    ]);
    expect(await read(owner)).toEqual([
      expect.objectContaining({ as_member: false }), // the guest's own "Katıl", accepted
    ]);
    expect(await read(friend)).toEqual([]);

    // The owner cannot answer it.
    const requestId = await requestIdOf(friend, roomId);
    expect(await respond(owner, requestId, true)).toEqual({
      status: 404,
      body: errorBody('request_not_found'),
    });
    expect(await respond(guest, requestId, true)).toEqual({ status: 200, body: { ok: true } });
    expect((await myRequests(friend)).map((r) => r.status)).toEqual(['accepted']);
    expect(await readsRoom(friend, roomId)).toBe(true);
    expect((await roomRow(roomId)).guest_phones).toBe(2);
    expect((await phonesOf(friend, roomId)).map((p) => [p.side, p.alias, p.is_leader])).toEqual([
      ['owner', owner.alias, true],
      ['guest', guest.alias, true],
      ['guest', friend.alias, false],
    ]);
    await expectConsistent(roomId);
  });

  // Rule 5: the "Bu masadayım" form of rooms.test.ts → "declined and expired requests look the same".
  it('shows a decline and a timeout to the requester the same way', async () => {
    const [owner, declined, ignored] = await tables(3);
    const roomId = await createRoom(owner);
    expect((await ask(declined, roomId, 'owner')).status).toBe(200);
    expect((await ask(ignored, roomId, 'owner')).status).toBe(200);
    await respond(owner, await requestIdOf(declined, roomId), false);

    const shape = (rows: Record<string, unknown>[]) =>
      rows.map((r) => ({ keys: Object.keys(r).sort(), status: r.status }));
    const [a, b] = [await myRequests(declined), await myRequests(ignored)];
    expect(shape(a)).toEqual(shape(b));
    expect(a.map((r) => r.status)).toEqual(['pending']);
    await expireRequests(roomId);
    const [c, d] = [await myRequests(declined), await myRequests(ignored)];
    expect(shape(c)).toEqual(shape(d));
    expect(c.map((r) => r.status)).toEqual(['unavailable']);

    // Unlike "Katıl", an unanswered "Bu masadayım" may be sent again.
    expect((await ask(declined, roomId, 'owner')).status).toBe(200);
  });

  it(`stops at ${MAX_SIDE_PHONES} phones, for the request and for the accept`, async () => {
    const [owner, m1, m2, late1, late2, sixth] = await tables(6);
    const roomId = await room(owner, null, { owner: [m1, m2] });
    expect((await ask(late1, roomId, 'owner')).status).toBe(200);
    expect((await ask(late2, roomId, 'owner')).status).toBe(200);
    expect(await respond(owner, await requestIdOf(late1, roomId), true)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect((await roomRow(roomId)).owner_phones).toBe(MAX_SIDE_PHONES);
    expect(await respond(owner, await requestIdOf(late2, roomId), true)).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
    expect((await myRequests(late2)).map((r) => r.status)).toEqual(['pending']);
    expect(await ask(sixth, roomId, 'owner')).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
    const { data } = await sixth.client.rpc('venue_lobby_phones', {
      target_venue_id: venue[V] ?? '',
    });
    expect(data).toEqual([{ room_id: roomId, phones: MAX_SIDE_PHONES, member_open: false }]);
    await expectConsistent(roomId);
  });

  it('shares the hourly limit with "Katıl"', async () => {
    const [owner, owner2, asker] = await tables(3);
    const roomId = await createRoom(owner);
    const elsewhere = await createRoom(owner2);
    // Ten "Katıl" requests this hour to another room, answered long ago.
    await sql`
      insert into public.join_requests
        (room_id, requester_session_id, requester_alias, requester_headcount, status, expires_at)
      select ${elsewhere}, ${asker.sessionId}, ${asker.alias}, 2, 'expired', now() - interval '1 minute'
      from generate_series(1, 10)
    `;
    expect(await ask(asker, roomId, 'owner')).toEqual({
      status: 429,
      body: errorBody('rate_limited'),
    });
    await sql`update public.join_requests set as_member = true, side = 'owner' where requester_session_id = ${asker.sessionId}`;
    expect(await ask(asker, roomId)).toEqual({ status: 429, body: errorBody('rate_limited') });
  });

  it('takes an account back only to the side it was on (wrong_side)', async () => {
    const [owner, guest, friend] = await tables(3);
    const roomId = await room(owner, guest, { guest: [friend] });
    expect(await leave(friend, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect(await ask(friend, roomId, 'owner')).toEqual({
      status: 409,
      body: errorBody('wrong_side'),
    });
    await join(friend, guest, roomId, 'guest');
    await expectConsistent(roomId);
  });

  it('keeps a phone in one room, also in the database', async () => {
    const [owner, member, owner2] = await tables(3);
    const roomId = await room(owner, null, { owner: [member] });
    const other = await createRoom(owner2);
    expect(await ask(member, other, 'owner')).toEqual({
      status: 409,
      body: errorBody('already_in_room'),
    });
    expect(await ask(member, other)).toEqual({ status: 409, body: errorBody('already_in_room') });
    expect(await rooms(member, { action: 'create', profiled: false })).toEqual({
      status: 409,
      body: errorBody('already_in_room'),
    });
    await expect(sql`
      insert into public.room_members (room_id, session_id, side, alias)
      values (${other}, ${member.sessionId}, 'owner', 'İkinci Oda')
    `).rejects.toMatchObject({ code: '23505' });
    expect(await readsRoom(member, roomId)).toBe(true);
  });
});

describe('leaving (§22.D)', () => {
  it('lets a member go while the room goes on; twice is not_in_room', async () => {
    const [owner, member] = await tables(2);
    const roomId = await room(owner, null, { owner: [member] });
    expect(await leave(member, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect(await leave(member, roomId)).toEqual({ status: 403, body: errorBody('not_in_room') });
    const r = await roomRow(roomId);
    expect(r).toMatchObject({
      status: 'waiting',
      owner_session_id: owner.sessionId,
      owner_phones: 1,
    });
    expect(await readsRoom(member, roomId)).toBe(false);
    await expectConsistent(roomId);
  });

  it("hands a leaving leader's side to its oldest member; the declared headcount stays", async () => {
    const [owner, first, second, guest, waiting] = await Promise.all([
      table(0, { headcount: 4 }),
      table(1),
      table(2),
      table(3),
      table(4),
    ]);
    const roomId = await room(owner, guest, { owner: [first, second] });
    expect((await ask(waiting, roomId, 'owner')).status).toBe(200);

    expect(await leave(owner, roomId)).toEqual({ status: 200, body: { ok: true } });
    const r = await roomRow(roomId);
    expect(r).toMatchObject({
      status: 'active',
      owner_session_id: first.sessionId,
      owner_alias: first.alias,
      owner_headcount: 4,
      owner_phones: 2,
    });
    await expectConsistent(roomId);
    expect(await readsRoom(owner, roomId)).toBe(false);

    // The request that waited for the old leader is the new leader's.
    expect(await respond(first, await requestIdOf(waiting, roomId), true)).toEqual({
      status: 200,
      body: { ok: true },
    });
    await expectConsistent(roomId);
  });

  // Step 23.3 (docs/SPEC_V3.md §23.G): no window; the side's last phone closes the table at once.
  it("closes the room at once with the side's last phone, and a one-sided room", async () => {
    const [owner, guest, member] = await tables(3);
    const roomId = await room(owner, guest);
    expect(await leave(guest, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect((await roomRow(roomId)).status).toBe('closed');
    expect(await sql`select 1 from public.reveal_decisions where room_id = ${roomId}`).toHaveLength(
      0,
    );

    const solo = await room(member, null);
    expect(await leave(member, solo)).toEqual({ status: 200, body: { ok: true } });
    expect((await roomRow(solo)).status).toBe('closed');
  });

  it('takes the same paths when a phone leaves the venue or its time runs out', async () => {
    const [owner, member, guest] = await tables(3);
    const roomId = await room(owner, guest, { owner: [member] });
    expect(await invoke(owner.client, 'checkin', { action: 'leave' })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await roomRow(roomId)).toMatchObject({
      status: 'active',
      owner_session_id: member.sessionId,
    });
    await expectConsistent(roomId);

    await sql`update public.table_sessions set expires_at = now() - interval '1 minute' where id = ${member.sessionId}`;
    await sql`select private.end_expired_table_sessions()`;
    expect((await roomRow(roomId)).status).toBe('closed');
  });

  it('hands over when a leader’s account is deleted, and the room goes on', async () => {
    const [owner, member, guest] = await tables(3);
    const roomId = await room(owner, guest, { owner: [member] });
    await deleteAccount(admin, owner.userId);
    expect(await roomRow(roomId)).toMatchObject({
      status: 'active',
      owner_session_id: member.sessionId,
    });
    await expectConsistent(roomId);
  });

  it('lets only a leader end the room (not_leader), for every phone at once', async () => {
    const [owner, member, guest] = await tables(3);
    const roomId = await room(owner, guest, { owner: [member] });
    expect(await rooms(member, { action: 'end' })).toEqual({
      status: 403,
      body: errorBody('not_leader'),
    });
    expect((await roomRow(roomId)).status).toBe('active');
    expect(await rooms(owner, { action: 'end' })).toEqual({ status: 200, body: { ok: true } });
    expect((await roomRow(roomId)).status).toBe('closed');
    expect(await readsRoom(member, roomId)).toBe(false);
  });
});

describe('blocking in a room (§22.D)', () => {
  it('removes a member its leader blocks; the leader stays; the member neither sees nor asks', async () => {
    const [owner, stranger] = await tables(2);
    const roomId = await room(owner, null, { owner: [stranger] });
    expect(await block(owner, roomId, stranger)).toEqual({ status: 200, body: { ok: true } });
    expect(await roomRow(roomId)).toMatchObject({
      status: 'waiting',
      owner_session_id: owner.sessionId,
      owner_phones: 1,
    });
    await expectConsistent(roomId);
    expect(
      await sql`select 1 from public.blocks where blocker_id = ${owner.userId} and blocked_id = ${stranger.userId}`,
    ).toHaveLength(1);
    expect(await readsRoom(stranger, roomId)).toBe(false);
    const { data: lobby } = await stranger.client.rpc('venue_lobby', {
      target_venue_id: venue[V] ?? '',
    });
    expect(lobby).toEqual([]);
    expect(await ask(stranger, roomId, 'owner')).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
  });

  it('takes out a member who blocks its own leader or a teammate', async () => {
    const [owner, m1, m2] = await tables(3);
    const roomId = await room(owner, null, { owner: [m1, m2] });
    expect(await block(m1, roomId, m2)).toEqual({ status: 200, body: { ok: true } });
    expect((await phonesOf(owner, roomId)).map((p) => p.session_id)).toEqual([
      owner.sessionId,
      m2.sessionId,
    ]);
    expect(await block(m2, roomId, owner)).toEqual({ status: 200, body: { ok: true } });
    expect(await roomRow(roomId)).toMatchObject({
      status: 'waiting',
      owner_session_id: owner.sessionId,
      owner_phones: 1,
    });
    await expectConsistent(roomId);
  });

  it('takes out whoever blocks the other side: a member, then a leader', async () => {
    const [owner, ownerMember, guest, guestMember] = await tables(4);
    const roomId = await room(owner, guest, { owner: [ownerMember], guest: [guestMember] });
    expect(await block(guestMember, roomId, owner)).toEqual({ status: 200, body: { ok: true } });
    expect(await block(ownerMember, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect(await roomRow(roomId)).toMatchObject({
      status: 'active',
      owner_phones: 1,
      guest_phones: 1,
    });
    await expectConsistent(roomId);
    // Two leaders and no members: the step 3 block, which closes the table (step 23.3).
    expect(await block(guest, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect((await roomRow(roomId)).status).toBe('closed');
  });
});

describe('reporting in a room (§22.J)', () => {
  const report = (p: Phone, roomId: string, target?: Phone) =>
    invoke(p.client, 'safety', {
      action: 'report',
      target: 'room',
      roomId,
      reason: 'harassment',
      ...(target ? { sessionId: target.sessionId } : {}),
    });

  async function reportsBy(p: Phone) {
    return sql`
      select reported_user_id, room_id, messages_snapshot from public.reports
      where reporter_id = ${p.userId} order by created_at
    `;
  }

  it('reports the phone it names, on the other side or on its own', async () => {
    const [owner, ownerMember, guest, guestMember] = await tables(4);
    const roomId = await room(owner, guest, { owner: [ownerMember], guest: [guestMember] });
    await invoke(guestMember.client, 'chat', { action: 'send', roomId, body: 'rahatsız edici' });

    expect(await report(ownerMember, roomId, guestMember)).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await report(ownerMember, roomId, owner)).toEqual({ status: 200, body: { ok: true } });
    const rows = await reportsBy(ownerMember);
    expect(rows.map((r) => r.reported_user_id)).toEqual([guestMember.userId, owner.userId]);
    // The copy is the same as before: the room's messages the reporter's side can read.
    expect(rows[0]?.messages_snapshot).toEqual([
      expect.objectContaining({ alias: guestMember.alias, body: 'rahatsız edici' }),
    ]);
    // Nothing about the room changes: a report is not a block.
    expect(await roomRow(roomId)).toMatchObject({ status: 'active', owner_phones: 2 });
  });

  it("reports the other side's leader without sessionId, as before", async () => {
    const [owner, guest, guestMember] = await tables(3);
    const roomId = await room(owner, guest, { guest: [guestMember] });
    expect(await report(guestMember, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect((await reportsBy(guestMember)).map((r) => r.reported_user_id)).toEqual([owner.userId]);
  });

  it('reports a phone that has left, and nobody outside the room or itself', async () => {
    const [owner, member, guest, stranger] = await tables(4);
    const roomId = await room(owner, guest, { owner: [member] });
    await leave(member, roomId);
    expect(await report(guest, roomId, member)).toEqual({ status: 200, body: { ok: true } });
    expect((await reportsBy(guest)).map((r) => r.reported_user_id)).toEqual([member.userId]);

    for (const target of [stranger, guest]) {
      expect(await report(guest, roomId, target)).toEqual({
        status: 404,
        body: errorBody('not_found'),
      });
    }
    expect(await reportsBy(guest)).toHaveLength(1);
  });
});

describe('access (§22.I)', { timeout: 60_000 }, () => {
  it('gives a member the room and its channels, and a phone that left nothing', async () => {
    const [owner, member, guest] = await tables(3);
    const roomId = await room(owner, guest, { guest: [member] });
    expect(
      (await invoke(owner.client, 'chat', { action: 'send', roomId, body: 'merhaba' })).status,
    ).toBe(200);
    const readMessages = async (p: Phone) =>
      ((await p.client.from('messages').select('body').eq('room_id', roomId)).data ?? []).map(
        (m) => m.body,
      );
    expect(await readMessages(member)).toEqual(['merhaba']);
    for (const kind of ['room', 'messages', 'game', 'presence']) {
      expect(await joinChannel(member, `${kind}:${roomId}`), kind).toBe('SUBSCRIBED');
    }

    // A member writes with its own alias.
    expect(
      (await invoke(member.client, 'chat', { action: 'send', roomId, body: 'ben de' })).status,
    ).toBe(200);
    const [mine] = await sql`select sender_alias from public.messages where body = 'ben de'`;
    expect(mine?.sender_alias).toBe(member.alias);

    await leave(member, roomId);
    expect(await readsRoom(member, roomId)).toBe(false);
    expect(await readMessages(member)).toEqual([]);
    expect((await member.client.from('game_proposals').select('room_id')).data).toEqual([]);
    for (const kind of ['room', 'messages', 'game', 'presence']) {
      expect(await joinChannel(member, `${kind}:${roomId}`), kind).toBe('CHANNEL_ERROR');
    }

    // Step 23.3: "Odayı bitir" closes the table at once; no window to shut presence in.
    await rooms(owner, { action: 'end' });
    expect((await roomRow(roomId)).status).toBe('closed');
  });

  it("lets the guest's side read the chat from the moment its side came, not before", async () => {
    const [owner, guest, member] = await tables(3);
    const roomId = await createRoom(owner);
    await invoke(owner.client, 'chat', { action: 'send', roomId, body: 'önce' });
    // Past the one message per second limit.
    await sql`update public.messages set created_at = created_at - interval '5 seconds' where room_id = ${roomId}`;
    await join(guest, owner, roomId);
    await invoke(owner.client, 'chat', { action: 'send', roomId, body: 'sonra' });
    await join(member, guest, roomId, 'guest');
    const { data } = await member.client.from('messages').select('body').eq('room_id', roomId);
    expect((data ?? []).map((m) => m.body)).toEqual(['sonra']);
  });
});

describe('lobby (§22.C)', () => {
  it('lists running rooms with only the two leaders’ aliases and the counts', async () => {
    const [owner, guest, member, viewer] = await Promise.all([
      table(0, { headcount: 3 }),
      table(1, { headcount: 1 }),
      table(2),
      table(3),
    ]);
    const roomId = await room(owner, guest, { guest: [member] });
    const { data, error } = await viewer.client.rpc('venue_running_rooms', {
      target_venue_id: venue[V] ?? '',
    });
    expect(error).toBeNull();
    expect(Object.keys(data?.[0] ?? {}).sort()).toEqual(
      [
        'guest_alias',
        'guest_headcount',
        'guest_open',
        'guest_phones',
        'owner_alias',
        'owner_headcount',
        'owner_open',
        'owner_phones',
        'room_id',
        'spot_id',
        'spot_name',
      ].sort(),
    );
    expect(data).toEqual([
      {
        room_id: roomId,
        owner_alias: owner.alias,
        guest_alias: guest.alias,
        owner_phones: 1,
        guest_phones: 2,
        owner_headcount: 3,
        // The guest declared 1; two phones make it 2 (sideHeadcount).
        guest_headcount: 2,
        owner_open: true,
        guest_open: true,
        spot_id: null,
        spot_name: null,
      },
    ]);
    const seen = JSON.stringify(data);
    const ids = await sql`
      select p.public_id::text as id from public.profiles p
      where p.id in ${sql([owner.userId, guest.userId, member.userId])}
    `;
    for (const id of [
      ...ids.map((r) => r.id as string),
      owner.userId,
      guest.userId,
      member.userId,
    ]) {
      expect(seen).not.toContain(id);
    }
    expect(seen).not.toContain(member.alias);

    // A phone in the room is not shown its own room; a blocked phone hides the room.
    const mine = await member.client.rpc('venue_running_rooms', {
      target_venue_id: venue[V] ?? '',
    });
    expect(mine.data).toEqual([]);
    await sql`
      insert into public.blocks (blocker_id, blocked_id, blocked_alias)
      values (${member.userId}, ${viewer.userId}, 'x')
    `;
    const blocked = await viewer.client.rpc('venue_running_rooms', {
      target_venue_id: venue[V] ?? '',
    });
    expect(blocked.data).toEqual([]);
  });
});

describe('side headcount', () => {
  it('agrees in SQL and in pure/teams.ts; the phone limit too', async () => {
    for (const declared of [1, 2, 4, 6]) {
      for (const phones of [1, 2, 3, 4]) {
        const [row] = await sql`
          select private.side_headcount(${declared}::smallint, ${phones}::smallint) as n
        `;
        expect(row?.n).toBe(sideHeadcount(declared, phones));
      }
    }
    const [limit] = await sql`select private.max_side_phones() as n`;
    expect(limit?.n).toBe(MAX_SIDE_PHONES);
  });
});

describe('locks (§22.K)', () => {
  // Every new path holds the caller's session, then the room, then room_members. A path is run
  // while another connection holds something it also needs: it waits, never deadlocks.

  // Accepting "Bu masadayım" waits for the requester's session before it holds the room, like
  // rooms_respond does for "Katıl" (rooms.test.ts → locks).
  it('lets the requester take its room while its leader accepts and waits for its session', async () => {
    const [owner, friend] = await tables(2);
    const roomId = await createRoom(owner);
    expect((await ask(friend, roomId, 'owner')).status).toBe(200);
    const requestId = await requestIdOf(friend, roomId);
    const leaving = postgres(dbUrl, { max: 1, onnotice: () => {} });
    const accepting = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      let accepted: Promise<unknown> = Promise.resolve();
      await leaving.begin(async (tx) => {
        await tx`select id from private.active_session_for_update(${friend.userId})`;
        accepted =
          accepting`select (public.rooms_respond(${owner.userId}, ${requestId}, true)).status`
            .execute()
            .catch((err: unknown) => err);
        await waitUntilBlocked('rooms_respond');
        await tx`set local lock_timeout = '2s'`;
        expect(await tx`select id from public.rooms where id = ${roomId} for update`).toHaveLength(
          1,
        );
      });
      expect(await accepted).toEqual([{ status: 'accepted' }]);
    } finally {
      await Promise.all([leaving.end(), accepting.end()]);
    }
    await expectConsistent(roomId);
  });

  // A leader leaving hands over without the heir's session: the heir's own action holding it does
  // not stop the hand-over.
  it("hands over while the heir's session is held", async () => {
    const [owner, heir] = await tables(2);
    const roomId = await room(owner, null, { owner: [heir] });
    const leaving = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      await sql.begin(async (tx) => {
        await tx`select id from private.active_session_for_update(${heir.userId})`;
        const left = await leaving.begin(async (ltx) => {
          await ltx`set local lock_timeout = '2s'`;
          return ltx`select (public.rooms_leave(${owner.userId}, ${roomId})).owner_session_id as leader`;
        });
        expect(left).toEqual([{ leader: heir.sessionId }]);
      });
    } finally {
      await leaving.end();
    }
    await expectConsistent(roomId);
  });

  // The leader and its only member leave at once: one hands over, the other closes; no deadlock.
  it('lets a leader and its member leave at once', async () => {
    const [owner, member] = await tables(2);
    const roomId = await room(owner, null, { owner: [member] });
    const both = await Promise.all([leave(owner, roomId), leave(member, roomId)]);
    expect(both.map((r) => r.status)).toEqual([200, 200]);
    expect((await roomRow(roomId)).status).toBe('closed');
    expect(
      await sql`select 1 from public.room_members where room_id = ${roomId} and left_at is null`,
    ).toHaveLength(0);
  });

  // Blocking the other side needs only the blocker's session and the room.
  it("blocks the other side while that side's leader holds its session", async () => {
    const [owner, guest, guestMember] = await tables(3);
    const roomId = await room(owner, guest, { guest: [guestMember] });
    const blocking = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      await sql.begin(async (tx) => {
        await tx`select id from private.active_session_for_update(${owner.userId})`;
        const done = await blocking.begin(async (btx) => {
          await btx`set local lock_timeout = '2s'`;
          return btx`select (public.safety_block(${guestMember.userId}, ${roomId}, ${owner.sessionId})).guest_phones as n`;
        });
        expect(done).toEqual([{ n: 1 }]);
      });
    } finally {
      await blocking.end();
    }
    await expectConsistent(roomId);
  });

  // A leader removing a member locks both sessions in id order, then the room; the member leaving
  // at the same moment holds its session, then the room. Both finish, the member is out once.
  it('lets a leader remove a member while the member leaves', async () => {
    const [owner, member] = await tables(2);
    for (let i = 0; i < 3; i++) {
      const roomId = await room(owner, null, { owner: [member] });
      const [blocked, left] = await Promise.all([
        block(owner, roomId, member),
        leave(member, roomId),
      ]);
      // Whichever comes second finds the member gone: nothing_to_block or not_in_room.
      expect([200, 409]).toContain(blocked.status);
      expect([200, 403]).toContain(left.status);
      expect([blocked.status, left.status]).toContain(200);
      expect(await roomRow(roomId)).toMatchObject({
        owner_phones: 1,
        owner_session_id: owner.sessionId,
      });
      await expectConsistent(roomId);
      await rooms(owner, { action: 'end' });
      await sql`delete from public.blocks where blocker_id = ${owner.userId}`;
    }
  });
});
