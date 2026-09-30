// Private Realtime channels (MVP_SPEC §9 Realtime): the realtime.messages policies decide who may
// join a channel and who may send on it.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  BROADCAST,
  ROOM_CHECK_COLUMNS,
  roomCheckDiffers,
  sessionChannel,
  venueChannel,
} from '../functions/_shared/pure/rooms.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, onboarded, PHONES } from './helpers.ts';
import { anonKey, apiUrl, type Client, deleteUserByPhone, invoke, sql } from './local.ts';

let venue: Record<string, string> = {};
const V = 'at-anchor';
// How long a test waits for something that must not arrive.
const QUIET_MS = 2500;

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

// Owner and guest in a room at the venue; `outsider` is signed in but has no table in the room
// (checked in at the same venue when `outsiderAtVenue`).
async function roomWithGuest(outsiderAtVenue: boolean) {
  const [owner, guest, outsider] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  const ownerTable = await checkInAt(owner, venue, V);
  await checkInAt(guest, venue, V);
  if (outsiderAtVenue) await checkInAt(outsider, venue, V);
  const created = await invoke(owner, 'rooms', {
    action: 'create',
    concept: 'sohbet',
    visibility: 'open',
  });
  const roomId = (created.body as { roomId: string }).roomId;
  await invoke(guest, 'rooms', { action: 'request-join', roomId });
  const [request] =
    await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
  await invoke(owner, 'rooms', { action: 'respond', requestId: request?.id, accept: true });
  return { owner, guest, outsider, roomId, ownerSessionId: ownerTable.sessionId };
}

type Seen = { events: string[]; presenceKeys: Set<string> };

// Joins a channel; resolves with the final join status and what the channel sees from then on.
function join(
  client: Client,
  topic: string,
  opts: { private?: boolean; presenceKey?: string } = {},
): Promise<{ status: string; channel: RealtimeChannel; seen: Seen }> {
  const channel = client.channel(topic, {
    config: {
      private: opts.private ?? true,
      ...(opts.presenceKey ? { presence: { key: opts.presenceKey } } : {}),
    },
  });
  const seen: Seen = { events: [], presenceKeys: new Set() };
  channel.on('broadcast', { event: '*' }, (msg: { event: string }) => seen.events.push(msg.event));
  channel.on('presence', { event: 'sync' }, () => {
    for (const key of Object.keys(channel.presenceState())) seen.presenceKeys.add(key);
  });
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ status: 'TIMED_OUT', channel, seen }), 8000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        // A refused channel would keep retrying the join.
        if (status !== 'SUBSCRIBED') void client.removeChannel(channel);
        resolve({ status, channel, seen });
      }
    });
  });
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

async function accessToken(client: Client): Promise<string> {
  const { data } = await client.auth.getSession();
  if (!data.session) throw new Error('not signed in');
  return data.session.access_token;
}

describe('private room channels', { timeout: 60_000 }, () => {
  it('lets only the two tables of the room join its channels', async () => {
    const { owner, guest, outsider, roomId } = await roomWithGuest(true);
    for (const kind of ['room', 'messages', 'game', 'presence']) {
      const topic = `${kind}:${roomId}`;
      expect((await join(owner, topic)).status, topic).toBe('SUBSCRIBED');
      expect((await join(guest, topic)).status, topic).toBe('SUBSCRIBED');
      expect((await join(outsider, topic)).status, topic).toBe('CHANNEL_ERROR');
    }
  });

  it('shows members each other, and never an outsider pretending to be the guest', async () => {
    const { owner, guest, outsider, roomId } = await roomWithGuest(true);
    const topic = `presence:${roomId}`;
    const ownerSide = await join(owner, topic, { presenceKey: 'owner' });
    const seen = ownerSide.seen;
    await ownerSide.channel.track({});

    // The outsider cannot join the private channel, and a public channel of the same name does
    // not reach it.
    const privateTry = await join(outsider, topic, { presenceKey: 'guest' });
    expect(privateTry.status).toBe('CHANNEL_ERROR');
    const publicTry = await join(outsider, topic, { private: false, presenceKey: 'guest' });
    if (publicTry.status === 'SUBSCRIBED') await publicTry.channel.track({});
    await quiet();
    expect(seen.presenceKeys.has('guest')).toBe(false);

    const guestSide = await join(guest, topic, { presenceKey: 'guest' });
    await guestSide.channel.track({});
    await expect.poll(() => seen.presenceKeys.has('guest'), { timeout: 8000 }).toBe(true);
  });

  it('delivers member broadcasts, and never an outsider event', async () => {
    const { owner, guest, outsider, roomId } = await roomWithGuest(true);
    const topic = `room:${roomId}`;
    const ownerSide = await join(owner, topic);
    const seen = ownerSide.seen;

    // Outsider: public channel of the same name, then the REST endpoint with its own token.
    const publicTry = await join(outsider, topic, { private: false });
    if (publicTry.status === 'SUBSCRIBED') {
      await publicTry.channel.send({ type: 'broadcast', event: 'fake_public', payload: {} });
    }
    const token = await accessToken(outsider);
    await fetch(`${apiUrl}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messages: [{ topic, event: 'fake_rest', payload: {}, private: true }],
      }),
    });
    await quiet();
    expect(seen.events).toEqual([]);

    const guestSide = await join(guest, topic);
    await guestSide.channel.send({ type: 'broadcast', event: 'from_guest', payload: {} });
    await expect.poll(() => seen.events, { timeout: 8000 }).toEqual(['from_guest']);
  });
});

describe('private table channels', { timeout: 60_000 }, () => {
  it('lets only the table itself join its session channel', async () => {
    const { owner, guest, ownerSessionId } = await roomWithGuest(false);
    // The guest knows the owner's session id (rooms row) but cannot listen to its channel.
    expect((await join(owner, sessionChannel(ownerSessionId))).status).toBe('SUBSCRIBED');
    expect((await join(guest, sessionChannel(ownerSessionId))).status).toBe('CHANNEL_ERROR');
  });

  it('lets only tables at the venue join the lobby channel, where only the server sends', async () => {
    const { owner, guest, outsider } = await roomWithGuest(false);
    const topic = venueChannel(venue[V] ?? '');
    expect((await join(outsider, topic)).status).toBe('CHANNEL_ERROR');

    const guestSide = await join(guest, topic);
    expect(guestSide.status).toBe('SUBSCRIBED');
    const seen = guestSide.seen;
    const ownerSide = await join(owner, topic);
    await ownerSide.channel.send({ type: 'broadcast', event: BROADCAST.lobbyChanged, payload: {} });
    await quiet();
    expect(seen.events).toEqual([]);

    // The server's broadcast arrives: the guest leaves, the room is back in the lobby.
    await invoke(guest, 'rooms', { action: 'leave' });
    await expect.poll(() => seen.events, { timeout: 8000 }).toEqual([BROADCAST.lobbyChanged]);
  });
});

// The room screen follows its room with Postgres Changes on the private `room:{id}` channel
// (apps/mobile/src/features/rooms/queries.ts → useRoom), and re-reads it (`ROOM_CHECK_COLUMNS`) when
// the app comes to the foreground, when the channel (re)subscribes and every few seconds.
// Device report: the owner left a 1:1 room; the guest's screen stayed in the room until the app
// was restarted. Realtime delivers a change only to a channel that is subscribed at that moment and
// never replays it, and the screen had no other way to learn that the room closed.
function watchRoomRow(client: Client, roomId: string) {
  const rows: { status?: string }[] = [];
  const channel = client
    .channel(`room:${roomId}`, { config: { private: true } })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
      (payload: { new?: { status?: string } }) => rows.push(payload.new ?? {}),
    );
  const subscribed = new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
  return { rows, channel, subscribed };
}

// SUBSCRIBED comes before Postgres Changes are live: touch the row until a change arrives, then
// start from an empty list.
async function untilLive(watch: ReturnType<typeof watchRoomRow>, roomId: string) {
  expect(await watch.subscribed).toBe('SUBSCRIBED');
  await expect
    .poll(
      async () => {
        await sql`update public.rooms set last_activity_at = last_activity_at where id = ${roomId}`;
        return watch.rows.length;
      },
      { timeout: 15_000, interval: 500 },
    )
    .toBeGreaterThan(0);
  await quiet();
  watch.rows.length = 0;
}

// What the room screen's status check reads (apps/mobile/src/features/rooms/queries.ts).
async function statusCheck(client: Client, roomId: string) {
  const { data, error } = await client
    .from('rooms')
    .select(ROOM_CHECK_COLUMNS)
    .eq('id', roomId)
    .maybeSingle();
  expect(error).toBeNull();
  return data;
}

describe('room row changes', { timeout: 60_000 }, () => {
  it('reach a subscribed guest when the owner leaves', async () => {
    const { owner, guest, roomId } = await roomWithGuest(false);
    const watch = watchRoomRow(guest, roomId);
    await untilLive(watch, roomId);

    await invoke(owner, 'rooms', { action: 'leave' });
    await expect.poll(() => watch.rows.map((r) => r.status), { timeout: 8000 }).toContain('closed');
  });

  it('are not replayed to a guest that was away; only a re-read shows the closed room', async () => {
    const { owner, guest, roomId } = await roomWithGuest(false);
    const before = await statusCheck(guest, roomId);
    expect(before?.status).toBe('active');

    // The app went to the background and its socket dropped (or the network blinked).
    const away = watchRoomRow(guest, roomId);
    await untilLive(away, roomId);
    await guest.removeChannel(away.channel);
    await invoke(owner, 'rooms', { action: 'leave' });
    // Realtime handles the change while no channel of the guest is there.
    await quiet();

    // Back: the channel subscribes again, but the change it missed never comes.
    const back = watchRoomRow(guest, roomId);
    expect(await back.subscribed).toBe('SUBSCRIBED');
    await quiet();
    await quiet();
    expect(back.rows).toEqual([]);

    // The re-read does show it, and the check says the cached row is out of date.
    const after = await statusCheck(guest, roomId);
    expect(after?.status).toBe('closed');
    expect(roomCheckDiffers(before, after)).toBe(true);
  });

  // Rule 5: during the "Tanışalım mı?" window the table that said yes learns nothing of the other
  // table's no or leaving, neither from its channel nor from the re-reads added for this bug.
  it('show the yes table nothing while the other table says no and leaves', async () => {
    const { owner, guest, roomId } = await roomWithGuest(false);
    expect((await invoke(owner, 'rooms', { action: 'end' })).status).toBe(200);
    expect(
      (await invoke(owner, 'reveal', { action: 'decide', roomId, wantsMeet: true })).status,
    ).toBe(200);

    const watch = watchRoomRow(owner, roomId);
    await untilLive(watch, roomId);
    const before = await statusCheck(owner, roomId);
    const fullBefore = (await owner.from('rooms').select('*').eq('id', roomId).single()).data;
    expect(before?.status).toBe('ending');

    await invoke(guest, 'reveal', { action: 'decide', roomId, wantsMeet: false });
    await invoke(guest, 'rooms', { action: 'leave' });
    await invoke(guest, 'checkin', { action: 'leave' });
    await quiet();

    expect(watch.rows).toEqual([]);
    const after = await statusCheck(owner, roomId);
    expect(after).toEqual(before);
    expect(roomCheckDiffers(before, after)).toBe(false);
    const fullAfter = (await owner.from('rooms').select('*').eq('id', roomId).single()).data;
    expect(fullAfter).toEqual(fullBefore);
  });
});
