// Private Realtime channels (MVP_SPEC §9 Realtime): the realtime.messages policies decide who may
// join a channel and who may send on it.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { BROADCAST, sessionChannel, venueChannel } from '../functions/_shared/pure/rooms.ts';
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

    // The server's broadcast arrives.
    await invoke(owner, 'rooms', { action: 'end' });
    await expect.poll(() => seen.events, { timeout: 8000 }).toEqual([BROADCAST.lobbyChanged]);
  });
});
