import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { REVEAL, REVEAL_COLORS, REVEAL_EMOJIS } from '../functions/_shared/pure/reveal.ts';
import { BROADCAST, venueChannel } from '../functions/_shared/pure/rooms.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql } from './local.ts';

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

const decide = (client: Client, roomId: string, wantsMeet: boolean) =>
  invoke(client, 'reveal', { action: 'decide', roomId, wantsMeet });
const finalize = (client: Client, roomId: string) =>
  invoke(client, 'reveal', { action: 'finalize', roomId });

// A two-table room, running.
async function activeRoom() {
  const [owner, guest, third] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  for (const c of [owner, guest, third]) await checkInAt(c, venue, V);
  const created = await invoke(owner, 'rooms', { action: 'create', profiled: false });
  const roomId = (created.body as { roomId: string }).roomId;
  await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false });
  const [request] =
    await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
  await invoke(owner, 'rooms', { action: 'respond', requestId: request?.id, accept: true });
  return { owner, guest, third, roomId };
}

// A two-table room whose owner pressed "Odayı bitir".
async function endingRoom() {
  const room = await activeRoom();
  expect((await invoke(room.owner, 'rooms', { action: 'end' })).status).toBe(200);
  return room;
}

// What each table sees of the room's result.
async function seenBy(client: Client, roomId: string) {
  const { data } = await client
    .from('rooms')
    .select('status, reveal_result, reveal_token, reveal_ends_at')
    .eq('id', roomId)
    .single();
  return data;
}

async function expireWindow(roomId: string, by = '1 second') {
  await sql`update public.rooms set reveal_ends_at = now() - ${by}::interval where id = ${roomId}`;
}

describe('reveal window', () => {
  it('opens for 30 seconds when a two-table room ends', async () => {
    const { owner, roomId } = await endingRoom();
    const [row] = await sql`
      select status, extract(epoch from reveal_ends_at - now()) as left_s from public.rooms where id = ${roomId}
    `;
    expect(row?.status).toBe('ending');
    expect(Number(row?.left_s)).toBeGreaterThan(25);
    expect(Number(row?.left_s)).toBeLessThanOrEqual(30);
    expect((await seenBy(owner, roomId))?.reveal_result).toBeNull();
  });
});

describe('reveal/decide', () => {
  it('shows the same color and emoji to both tables only on a mutual yes', async () => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, true);
    expect((await seenBy(owner, roomId))?.status).toBe('ending');
    expect(await decide(guest, roomId, true)).toEqual({ status: 200, body: { ok: true } });

    const a = await seenBy(owner, roomId);
    const b = await seenBy(guest, roomId);
    expect(a).toEqual(b);
    expect(a).toMatchObject({ status: 'closed', reveal_result: 'mutual' });
    const token = a?.reveal_token as { color: string; emoji: string };
    expect(REVEAL_COLORS).toContain(token.color);
    expect(REVEAL_EMOJIS).toContain(token.emoji);
  });

  it.each([
    [true, false],
    [false, true],
    [false, false],
  ])(
    'keeps the room ending until the window ends, then shows both the same "none" for owner=%s guest=%s',
    async (ownerSays, guestSays) => {
      const { owner, guest, roomId } = await endingRoom();
      await decide(owner, roomId, ownerSays);
      await decide(guest, roomId, guestSays);
      expect(await seenBy(owner, roomId)).toMatchObject({ status: 'ending', reveal_result: null });

      await expireWindow(roomId);
      await finalize(owner, roomId);
      const a = await seenBy(owner, roomId);
      expect(a).toMatchObject({ status: 'closed', reveal_result: 'none', reveal_token: null });
      expect(await seenBy(guest, roomId)).toEqual(a);
    },
  );

  it('lets each table read only its own answer', async () => {
    const { owner, guest, third, roomId } = await endingRoom();
    await decide(owner, roomId, false);
    await decide(guest, roomId, true);
    expect((await owner.from('reveal_decisions').select('wants_meet')).data).toEqual([
      { wants_meet: false },
    ]);
    expect((await guest.from('reveal_decisions').select('wants_meet')).data).toEqual([
      { wants_meet: true },
    ]);
    expect((await third.from('reveal_decisions').select('wants_meet')).data).toEqual([]);
  });

  it('keeps the first answer', async () => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, true);
    await decide(owner, roomId, false);
    await decide(guest, roomId, true);
    expect((await seenBy(owner, roomId))?.reveal_result).toBe('mutual');
  });

  it('refuses answers after the window and from other tables', async () => {
    const { owner, guest, third, roomId } = await endingRoom();
    expect(await decide(third, roomId, true)).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
    await expireWindow(roomId);
    expect(await decide(guest, roomId, true)).toEqual({
      status: 409,
      body: errorBody('reveal_closed'),
    });
    void owner;
  });
});

// MVP_SPEC §4.6: a table that said yes must not tell "no" from "no answer", by rows or by timing.
describe('reveal timing', () => {
  // Everything the owner (who said yes) can observe while the guest says no, leaves, or does
  // nothing.
  async function yesSideTrace(guestDoes: 'no' | 'leave' | 'block' | 'nothing') {
    const { owner, guest, roomId } = await endingRoom();
    const ownRow = () => owner.from('rooms').select('*').eq('id', roomId).single();
    const ownDecisions = async () =>
      (await owner.from('reveal_decisions').select('room_id, wants_meet')).data;

    const decided = await decide(owner, roomId, true);
    const before = (await ownRow()).data;
    const guestReply =
      guestDoes === 'no'
        ? await decide(guest, roomId, false)
        : guestDoes === 'leave'
          ? await invoke(guest, 'checkin', { action: 'leave' })
          : guestDoes === 'block'
            ? await invoke(guest, 'safety', { action: 'block', roomId })
            : null;
    const after = (await ownRow()).data;
    const early = await finalize(owner, roomId);
    const afterEarlyFinalize = (await ownRow()).data;
    const decisionsDuring = await ownDecisions();

    await expireWindow(roomId);
    const [{ ends_at: endsAt } = {}] =
      await sql`select reveal_ends_at as ends_at from public.rooms where id = ${roomId}`;
    const late = await finalize(owner, roomId);
    const [closed] = await sql`select closed_at from public.rooms where id = ${roomId}`;
    const final = await seenBy(owner, roomId);

    for (const phone of PHONES) await deleteUserByPhone(phone);
    return {
      trace: {
        decided,
        rowUnchangedByOtherTable: JSON.stringify(after) === JSON.stringify(before),
        rowUnchangedByEarlyFinalize: JSON.stringify(afterEarlyFinalize) === JSON.stringify(before),
        statusDuringWindow: before?.status,
        resultDuringWindow: before?.reveal_result,
        early,
        decisionsDuring: decisionsDuring?.map((d) => d.wants_meet),
        late,
        final: { status: final?.status, result: final?.reveal_result, token: final?.reveal_token },
        closedAtWindowEnd: (closed?.closed_at as Date) >= (endsAt as Date),
      },
      guestReply,
    };
  }

  it('shows the yes table the same rows and timing for "no", "left", "blocked" and "no answer"', async () => {
    const withNo = await yesSideTrace('no');
    const left = await yesSideTrace('leave');
    const blocked = await yesSideTrace('block');
    const noAnswer = await yesSideTrace('nothing');

    expect(withNo.guestReply).toEqual({ status: 200, body: { ok: true } });
    expect(left.guestReply?.status).toBe(200);
    expect(blocked.guestReply).toEqual({ status: 200, body: { ok: true } });
    expect(withNo.trace).toEqual(noAnswer.trace);
    expect(left.trace).toEqual(noAnswer.trace);
    expect(blocked.trace).toEqual(noAnswer.trace);
    expect(withNo.trace).toMatchObject({
      rowUnchangedByOtherTable: true,
      rowUnchangedByEarlyFinalize: true,
      statusDuringWindow: 'ending',
      resultDuringWindow: null,
      decisionsDuring: [true],
      final: { status: 'closed', result: 'none', token: null },
      closedAtWindowEnd: true,
    });
  });

  it('lets the table that said no go on at once while the room stays ending', async () => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, true);
    await decide(guest, roomId, false);

    const created = await invoke(guest, 'rooms', { action: 'create', profiled: false });
    expect(created.status).toBe(200);
    expect(await seenBy(owner, roomId)).toMatchObject({ status: 'ending', reveal_result: null });

    // The owner, still in the window, is not in an open room either.
    const { data: open } = await owner
      .from('rooms')
      .select('id')
      .in('status', ['waiting', 'active']);
    expect(open).toEqual([]);
  });
});

// MVP_SPEC §4.6: the table that said no may open a new room at once, but it stays out of the lobby
// (and off the venue channel) until reveal_ends_at.
describe('lobby hold during the reveal window', { timeout: 60_000 }, () => {
  type Lobby = { room_id: string; waiting_since: string }[];
  const lobbyOf = async (client: Client) =>
    ((await client.rpc('venue_lobby', { target_venue_id: venue[V] ?? '' })).data ?? []) as Lobby;

  // What the owner (who said yes) sees of the venue while the guest says no and opens a room, or
  // does nothing. A third table's open room is there in both cases.
  async function yesSideLobby(guestDoes: 'no' | 'nothing') {
    const { owner, guest, third, roomId } = await endingRoom();
    const thirdRoom = await invoke(third, 'rooms', { action: 'create', profiled: false });
    const thirdRoomId = (thirdRoom.body as { roomId: string }).roomId;
    await decide(owner, roomId, true);

    // Venue broadcasts the owner hears from now on.
    const events: string[] = [];
    const channel = owner.channel(venueChannel(venue[V] ?? ''), { config: { private: true } });
    await new Promise<void>((resolve) => {
      channel
        .on('broadcast', { event: '*' }, (msg: { event: string }) => events.push(msg.event))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
        });
    });

    let guestRoomId: string | null = null;
    if (guestDoes === 'no') {
      await decide(guest, roomId, false);
      const create = (visibility: 'open' | 'private') =>
        invoke(
          guest,
          'rooms',
          visibility === 'open' ? { action: 'create', profiled: false } : { action: 'create-solo' },
        );
      // Open, then closed again, then private: none of it may show at the venue.
      expect((await create('open')).status).toBe(200);
      expect((await invoke(guest, 'rooms', { action: 'end' })).status).toBe(200);
      expect((await create('private')).status).toBe(200);
      expect((await invoke(guest, 'rooms', { action: 'end' })).status).toBe(200);
      const created = await create('open');
      expect(created.status).toBe(200);
      guestRoomId = (created.body as { roomId: string }).roomId;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const during = (await lobbyOf(owner)).map((r) =>
      r.room_id === thirdRoomId ? 'third' : 'other',
    );
    const eventsDuring = [...events];

    await expireWindow(roomId);
    const [{ ends_at: endsAt } = {}] =
      await sql`select reveal_ends_at as ends_at from public.rooms where id = ${roomId}`;
    await finalize(owner, roomId);
    await expect.poll(() => events.length, { timeout: 8000 }).toBeGreaterThan(eventsDuring.length);
    const after = await lobbyOf(owner);
    await owner.removeChannel(channel);
    for (const phone of PHONES) await deleteUserByPhone(phone);
    return {
      during,
      eventsDuring,
      eventsAtEnd: events.slice(eventsDuring.length),
      after,
      guestRoomId,
      endsAt,
    };
  }

  it('shows the yes table the same lobby and venue events for "no + new room" and "no answer"', async () => {
    const withNo = await yesSideLobby('no');
    const noAnswer = await yesSideLobby('nothing');

    expect(withNo.during).toEqual(['third']);
    expect(withNo.during).toEqual(noAnswer.during);
    expect(withNo.eventsDuring).toEqual([]);
    expect(withNo.eventsDuring).toEqual(noAnswer.eventsDuring);
    expect(withNo.eventsAtEnd).toEqual([BROADCAST.lobbyChanged]);
    expect(withNo.eventsAtEnd).toEqual(noAnswer.eventsAtEnd);

    // After the window the new room is listed, waiting from the window's end.
    const listed = withNo.after.find((r) => r.room_id === withNo.guestRoomId);
    expect(listed).toBeDefined();
    expect(Date.parse(listed?.waiting_since ?? '')).toBeGreaterThanOrEqual(
      (withNo.endsAt as Date).getTime(),
    );
  });
});

describe('reveal/finalize and cleanup', () => {
  it('does nothing before the window ends, then closes with "none" for both', async () => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, true);
    expect(await finalize(guest, roomId)).toEqual({ status: 200, body: { ok: true } });
    expect((await seenBy(owner, roomId))?.status).toBe('ending');

    await expireWindow(roomId);
    await Promise.all([finalize(owner, roomId), finalize(guest, roomId)]);
    const a = await seenBy(owner, roomId);
    expect(a).toMatchObject({ status: 'closed', reveal_result: 'none', reveal_token: null });
    expect(await seenBy(guest, roomId)).toEqual(a);
    expect(await finalize(owner, roomId)).toEqual({ status: 200, body: { ok: true } });
  });

  it('keeps the room ending when a table leaves during the window', async () => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, true);
    await invoke(guest, 'checkin', { action: 'leave' });
    expect(await seenBy(owner, roomId)).toMatchObject({ status: 'ending', reveal_result: null });
    await expireWindow(roomId);
    await finalize(owner, roomId);
    expect(await seenBy(owner, roomId)).toMatchObject({ status: 'closed', reveal_result: 'none' });
  });

  it('runs with every pg_cron job paused, so only the test closes a window', async () => {
    const [jobs] =
      await sql`select count(*)::int as n, bool_or(active) as any_active from cron.job`;
    expect(jobs?.n).toBeGreaterThan(0);
    expect(jobs?.any_active).toBe(false);
  });

  it('closes forgotten windows from cron once they end', async () => {
    const { owner, roomId } = await endingRoom();
    await sql`select private.close_expired_reveals()`;
    expect((await seenBy(owner, roomId))?.status).toBe('ending');
    await expireWindow(roomId);
    await sql`select private.close_expired_reveals()`;
    expect(await seenBy(owner, roomId)).toMatchObject({ status: 'closed', reveal_result: 'none' });
    const jobs = await sql`select 1 from cron.job where jobname = 'close-expired-reveals'`;
    expect(jobs).toHaveLength(1);
  });

  it('keeps the reveal functions server-side only', async () => {
    const { owner, roomId } = await endingRoom();
    const { error } = await owner.rpc('reveal_finalize', {
      target_user_id: '00000000-0000-4000-8000-000000000000',
      target_room_id: roomId,
    });
    expect(error?.code).toBe('42501');
  });
});

// docs/SPEC_V3.md §5.5 (S5): in a running two-table room, "Odayı bitir" + "Hayır", blocking and
// leaving the venue all open the window with that table's answer "Hayır". The other table, which
// then says "Evet", sees the same rows, broadcasts and timing in all three (rule 5).
describe('ways out of a two-table room look alike', { timeout: 60_000 }, () => {
  const VARYING = new Set([
    'id',
    'venue_id',
    'owner_session_id',
    'guest_session_id',
    'owner_alias',
    'guest_alias',
    'created_at',
    'waiting_since',
    'guest_joined_at',
    'last_activity_at',
    'reveal_ends_at',
  ]);

  async function yesSide(guestDoes: 'end-no' | 'block' | 'leave') {
    const { owner, guest, roomId } = await activeRoom();
    const events: string[] = [];
    const channel = owner.channel(venueChannel(venue[V] ?? ''), { config: { private: true } });
    await new Promise<void>((resolve) => {
      channel
        .on('broadcast', { event: '*' }, (msg: { event: string }) => events.push(msg.event))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
        });
    });

    // A broadcast still on its way from an earlier test at the same venue is not this path's.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    events.length = 0;

    const replies =
      guestDoes === 'end-no'
        ? [await invoke(guest, 'rooms', { action: 'end' }), await decide(guest, roomId, false)]
        : guestDoes === 'block'
          ? [await invoke(guest, 'safety', { action: 'block', roomId })]
          : [await invoke(guest, 'checkin', { action: 'leave' })];
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const { data: row } = await owner.from('rooms').select('*').eq('id', roomId).single();
    const windowSeconds =
      (Date.parse(String(row?.reveal_ends_at)) - Date.parse(String(row?.last_activity_at))) / 1000;
    const shape = Object.fromEntries(
      Object.entries(row ?? {}).filter(([key]) => !VARYING.has(key)),
    );
    const decisions = (await owner.from('reveal_decisions').select('wants_meet')).data;
    // What the venue channel carried while the window was open (finalize announces the lobby
    // change at its end in every case).
    const eventsDuring = [...events];
    const decided = await decide(owner, roomId, true);
    const afterYes = await seenBy(owner, roomId);
    await expireWindow(roomId);
    await finalize(owner, roomId);
    const final = await seenBy(owner, roomId);
    await owner.removeChannel(channel);
    for (const phone of PHONES) await deleteUserByPhone(phone);
    return {
      replies: replies.map((r) => r.status),
      view: {
        shape,
        windowSeconds,
        decisions,
        decided,
        afterYes: { status: afterYes?.status, result: afterYes?.reveal_result },
        final: { status: final?.status, result: final?.reveal_result, token: final?.reveal_token },
        events: eventsDuring,
      },
    };
  }

  it('shows the yes table the same for "Odayı bitir" + "Hayır", a block and leaving the venue', async () => {
    const endNo = await yesSide('end-no');
    const blocked = await yesSide('block');
    const left = await yesSide('leave');
    expect(endNo.replies).toEqual([200, 200]);
    expect(blocked.replies).toEqual([200]);
    expect(left.replies).toEqual([200]);
    expect(blocked.view).toEqual(endNo.view);
    expect(left.view).toEqual(endNo.view);
    expect(endNo.view).toMatchObject({
      windowSeconds: REVEAL.decisionSeconds,
      decisions: [],
      decided: { status: 200, body: { ok: true } },
      afterYes: { status: 'ending', result: null },
      final: { status: 'closed', result: 'none', token: null },
      events: [],
    });
    expect(endNo.view.shape).toMatchObject({ status: 'ending', reveal_result: null });
  });
});
