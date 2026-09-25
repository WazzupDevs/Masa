import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { sessionChannel, venueChannel } from '../functions/_shared/pure/rooms.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import {
  checkInAt,
  errorBody,
  onboarded,
  PHONES,
  waitForBroadcast,
  waitUntilBlocked,
} from './helpers.ts';
import { type Client, dbUrl, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

let venue: Record<string, string> = {};
const V = 'at-anchor';

beforeAll(async () => {
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  for (const phone of PHONES) await deleteUserByPhone(phone);
});

afterAll(async () => {
  await deleteFixtureVenues(sql);
  await sql.end();
});

const rooms = (client: Client, body: Record<string, unknown>) => invoke(client, 'rooms', body);

async function createRoom(
  client: Client,
  visibility: 'open' | 'private' = 'open',
  concept: 'tabu' | 'sohbet' = 'tabu',
): Promise<string> {
  const res = await rooms(client, { action: 'create', concept, visibility });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { roomId: string }).roomId;
}

async function lobby(client: Client, key = V) {
  const { data, error } = await client.rpc('venue_lobby', { target_venue_id: venue[key] ?? '' });
  expect(error).toBeNull();
  return data ?? [];
}

async function requestJoin(client: Client, roomId: string) {
  return rooms(client, { action: 'request-join', roomId });
}

async function myRequests(client: Client) {
  const { data, error } = await client.from('my_join_requests').select('*').order('created_at');
  expect(error).toBeNull();
  return data ?? [];
}

async function pendingRequestIds(owner: Client, roomId: string): Promise<string[]> {
  const { data } = await owner
    .from('join_requests')
    .select('id')
    .eq('room_id', roomId)
    .eq('status', 'pending');
  return (data ?? []).map((r) => r.id);
}

async function expireRequestsOf(client: Client): Promise<void> {
  await sql`
    update public.join_requests jr set expires_at = now() - interval '1 second'
    from public.table_sessions ts
    where ts.id = jr.requester_session_id and ts.user_id = ${await userIdOf(client)}
  `;
}

// Three onboarded tables at the same venue.
async function threeTables(): Promise<[Client, Client, Client]> {
  const clients = await Promise.all(PHONES.map((p) => onboarded(p)));
  for (const c of clients) await checkInAt(c, venue, V);
  return clients as [Client, Client, Client];
}

describe('rooms/create and the lobby', () => {
  it('needs an active table and allows one room per table', async () => {
    const client = await onboarded(PHONES[0]);
    expect(await rooms(client, { action: 'create', concept: 'tabu', visibility: 'open' })).toEqual({
      status: 409,
      body: errorBody('no_active_table'),
    });
    await checkInAt(client, venue, V);
    await createRoom(client);
    expect(
      await rooms(client, { action: 'create', concept: 'sohbet', visibility: 'open' }),
    ).toEqual({
      status: 409,
      body: errorBody('already_in_room'),
    });
  });

  it('lists open waiting rooms at the venue with only the safe columns', async () => {
    const [owner, other] = await threeTables();
    const ownerTable =
      await sql`select alias, headcount from public.table_sessions where user_id = ${await userIdOf(owner)} and status = 'active'`;
    const roomId = await createRoom(owner, 'open', 'sohbet');

    const rows = await lobby(other);
    expect(rows).toHaveLength(1);
    // v2: + the "profilli" flag (docs/SPEC_V2.md §5.4); still no account or profile id.
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      ['alias', 'concept', 'headcount', 'profiled', 'room_id', 'waiting_since'].sort(),
    );
    expect(rows[0]).toMatchObject({
      room_id: roomId,
      alias: ownerTable[0]?.alias,
      headcount: ownerTable[0]?.headcount,
      concept: 'sohbet',
      profiled: false,
    });

    // Not the owner's own room, not private rooms, not for tables at another venue.
    expect(await lobby(owner)).toEqual([]);
    const [, , third] = [owner, other, await onboarded(PHONES[2])];
    await checkInAt(third, venue, 'near');
    expect(await lobby(third, V)).toEqual([]);
  });

  it('keeps private rooms out of the lobby', async () => {
    const [owner, other] = await threeTables();
    await createRoom(owner, 'private');
    expect(await lobby(other)).toEqual([]);
  });

  it('broadcasts a data-free lobby_changed on the venue channel', async () => {
    const [owner, other] = await threeTables();
    const listener = waitForBroadcast(other, venueChannel(venue[V] ?? ''), 'lobby_changed');
    await listener.subscribed;
    await createRoom(owner);
    await expect(listener.received).resolves.toBeUndefined();
    await listener.close();
  });
});

describe('join requests', () => {
  it('lets the owner see and accept a request, and puts both tables in the room', async () => {
    const [owner, requester, third] = await threeTables();
    const roomId = await createRoom(owner);

    const [ownerSession] =
      await sql`select id from public.table_sessions where user_id = ${await userIdOf(owner)} and status = 'active'`;
    const ownerListener = waitForBroadcast(owner, sessionChannel(ownerSession?.id), 'join_request');
    await ownerListener.subscribed;

    const res = await requestJoin(requester, roomId);
    expect(res).toEqual({
      status: 200,
      body: { requestId: expect.any(String), expiresAt: expect.any(String) },
    });
    await expect(ownerListener.received).resolves.toBeUndefined();
    await ownerListener.close();

    // The owner sees who asks (alias, headcount); the requester never reads the raw row.
    const { data: incoming } = await owner
      .from('join_requests')
      .select('requester_alias, requester_headcount, status');
    expect(incoming).toEqual([
      { requester_alias: expect.any(String), requester_headcount: 3, status: 'pending' },
    ]);
    expect((await requester.from('join_requests').select('id')).data).toEqual([]);
    expect((await myRequests(requester)).map((r) => r.status)).toEqual(['pending']);

    const [requestId] = await pendingRequestIds(owner, roomId);
    expect(await rooms(owner, { action: 'respond', requestId, accept: true })).toEqual({
      status: 200,
      body: { ok: true },
    });

    expect((await myRequests(requester)).map((r) => r.status)).toEqual(['accepted']);
    const { data: room } = await requester
      .from('rooms')
      .select('status, owner_alias, guest_alias, guest_headcount')
      .eq('id', roomId)
      .single();
    expect(room).toMatchObject({ status: 'active', guest_headcount: 3 });
    expect(room?.guest_alias).toEqual(expect.any(String));
    expect(await lobby(third)).toEqual([]);
  });

  it('makes a decline and a timeout look exactly the same to the requester', async () => {
    const [ownerA, ownerB, requester] = await threeTables();
    const roomA = await createRoom(ownerA);
    const roomB = await createRoom(ownerB);

    // Room A: the owner declines at once.
    const resA = await requestJoin(requester, roomA);
    const [idA] = await pendingRequestIds(ownerA, roomA);
    expect((await rooms(ownerA, { action: 'respond', requestId: idA, accept: false })).status).toBe(
      200,
    );
    const pendingA = await myRequests(requester);
    const lobbyWhilePendingA = (await lobby(requester)).map((r) => r.room_id).sort();
    await expireRequestsOf(requester);
    const unavailableA = await myRequests(requester);

    // Room B: the owner never answers.
    const resB = await requestJoin(requester, roomB);
    const pendingB = (await myRequests(requester)).filter((r) => r.room_id === roomB);
    await expireRequestsOf(requester);
    const unavailableB = (await myRequests(requester)).filter((r) => r.room_id === roomB);

    // Everything but ids and timestamps, which necessarily differ between the two requests.
    const varying = new Set(['id', 'room_id', 'created_at', 'expires_at']);
    const shape = (rows: Record<string, unknown>[]) =>
      rows.map((row) => ({
        keys: Object.keys(row).sort(),
        ...Object.fromEntries(Object.entries(row).filter(([k]) => !varying.has(k))),
      }));

    // Same response, same readable rows before and after expiry.
    expect(Object.keys(resA.body as object).sort()).toEqual(
      Object.keys(resB.body as object).sort(),
    );
    expect(resA.status).toBe(resB.status);
    expect(shape(pendingA)).toEqual(shape(pendingB));
    expect(shape(pendingA)).toEqual([{ keys: expect.any(Array), status: 'pending' }]);
    expect(shape(unavailableA.filter((r) => r.room_id === roomA))).toEqual(shape(unavailableB));
    expect(shape(unavailableB)).toEqual([{ keys: expect.any(Array), status: 'unavailable' }]);

    // A declined room stays in the lobby until expiry, like an unanswered one.
    expect(lobbyWhilePendingA).toEqual([roomA, roomB].sort());

    // Afterwards both rooms are gone for this table, and asking again fails the same way.
    expect(await lobby(requester)).toEqual([]);
    const againA = await requestJoin(requester, roomA);
    const againB = await requestJoin(requester, roomB);
    expect(againA).toEqual({ status: 409, body: errorBody('room_not_available') });
    expect(againA).toEqual(againB);
  });

  it('allows one open request per table, counting a declined one until it expires', async () => {
    const [ownerA, ownerB, requester] = await threeTables();
    const roomA = await createRoom(ownerA);
    const roomB = await createRoom(ownerB);
    await requestJoin(requester, roomA);
    const [idA] = await pendingRequestIds(ownerA, roomA);
    await rooms(ownerA, { action: 'respond', requestId: idA, accept: false });
    expect(await requestJoin(requester, roomB)).toEqual({
      status: 409,
      body: errorBody('request_pending'),
    });
  });

  it('limits a table to 10 requests an hour', async () => {
    const [ownerA, ownerB, requester] = await threeTables();
    const roomA = await createRoom(ownerA);
    const roomB = await createRoom(ownerB);
    const [session] =
      await sql`select id, alias from public.table_sessions where user_id = ${await userIdOf(requester)} and status = 'active'`;
    for (let i = 0; i < 10; i++) {
      await sql`
        insert into public.join_requests (room_id, requester_session_id, requester_alias, requester_headcount, status, created_at, expires_at)
        values (${roomB}, ${session?.id}, ${session?.alias}, 3, 'accepted', now() - interval '10 minutes', now() - interval '9 minutes')
      `;
    }
    expect(await requestJoin(requester, roomA)).toEqual({
      status: 429,
      body: errorBody('rate_limited'),
    });
  });

  it('rejects answers to expired requests and answers from anyone but the owner', async () => {
    const [owner, requester, third] = await threeTables();
    const roomId = await createRoom(owner);
    await requestJoin(requester, roomId);
    const [requestId] = await pendingRequestIds(owner, roomId);

    expect(await rooms(third, { action: 'respond', requestId, accept: true })).toEqual({
      status: 404,
      body: errorBody('request_not_found'),
    });
    await expireRequestsOf(requester);
    expect(await rooms(owner, { action: 'respond', requestId, accept: true })).toEqual({
      status: 409,
      body: errorBody('request_expired'),
    });
  });

  it('keeps a table in one room: a guest cannot create or request another', async () => {
    const [owner, guest, third] = await threeTables();
    const roomId = await createRoom(owner);
    const otherRoom = await createRoom(third);
    await requestJoin(guest, roomId);
    const [requestId] = await pendingRequestIds(owner, roomId);
    await rooms(owner, { action: 'respond', requestId, accept: true });

    expect(await rooms(guest, { action: 'create', concept: 'tabu', visibility: 'open' })).toEqual({
      status: 409,
      body: errorBody('already_in_room'),
    });
    expect(await requestJoin(guest, otherRoom)).toEqual({
      status: 409,
      body: errorBody('already_in_room'),
    });
  });
});

describe('blocks in the lobby', () => {
  it('hides rooms in both directions and refuses requests', async () => {
    const [owner, blocked, third] = await threeTables();
    const ownerRoom = await createRoom(owner);
    const blockedRoom = await createRoom(blocked);
    await sql`
      insert into public.blocks (blocker_id, blocked_id, blocked_alias)
      values (${await userIdOf(owner)}, ${await userIdOf(blocked)}, 'Test Alias')
    `;

    expect((await lobby(blocked)).map((r) => r.room_id)).not.toContain(ownerRoom);
    expect((await lobby(owner)).map((r) => r.room_id)).not.toContain(blockedRoom);
    expect((await lobby(third)).map((r) => r.room_id).sort()).toEqual(
      [ownerRoom, blockedRoom].sort(),
    );
    // Out of its own room, the blocked table still cannot ask to join.
    await rooms(blocked, { action: 'leave' });
    expect(await requestJoin(blocked, ownerRoom)).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
  });
});

describe('leaving', () => {
  async function roomWithGuest() {
    const [owner, guest, third] = await threeTables();
    const roomId = await createRoom(owner);
    await requestJoin(guest, roomId);
    const [requestId] = await pendingRequestIds(owner, roomId);
    await rooms(owner, { action: 'respond', requestId, accept: true });
    return { owner, guest, third, roomId };
  }

  async function roomRow(roomId: string) {
    const [row] =
      await sql`select status, guest_session_id, closed_at from public.rooms where id = ${roomId}`;
    return row;
  }

  it('sends the room back to waiting (and the lobby) when the guest leaves', async () => {
    const { guest, third, roomId } = await roomWithGuest();
    expect(await rooms(guest, { action: 'leave' })).toEqual({ status: 200, body: { ok: true } });
    expect(await roomRow(roomId)).toMatchObject({ status: 'waiting', guest_session_id: null });
    expect((await lobby(third)).map((r) => r.room_id)).toEqual([roomId]);
    expect(await rooms(guest, { action: 'leave' })).toEqual({ status: 200, body: { ok: true } });
  });

  it('closes the room when the owner leaves', async () => {
    const { owner, roomId } = await roomWithGuest();
    await rooms(owner, { action: 'leave' });
    expect((await roomRow(roomId))?.status).toBe('closed');
  });

  it('ending a two-table room opens the reveal window, idempotently', async () => {
    const { owner, roomId } = await roomWithGuest();
    await rooms(owner, { action: 'end' });
    expect((await roomRow(roomId))?.status).toBe('ending');
    await rooms(owner, { action: 'end' });
    expect((await roomRow(roomId))?.status).toBe('ending');
  });

  it('closes a one-table room on end', async () => {
    const [owner] = await threeTables();
    const roomId = await createRoom(owner, 'private');
    await rooms(owner, { action: 'end' });
    const [row] = await sql`select status, reveal_result from public.rooms where id = ${roomId}`;
    expect(row).toMatchObject({ status: 'closed', reveal_result: null });
  });

  it('releases rooms when a table ends', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    await invoke(guest, 'checkin', { action: 'leave' });
    expect(await roomRow(roomId)).toMatchObject({ status: 'waiting', guest_session_id: null });
    await invoke(owner, 'checkin', { action: 'leave' });
    expect((await roomRow(roomId))?.status).toBe('closed');
  });

  it('closes the room of a deleted account', async () => {
    const { owner, roomId } = await roomWithGuest();
    expect((await invoke(owner, 'account', { action: 'delete' })).status).toBe(200);
    const [row] = await sql`select count(*)::int as n from public.rooms where id = ${roomId}`;
    expect(row?.n).toBe(0);
  });
});

describe('locks', () => {
  type Tx = postgres.TransactionSql;
  // Every path that locks a table's session, run inside a transaction that stays open.
  const sessionLockers: [
    string,
    (tx: Tx, userId: string, sessionId: string) => Promise<unknown>,
  ][] = [
    [
      'an action (active_session_for_update)',
      (tx, userId) => tx`select id from private.active_session_for_update(${userId})`,
    ],
    ['leaving (end_table_session)', (tx, userId) => tx`select public.end_table_session(${userId})`],
    [
      'checking in again (start_table_session)',
      (tx, userId) =>
        tx`select public.start_table_session(${userId}, ${venue[V] ?? ''}, 'Kilit Testi',
             2::smallint, 'test', null, 'anonymous')`,
    ],
    [
      'the expiry job (end_expired_table_sessions)',
      async (tx, _userId, sessionId) => {
        await tx`update public.table_sessions set expires_at = now() - interval '1 minute'
                 where id = ${sessionId}`;
        return tx`select private.end_expired_table_sessions()`;
      },
    ],
  ];

  // Both tables ending a Tabu turn at once deadlocked: the owner, holding the room, wrote the next
  // turn whose describer is the guest's session while the guest held that row FOR UPDATE.
  it.each(sessionLockers)(
    "lets rows reference a table's session while %s holds it",
    async (_name, lock) => {
      const client = await onboarded(PHONES[0]);
      const { sessionId } = await checkInAt(client, venue, V);
      const userId = await userIdOf(client);
      const other = postgres(dbUrl, { max: 1, onnotice: () => {} });
      try {
        await sql.begin(async (tx) => {
          await lock(tx, userId, sessionId);
          // What a foreign key check takes on the referenced row.
          const referenced = await other.begin(async (otx) => {
            await otx`set local lock_timeout = '2s'`;
            return otx`select id from public.table_sessions where id = ${sessionId} for key share`;
          });
          expect(referenced).toHaveLength(1);
        });
      } finally {
        await other.end();
      }
    },
  );

  // rooms_respond locked the request and the room, then waited for the requester's session. The
  // requester leaving at that moment held its session and waited for its room: a cycle. Now
  // respond waits for the session before it holds the room.
  it('lets the requester take its room while the owner accepts and waits for its session', async () => {
    const [owner, requester] = (await Promise.all(PHONES.slice(0, 2).map((p) => onboarded(p)))) as [
      Client,
      Client,
    ];
    await checkInAt(owner, venue, V);
    await checkInAt(requester, venue, V);
    const roomId = await createRoom(owner);
    expect((await rooms(requester, { action: 'request-join', roomId })).status).toBe(200);
    const [request] =
      await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
    const [ownerId, requesterId] = await Promise.all([userIdOf(owner), userIdOf(requester)]);

    const leaving = postgres(dbUrl, { max: 1, onnotice: () => {} });
    const accepting = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      let accepted: Promise<unknown> = Promise.resolve();
      await leaving.begin(async (tx) => {
        // The requester's leave holds its session first, as every path does.
        await tx`select id from private.active_session_for_update(${requesterId})`;
        accepted = accepting`
          select (public.rooms_respond(${ownerId}, ${request?.id}, true)).status
        `
          .execute()
          .catch((err: unknown) => err);
        await waitUntilBlocked('rooms_respond');
        // Then it takes its room; respond must not be holding it.
        await tx`set local lock_timeout = '2s'`;
        const room = await tx`select id from public.rooms where id = ${roomId} for update`;
        expect(room).toHaveLength(1);
      });
      expect(await accepted).toEqual([{ status: 'accepted' }]);
    } finally {
      await Promise.all([leaving.end(), accepting.end()]);
    }
  });
});

describe('scheduled jobs', () => {
  it('closes rooms idle for 10 minutes and expires old requests', async () => {
    const [owner, requester] = await threeTables();
    const roomId = await createRoom(owner);
    await requestJoin(requester, roomId);
    await expireRequestsOf(requester);

    await sql`select private.expire_join_requests()`;
    const [jr] = await sql`select status from public.join_requests where room_id = ${roomId}`;
    expect(jr?.status).toBe('expired');

    await sql`update public.rooms set last_activity_at = now() - interval '11 minutes' where id = ${roomId}`;
    await sql`select private.close_idle_rooms()`;
    const [room] = await sql`select status from public.rooms where id = ${roomId}`;
    expect(room?.status).toBe('closed');

    const jobs =
      await sql`select jobname from cron.job where jobname in ('close-idle-rooms', 'expire-join-requests') order by jobname`;
    expect(jobs.map((j) => j.jobname)).toEqual(['close-idle-rooms', 'expire-join-requests']);
  });

  it('skips a room or request a user action holds instead of waiting for it', async () => {
    const [owner, requester] = await threeTables();
    const roomId = await createRoom(owner);
    await requestJoin(requester, roomId);
    await expireRequestsOf(requester);
    await sql`update public.rooms set last_activity_at = now() - interval '11 minutes' where id = ${roomId}`;

    const job = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      await sql.begin(async (tx) => {
        await tx`select id from public.rooms where id = ${roomId} for update`;
        await tx`select id from public.join_requests where room_id = ${roomId} for update`;
        const [ran] = await job.begin(async (jtx) => {
          await jtx`set local lock_timeout = '2s'`;
          return jtx`
            select private.close_idle_rooms() as rooms, private.expire_join_requests() as requests
          `;
        });
        expect(ran).toEqual({ rooms: 0, requests: 0 });
      });
    } finally {
      await job.end();
    }
    // The next run takes them.
    const [next] = await sql`
      select private.close_idle_rooms() as rooms, private.expire_join_requests() as requests
    `;
    expect(next).toEqual({ rooms: 1, requests: 1 });
  });
});

describe('push tokens and closed helpers', () => {
  it('stores a valid Expo token, rejects others and clears on null', async () => {
    const client = await onboarded(PHONES[0]);
    const id = await userIdOf(client);
    const token = 'ExponentPushToken[integration-test]';
    expect((await invoke(client, 'account', { action: 'register-push', token })).status).toBe(200);
    expect(
      (await sql`select push_token from public.profiles where id = ${id}`)[0]?.push_token,
    ).toBe(token);
    expect(
      (await invoke(client, 'account', { action: 'register-push', token: 'nope' })).status,
    ).toBe(400);
    await invoke(client, 'account', { action: 'register-push', token: null });
    expect(
      (await sql`select push_token from public.profiles where id = ${id}`)[0]?.push_token,
    ).toBeNull();
  });

  it('keeps room state changes server-side only', async () => {
    const client = await onboarded(PHONES[0]);
    const id = await userIdOf(client);
    for (const [fn, args] of [
      ['rooms_create', { target_user_id: id, new_concept: 'tabu', new_visibility: 'open' }],
      ['rooms_leave', { target_user_id: id }],
      ['rooms_end', { target_user_id: id, decision_seconds: 60 }],
    ] as const) {
      const { error } = await client.rpc(fn, args as never);
      expect(error?.code, fn).toBe('42501');
    }
  });
});
