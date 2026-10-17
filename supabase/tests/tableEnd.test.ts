// Faz 3 step 23.3, server (docs/SPEC_V3.md §23.G, §23.M): the table's end without the "Tanışalım
// mı?" window. Every road that opened the window closes a two-sided room at once and writes its pairs
// (available at once, friend_open); inactivity leaves a two-sided room alone and closes a one-sided
// room after 30 minutes; "Arkadaş ekle" works on a friend_open record from the table's end and from
// the play history alike.
//
// The switch (private.table_end_on()) was on from step 23.3's client PR (23.3b); step 23.4a took out
// the window's tests and their switching (§23.M), and 23.4b's migration the switch, the window's
// functions and its data (the last describe here).
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { sessionChannel } from '../functions/_shared/pure/rooms.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { waitUntilBlocked } from './helpers.ts';
import { anonKey, apiUrl, dbUrl, deleteUserByPhone, invoke, sql } from './local.ts';
import {
  createRoom,
  leave,
  type Phone,
  roomRow,
  rooms,
  table as checkIn,
  TEAM_PHONES,
  teamRoom,
} from './teamRoom.ts';

// Step 23.3's idle minutes for a one-sided room (§23.G; the cron's argument from step 23.3's
// client PR on).
const TABLE_IDLE_MINUTES = 30;
const OK = { status: 200, body: { ok: true } };

let venue: Record<string, string> = {};

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

const table = (n: number) => checkIn(venue, n);

type TupleOf<T, N extends number, R extends T[] = []> = R['length'] extends N
  ? R
  : TupleOf<T, N, [T, ...R]>;

async function tables<N extends number>(count: N): Promise<TupleOf<Phone, N>> {
  return (await Promise.all(Array.from({ length: count }, (_, i) => table(i)))) as TupleOf<
    Phone,
    N
  >;
}

// Every phone now in the room has been in it for `minutes` (the 3-minute rule of play history).
async function backdate(roomId: string, minutes = 10) {
  await sql`
    update public.room_members
    set joined_at = joined_at - make_interval(mins => ${minutes})
    where room_id = ${roomId} and left_at is null
  `;
  await sql`
    update public.rooms set guest_joined_at = guest_joined_at - make_interval(mins => ${minutes})
    where id = ${roomId} and guest_joined_at is not null
  `;
}

async function idleFor(roomId: string, minutes: number) {
  await sql`
    update public.rooms set last_activity_at = now() - make_interval(mins => ${minutes})
    where id = ${roomId}
  `;
}

const closeIdle = () => sql`select private.close_idle_rooms(${TABLE_IDLE_MINUTES})`;

type HistoryRow = {
  id: string;
  user_id: string;
  other_user_id: string;
  friend_open: boolean;
  reveal_mutual: boolean;
  available: boolean;
};

async function historyOf(roomId: string): Promise<HistoryRow[]> {
  return (await sql`
    select id, user_id, other_user_id, friend_open, reveal_mutual, available_at <= now() as available
    from public.play_history where room_id = ${roomId}
    order by user_id, other_user_id
  `) as unknown as HistoryRow[];
}

const pairsOf = (rows: HistoryRow[]) => rows.map((r) => `${r.user_id}>${r.other_user_id}`).sort();

const pair = (a: Phone, b: Phone) => [`${a.userId}>${b.userId}`, `${b.userId}>${a.userId}`];

async function expectClosed(roomId: string) {
  const row = await roomRow(roomId);
  expect(row.status).toBe('closed');
  expect(row.closed_at).not.toBeNull();
  expect(
    await sql`select 1 from public.room_members where room_id = ${roomId} and left_at is null`,
  ).toHaveLength(0);
}

// The broadcasts a phone's session: channel receives, by event.
async function sessionEvents(p: Phone) {
  const events: string[] = [];
  const channel = p.client.channel(sessionChannel(p.sessionId), { config: { private: true } });
  await new Promise<void>((resolve, reject) => {
    channel
      .on('broadcast', { event: '*' }, (msg: { event: string }) => events.push(msg.event))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve();
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
      });
  });
  return { events, close: async () => void (await p.client.removeChannel(channel)) };
}

describe('every road closes a two-sided room at once (§23.G)', { timeout: 90_000 }, () => {
  type Road = 'end' | 'leave' | 'block' | 'venue' | 'expiry';
  const roads: Road[] = ['end', 'leave', 'block', 'venue', 'expiry'];

  // The guest's side is one phone: its leaving is the side's last phone leaving.
  async function take(road: Road, owner: Phone, guest: Phone, roomId: string) {
    if (road === 'end') return rooms(owner, { action: 'end' });
    if (road === 'leave') return leave(guest, roomId);
    if (road === 'block') {
      return invoke(guest.client, 'safety', {
        action: 'block',
        roomId,
        sessionId: owner.sessionId,
      });
    }
    if (road === 'venue') return invoke(guest.client, 'checkin', { action: 'leave' });
    await sql`
      update public.table_sessions set expires_at = now() - interval '1 minute'
      where id = ${guest.sessionId}
    `;
    await sql`select private.end_expired_table_sessions()`;
    return OK;
  }

  for (const road of roads) {
    it(`closes on ${road}, writing the pair's records open to "Arkadaş ekle"`, async () => {
      const [owner, guest] = await tables(2);
      const roomId = await teamRoom(owner, guest);
      await backdate(roomId);

      expect((await take(road, owner, guest, roomId)).status).toBe(200);
      await expectClosed(roomId);

      const history = await historyOf(roomId);
      expect(pairsOf(history)).toEqual(pair(owner, guest).sort());
      for (const row of history) {
        expect(row).toMatchObject({ friend_open: true, reveal_mutual: false, available: true });
      }
      // The owner reads its record at once (RLS: available_at <= now()).
      const { data } = await owner.client
        .from('play_history')
        .select('friend_open')
        .eq('room_id', roomId);
      expect(data).toEqual([{ friend_open: true }]);
    });
  }

  it('writes every pair across the sides once and none within a side', async () => {
    const [owner, guest, ownerMember, guestMember] = await tables(4);
    const roomId = await teamRoom(owner, guest, { owner: [ownerMember], guest: [guestMember] });
    await backdate(roomId);

    // A member who leaves first writes its own pairs then; the close does not write them again.
    expect(await leave(guestMember, roomId)).toEqual(OK);
    const early = await historyOf(roomId);
    expect(pairsOf(early)).toEqual(
      [...pair(owner, guestMember), ...pair(ownerMember, guestMember)].sort(),
    );
    expect(early.every((r) => r.friend_open && r.available)).toBe(true);

    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    await expectClosed(roomId);
    const history = await historyOf(roomId);
    expect(pairsOf(history)).toEqual(
      [
        ...pair(owner, guest),
        ...pair(owner, guestMember),
        ...pair(ownerMember, guest),
        ...pair(ownerMember, guestMember),
      ].sort(),
    );
    expect(history.every((r) => r.friend_open && r.available)).toBe(true);
    expect(new Set(history.map((r) => r.id)).size).toBe(8);
  });

  it("writes the side's last phone's pairs when its leaving closes the room", async () => {
    const [owner, guest, ownerMember] = await tables(3);
    const roomId = await teamRoom(owner, guest, { owner: [ownerMember] });
    await backdate(roomId);

    expect(await leave(guest, roomId)).toEqual(OK);
    await expectClosed(roomId);
    expect(pairsOf(await historyOf(roomId))).toEqual(
      [...pair(owner, guest), ...pair(ownerMember, guest)].sort(),
    );
  });

  it('writes nothing for a pair together for less than 3 minutes', async () => {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);

    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    await expectClosed(roomId);
    expect(await historyOf(roomId)).toEqual([]);
  });

  it('opens no window afterwards: no reveal_match is sent', async () => {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);
    await backdate(roomId);
    const heard = await sessionEvents(owner);

    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    expect(heard.events).not.toContain('reveal_match');
    await heard.close();
    await expectClosed(roomId);
  });
});

describe('inactivity (§23.G, §23.P-1)', { timeout: 60_000 }, () => {
  it('leaves a two-sided room alone however long it is quiet', async () => {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);
    await idleFor(roomId, 240);

    await closeIdle();
    expect((await roomRow(roomId)).status).toBe('active');
  });

  it('closes a table waiting in the lobby after 30 minutes, not before; its requests end unavailable', async () => {
    const [waiting, asker] = await tables(2);
    const roomId = await createRoom(waiting);
    expect((await rooms(asker, { action: 'request-join', roomId, profiled: false })).status).toBe(
      200,
    );
    const [request] = await sql`
      select id from public.join_requests where room_id = ${roomId} and status = 'pending'
    `;

    await idleFor(roomId, TABLE_IDLE_MINUTES - 1);
    await closeIdle();
    expect((await roomRow(roomId)).status).toBe('waiting');

    await idleFor(roomId, TABLE_IDLE_MINUTES + 1);
    await closeIdle();
    expect((await roomRow(roomId)).status).toBe('closed');

    await sql`
      update public.join_requests set expires_at = now() - interval '1 second'
      where id = ${request?.id}
    `;
    const { data } = await asker.client
      .from('my_join_requests')
      .select('status')
      .eq('id', request?.id ?? '');
    expect(data).toEqual([{ status: 'unavailable' }]);
  });

  it('closes a "Masanla oyna" room after 30 minutes, not before', async () => {
    const [solo] = await tables(1);
    const created = await rooms(solo, { action: 'create-solo' });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    const roomId = (created.body as { roomId: string }).roomId;

    await idleFor(roomId, TABLE_IDLE_MINUTES - 1);
    await closeIdle();
    expect((await roomRow(roomId)).status).not.toBe('closed');

    await idleFor(roomId, TABLE_IDLE_MINUTES + 1);
    await closeIdle();
    expect((await roomRow(roomId)).status).toBe('closed');
  });
});

describe('"Arkadaş ekle" on a friend_open record (§23.G)', { timeout: 60_000 }, () => {
  const historyId = async (p: Phone, other: Phone, roomId: string) => {
    const [row] = await sql`
      select id from public.play_history
      where room_id = ${roomId} and user_id = ${p.userId} and other_user_id = ${other.userId}
    `;
    if (!row) throw new Error('no history');
    return row.id as string;
  };
  const addFromRoom = async (p: Phone, other: Phone, roomId: string) =>
    invoke(p.client, 'friends', {
      action: 'add-from-room',
      historyId: await historyId(p, other, roomId),
    });
  const friendsOf = async (a: Phone, b: Phone) =>
    sql`
      select 1 from public.friendships
      where (user_a = ${a.userId} and user_b = ${b.userId})
         or (user_a = ${b.userId} and user_b = ${a.userId})
    `;

  // An owner and a member on one side, a guest on the other, together for 10 minutes; ended.
  async function endedTable() {
    const [owner, guest, ownerMember] = await tables(3);
    const roomId = await teamRoom(owner, guest, { owner: [ownerMember] });
    await backdate(roomId);
    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    return { owner, guest, ownerMember, roomId };
  }

  it('makes the pair friends when both press, and nothing the other sees when one does', async () => {
    const { owner, guest, ownerMember, roomId } = await endedTable();

    expect((await addFromRoom(owner, guest, roomId)).status).toBe(200);
    expect(await friendsOf(owner, guest)).toHaveLength(0);
    const second = await addFromRoom(guest, owner, roomId);
    expect(second.status).toBe(200);
    expect(await friendsOf(owner, guest)).toHaveLength(1);

    // One press: no friendship, no request, and the guest's own record with the member untouched.
    expect((await addFromRoom(ownerMember, guest, roomId)).status).toBe(200);
    expect(await friendsOf(ownerMember, guest)).toHaveLength(0);
    expect(
      await sql`select 1 from public.friend_requests where from_user_id = ${ownerMember.userId}`,
    ).toHaveLength(0);
    const [guestRow] = await sql`
      select friend_action_at from public.play_history
      where id = ${await historyId(guest, ownerMember, roomId)}
    `;
    expect(guestRow?.friend_action_at).toBeNull();
  });

  // The table's end and the play history send the same call; there is no time limit, so a press
  // days later from the history meets a press made at the table's end.
  it('makes them friends when one presses at the end and the other days later from the history', async () => {
    const { owner, guest, roomId } = await endedTable();
    expect((await addFromRoom(owner, guest, roomId)).status).toBe(200);
    await sql`
      update public.play_history
      set played_at = played_at - interval '5 days', available_at = available_at - interval '5 days'
      where room_id = ${roomId}
    `;
    expect((await addFromRoom(guest, owner, roomId)).status).toBe(200);
    expect(await friendsOf(owner, guest)).toHaveLength(1);
  });

  it('opens nothing on an older record without a mutual "Evet"', async () => {
    const { owner, guest, roomId } = await endedTable();
    await sql`update public.play_history set friend_open = false where room_id = ${roomId}`;

    expect((await addFromRoom(owner, guest, roomId)).status).toBe(200);
    expect((await addFromRoom(guest, owner, roomId)).status).toBe(200);
    expect(await friendsOf(owner, guest)).toHaveLength(0);
    expect(await sql`select 1 from public.mutual_friend_intents`).toHaveLength(0);
  });
});

// "Arkadaş oldunuz · Mesajlaş" on the table's end and in the play history (step 23.3's client,
// public.my_history_friends): the caller's records whose pair became friends at that encounter. Both
// pressed "Arkadaş ekle" on it, they are friends now and nothing blocks them; friends alone would tie
// an anonymous table to a friend (rule 4).
describe('my_history_friends (§23.G, rules 4 and 5)', { timeout: 60_000 }, () => {
  const historyId = async (p: Phone, other: Phone, roomId: string) => {
    const [row] = await sql`
      select id from public.play_history
      where room_id = ${roomId} and user_id = ${p.userId} and other_user_id = ${other.userId}
    `;
    if (!row) throw new Error('no history');
    return row.id as string;
  };
  const press = async (p: Phone, other: Phone, roomId: string) =>
    invoke(p.client, 'friends', {
      action: 'add-from-room',
      historyId: await historyId(p, other, roomId),
    });
  const friendsRead = async (p: Phone) => {
    const { data, error } = await p.client.rpc('my_history_friends');
    expect(error).toBeNull();
    return data ?? [];
  };
  const publicIdOf = async (p: Phone) =>
    ((await sql`select public_id from public.profiles where id = ${p.userId}`)[0]?.public_id ??
      '') as string;
  const friendsOf = async (a: Phone, b: Phone) =>
    sql`
      select 1 from public.friendships
      where (user_a = ${a.userId} and user_b = ${b.userId})
         or (user_a = ${b.userId} and user_b = ${a.userId})
    `;
  // A two-table room that ran 3 minutes and ended, both pressing "Arkadaş ekle": friends.
  async function friendsAtTable() {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);
    await backdate(roomId);
    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    expect((await press(owner, guest, roomId)).status).toBe(200);
    expect((await press(guest, owner, roomId)).status).toBe(200);
    expect(await friendsOf(owner, guest)).toHaveLength(1);
    return { owner, guest, roomId };
  }

  it('lists the record to each side once both pressed, and only to that pair', async () => {
    const [owner, guest, ownerMember] = await tables(3);
    const roomId = await teamRoom(owner, guest, { owner: [ownerMember] });
    await backdate(roomId);
    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    expect((await press(owner, guest, roomId)).status).toBe(200);
    expect((await press(guest, owner, roomId)).status).toBe(200);

    expect(await friendsRead(owner)).toEqual([
      { history_id: await historyId(owner, guest, roomId), public_id: await publicIdOf(guest) },
    ]);
    expect(await friendsRead(guest)).toEqual([
      { history_id: await historyId(guest, owner, roomId), public_id: await publicIdOf(owner) },
    ]);
    expect(await friendsRead(ownerMember)).toEqual([]);
  });

  it('lists nothing to either side after one press (rule 5)', async () => {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);
    await backdate(roomId);
    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    expect((await press(owner, guest, roomId)).status).toBe(200);
    expect(await friendsRead(owner)).toEqual([]);
    expect(await friendsRead(guest)).toEqual([]);
  });

  it('never ties an anonymous table to a friend from before it, even when both press (rule 4)', async () => {
    const [owner, guest] = await tables(2);
    await sql`select private.make_friends(${owner.userId}::uuid, ${guest.userId}::uuid, 'request')`;
    const roomId = await teamRoom(owner, guest);
    await backdate(roomId);
    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    expect((await press(owner, guest, roomId)).status).toBe(200);
    expect((await press(guest, owner, roomId)).status).toBe(200);
    expect(await friendsOf(owner, guest)).toHaveLength(1);
    expect(await friendsRead(owner)).toEqual([]);
    expect(await friendsRead(guest)).toEqual([]);
  });

  it('lists nothing once one blocks the other', async () => {
    const { owner, guest } = await friendsAtTable();
    expect(
      (await invoke(owner.client, 'safety', { action: 'block', publicId: await publicIdOf(guest) }))
        .status,
    ).toBe(200);
    expect(await friendsRead(owner)).toEqual([]);
    expect(await friendsRead(guest)).toEqual([]);
  });

  it('lists nothing once the friendship ends', async () => {
    const { owner, guest } = await friendsAtTable();
    expect(
      (
        await invoke(owner.client, 'friends', {
          action: 'remove',
          publicId: await publicIdOf(guest),
        })
      ).status,
    ).toBe(200);
    expect(await friendsRead(owner)).toEqual([]);
    expect(await friendsRead(guest)).toEqual([]);
  });

  it('is closed to callers without an account', async () => {
    const res = await fetch(`${apiUrl}/rest/v1/rpc/my_history_friends`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.ok).toBe(false);
  });
});

// Rule 10: the table's end holds the room, then room_members (the close's trigger), then
// play_history; "Arkadaş ekle" holds play_history, then the pair. Two calls that meet run on their
// own connections while a third holds what both need; once both wait, it lets go, and both finish:
// no deadlock, one close, one record per pair, one friendship.
describe('locks (rule 10)', { timeout: 60_000 }, () => {
  type Outcome = { ok: unknown } | { err: string };

  async function atOnce(
    hold: (tx: postgres.TransactionSql) => Promise<unknown>,
    waitingIn: string[],
    calls: ((db: postgres.Sql) => Promise<unknown>)[],
  ): Promise<Outcome[]> {
    const holder = postgres(dbUrl, { max: 1, onnotice: () => {} });
    const dbs = calls.map(() => postgres(dbUrl, { max: 1, onnotice: () => {} }));
    try {
      let running: Promise<Outcome>[] = [];
      await holder.begin(async (tx) => {
        await hold(tx);
        running = calls.map((call, i) =>
          call(dbs[i] ?? holder).then(
            (ok): Outcome => ({ ok }),
            (err: unknown): Outcome => ({ err: err instanceof Error ? err.message : String(err) }),
          ),
        );
        for (const fn of new Set(waitingIn)) {
          await waitUntilBlocked(fn, waitingIn.filter((f) => f === fn).length);
        }
      });
      return await Promise.all(running);
    } finally {
      await Promise.all([holder.end(), ...dbs.map((db) => db.end())]);
    }
  }

  const holdRoom = (roomId: string) => (tx: postgres.TransactionSql) =>
    tx`select id from public.rooms where id = ${roomId} for update`;
  const leaving = (p: Phone, roomId: string) => async (db: postgres.Sql) =>
    (await db`select (public.rooms_leave(${p.userId}, ${roomId})).status`)[0]?.status;
  const ending = (p: Phone) => async (db: postgres.Sql) =>
    (await db`select (public.rooms_end(${p.userId})).status`)[0]?.status;

  it("closes once when both sides' last phones leave at once", async () => {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);
    await backdate(roomId);

    const outcomes = await atOnce(
      holdRoom(roomId),
      ['rooms_leave', 'rooms_leave'],
      [leaving(owner, roomId), leaving(guest, roomId)],
    );
    // One closes the table; the other then finds itself already out of it.
    expect(outcomes).toContainEqual({ ok: 'closed' });
    expect(outcomes).toContainEqual({ err: 'not_in_room' });
    await expectClosed(roomId);
    expect(pairsOf(await historyOf(roomId))).toEqual(pair(owner, guest).sort());
  });

  it("closes once when the leader ends the table while the other side's last phone leaves", async () => {
    const [owner, guest, ownerMember] = await tables(3);
    const roomId = await teamRoom(owner, guest, { owner: [ownerMember] });
    await backdate(roomId);

    const [ended, left] = await atOnce(
      holdRoom(roomId),
      ['rooms_end', 'rooms_leave'],
      [ending(owner), leaving(guest, roomId)],
    );
    // "Masayı bitir" finds the table closed if the leave came first; the leave finds itself out
    // of it if the end came first.
    expect(ended).toEqual({ ok: 'closed' });
    expect([{ ok: 'closed' }, { err: 'not_in_room' }]).toContainEqual(left);
    await expectClosed(roomId);
    expect(pairsOf(await historyOf(roomId))).toEqual(
      [...pair(owner, guest), ...pair(ownerMember, guest)].sort(),
    );
  });

  it('makes one friendship when both phones press "Arkadaş ekle" at once', async () => {
    const [owner, guest] = await tables(2);
    const roomId = await teamRoom(owner, guest);
    await backdate(roomId);
    expect(await rooms(owner, { action: 'end' })).toEqual(OK);
    const history = await historyOf(roomId);
    const pressing = (p: Phone) => async (db: postgres.Sql) => {
      const own = history.find((r) => r.user_id === p.userId);
      return (
        await db`select outcome from public.friends_add_from_room(${p.userId}, ${own?.id ?? ''})`
      )[0]?.outcome;
    };

    const outcomes = await atOnce(
      (tx) => tx`select private.lock_pair(${owner.userId}, ${guest.userId})`,
      ['friends_add_from_room', 'friends_add_from_room'],
      [pressing(owner), pressing(guest)],
    );
    expect(outcomes).toContainEqual({ ok: 'friendship_created' });
    expect(outcomes).toContainEqual({ ok: 'ok' });
    expect(
      await sql`
        select 1 from public.friendships
        where (user_a = ${owner.userId} and user_b = ${guest.userId})
           or (user_a = ${guest.userId} and user_b = ${owner.userId})
      `,
    ).toHaveLength(1);
  });
});

// Step 23.4b (docs/SPEC_V3.md §23.H, §23.I): the window's functions, tables, columns, job and
// status are gone from the database, item by item as in its migration; what the play history still
// reads of old windows stays.
describe('step 23.4b: the window is gone from the database', () => {
  it('has none of its tables, columns, functions or job, and no ending status', async () => {
    expect(
      await sql`select to_regclass('public.reveal_decisions') as d, to_regclass('public.reveal_signals') as s`,
    ).toEqual([{ d: null, s: null }]);
    expect(
      await sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'rooms' and column_name like 'reveal%'
      `,
    ).toEqual([]);
    const gone = [
      'table_end_on',
      'start_reveal',
      'finish_reveal',
      'close_expired_reveals',
      'reveal_participants',
      'reveal_colors',
      'reveal_emojis',
      'reveal_decision_seconds',
      'lobby_listed_from',
      'room_listed_from',
      'rooms_lobby_held',
      'reveal_decide',
      'reveal_finalize',
      'reveal_matches',
    ];
    expect(
      await sql`
        select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.proname = any(${gone})
      `,
    ).toEqual([]);
    expect(await sql`select jobname from cron.job where jobname = 'close-expired-reveals'`).toEqual(
      [],
    );
    const [table] = await tables(1);
    const roomId = await teamRoom(table, null);
    await expect(
      sql`update public.rooms set status = 'ending' where id = ${roomId}`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('keeps reveal_mutual on the play history for records written by a window', async () => {
    expect(
      await sql`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'play_history'
          and column_name = 'reveal_mutual'
      `,
    ).toEqual([{ column_name: 'reveal_mutual' }]);
  });
});
