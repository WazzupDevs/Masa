// Play history, friend requests, "Arkadaş ekle", friendships, DMs and history/DM safety actions
// (docs/SPEC_V2.md §6, §7, §11).
import { randomUUID } from 'node:crypto';

import type { RealtimeChannel } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { FriendsListResponse } from '../functions/_shared/pure/api/friends.ts';
import type { ProfileUploadUrl } from '../functions/_shared/pure/api/profile.ts';
import { PHOTO_BUCKET } from '../functions/_shared/pure/profile.ts';
import { BROADCAST, dmChannel, inboxChannel } from '../functions/_shared/pure/rooms.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import {
  admin,
  anonKey,
  apiUrl,
  type Client,
  deleteUserByPhone,
  invoke,
  sql,
  userIdOf,
} from './local.ts';

let venue: Record<string, string> = {};
const V = 'at-anchor';
const QUIET_MS = 2500;

beforeAll(async () => {
  // Other test files may leave reports and blocks behind; these tests count them.
  await sql`delete from public.reports`;
  await sql`delete from public.blocks`;
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  const folders = await sql<{ public_id: string }[]>`
    select p.public_id from public.profiles p join auth.users u on u.id = p.id
    where u.phone in ${sql(PHONES.map((p) => p.replace(/\D/g, '')))}
  `;
  for (const { public_id } of folders) {
    const { data } = await admin.storage.from(PHOTO_BUCKET).list(public_id);
    if (data?.length) {
      await admin.storage.from(PHOTO_BUCKET).remove(data.map((f) => `${public_id}/${f.name}`));
    }
  }
  for (const phone of PHONES) await deleteUserByPhone(phone);
  await sql`delete from public.reports`;
});

afterAll(async () => {
  await deleteFixtureVenues(sql);
  await sql.end();
});

type Mode = 'anonymous' | 'profile';
const OK = { status: 200, body: { ok: true } };
const quiet = () => new Promise((resolve) => setTimeout(resolve, QUIET_MS));

const friends = (client: Client, body: Record<string, unknown>) => invoke(client, 'friends', body);
const dm = (client: Client, body: Record<string, unknown>) => invoke(client, 'dm', body);
const safety = (client: Client, body: Record<string, unknown>) => invoke(client, 'safety', body);

async function named(phone: string, name: string | null): Promise<Client> {
  const client = await onboarded(phone);
  if (name) {
    const res = await invoke(client, 'profile', { action: 'update', displayName: name });
    expect(res.status).toBe(200);
  }
  return client;
}

async function publicIdOf(client: Client): Promise<string> {
  const { data } = await client.from('profiles').select('public_id').single();
  return data?.public_id ?? '';
}

// Owner a, guest b in an open room; the encounter is made `minutes` old.
async function encounter(
  a: Client,
  b: Client,
  opts: { minutes?: number; modes?: [Mode, Mode]; concept?: 'tabu' | 'sohbet' } = {},
): Promise<string> {
  const [ownerMode, guestMode] = opts.modes ?? ['anonymous', 'anonymous'];
  await checkInAt(a, venue, V, 2, ownerMode);
  await checkInAt(b, venue, V, 3, guestMode);
  const created = await invoke(a, 'rooms', {
    action: 'create',
    concept: opts.concept ?? 'sohbet',
    visibility: 'open',
  });
  expect(created.status, JSON.stringify(created.body)).toBe(200);
  const roomId = (created.body as { roomId: string }).roomId;
  expect((await invoke(b, 'rooms', { action: 'request-join', roomId })).status).toBe(200);
  const [request] =
    await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
  const accepted = await invoke(a, 'rooms', {
    action: 'respond',
    requestId: request?.id,
    accept: true,
  });
  expect(accepted.status).toBe(200);
  await sql`
    update public.rooms set guest_joined_at = now() - make_interval(mins => ${opts.minutes ?? 4})
    where id = ${roomId}
  `;
  return roomId;
}

async function endByGuestLeaving(b: Client): Promise<void> {
  expect((await invoke(b, 'rooms', { action: 'leave' })).status).toBe(200);
}

async function endMutual(a: Client, b: Client, roomId: string): Promise<void> {
  expect((await invoke(a, 'rooms', { action: 'end' })).status).toBe(200);
  expect((await invoke(a, 'reveal', { action: 'decide', roomId, wantsMeet: true })).status).toBe(
    200,
  );
  expect((await invoke(b, 'reveal', { action: 'decide', roomId, wantsMeet: true })).status).toBe(
    200,
  );
}

// Every column the app may read; the rest (other_user_id, other_profiled, encounter_id, user_id)
// is refused.
const HISTORY_COLUMNS =
  'id, room_id, concept, mode, own_alias, other_alias, other_headcount, reveal_mutual, friend_action_at, played_at, available_at';

async function history(client: Client) {
  const { data, error } = await client
    .from('play_history')
    .select(HISTORY_COLUMNS)
    .order('played_at', { ascending: false });
  expect(error).toBeNull();
  return data ?? [];
}

async function latestHistoryId(client: Client): Promise<string> {
  const [row] = await history(client);
  expect(row).toBeDefined();
  return row?.id ?? '';
}

// Two named accounts after one finished (available) encounter, a and b.
async function metOnce(
  opts: { modes?: [Mode, Mode]; names?: [string | null, string | null] } = {},
) {
  const [nameA, nameB] = opts.names ?? ['Ayşe', 'Burak'];
  const [a, b] = await Promise.all([named(PHONES[0], nameA), named(PHONES[1], nameB)]);
  const roomId = await encounter(a, b, { modes: opts.modes });
  await endByGuestLeaving(b);
  return { a, b, roomId, historyA: await latestHistoryId(a), historyB: await latestHistoryId(b) };
}

async function friendList(client: Client) {
  const res = await friends(client, { action: 'list' });
  expect(res.status).toBe(200);
  return (res.body as FriendsListResponse).friends;
}

async function incoming(client: Client) {
  const { data, error } = await client.rpc('my_incoming_requests');
  expect(error).toBeNull();
  return data ?? [];
}

async function sent(client: Client) {
  const { data, error } = await client.rpc('my_sent_requests');
  expect(error).toBeNull();
  return data ?? [];
}

async function becomeFriends(a: Client, b: Client, historyA: string): Promise<void> {
  expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
  const [req] = await incoming(b);
  expect(await friends(b, { action: 'respond', requestId: req?.request_id, accept: true })).toEqual(
    OK,
  );
}

async function join(client: Client, topic: string): Promise<{ status: string; events: string[] }> {
  const channel: RealtimeChannel = client.channel(topic, { config: { private: true } });
  const events: string[] = [];
  channel.on('broadcast', { event: '*' }, (msg: { event: string }) => events.push(msg.event));
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        clearTimeout(timer);
        if (s !== 'SUBSCRIBED') void client.removeChannel(channel);
        resolve(s);
      }
    });
  });
  return { status, events };
}

async function accessToken(client: Client): Promise<string> {
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? '';
}

// Every value the client can read about its own account: rows, RPCs, function answers.
async function everythingReadable(client: Client, roomId: string): Promise<string> {
  const { data: lobby } = await client.rpc('venue_lobby', { target_venue_id: venue[V] ?? '' });
  const { data: member } = await client.rpc('room_member_profile', { target_room_id: roomId });
  return JSON.stringify({
    history: await history(client),
    incoming: await incoming(client),
    sent: await sent(client),
    lobby,
    member,
    rooms: (await client.from('rooms').select('*')).data,
    joinRequests: (await client.from('join_requests').select('*')).data,
    friends: await friendList(client),
  });
}

describe('play history', () => {
  it('writes nothing for an encounter shorter than 3 minutes', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    await encounter(a, b, { minutes: 2 });
    await endByGuestLeaving(b);
    expect(await history(a)).toEqual([]);
    expect(await sql`select 1 from public.play_history`).toHaveLength(0);
  });

  it('writes one row per account, from its own view, without any id of the other side', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const roomId = await encounter(a, b, { concept: 'tabu' });
    const [aliases] =
      await sql`select owner_alias, guest_alias from public.rooms where id = ${roomId}`;
    await endByGuestLeaving(b);

    const [rowA] = await history(a);
    const [rowB] = await history(b);
    expect(rowA).toMatchObject({
      room_id: roomId,
      concept: 'tabu',
      mode: 'voice',
      own_alias: aliases?.owner_alias,
      other_alias: aliases?.guest_alias,
      other_headcount: 3,
      reveal_mutual: false,
      friend_action_at: null,
    });
    expect(rowB).toMatchObject({ own_alias: aliases?.guest_alias, other_headcount: 2 });
    expect(Object.keys(rowA ?? {}).sort()).toEqual(
      [
        'available_at',
        'concept',
        'friend_action_at',
        'id',
        'mode',
        'other_alias',
        'other_headcount',
        'own_alias',
        'played_at',
        'reveal_mutual',
        'room_id',
      ].sort(),
    );
    for (const column of ['other_user_id', 'other_profiled', 'encounter_id', 'user_id']) {
      expect((await a.from('play_history').select(column)).error?.code, column).toBe('42501');
    }
    const [shared] = await sql`
      select count(distinct encounter_id)::int as encounters, count(*)::int as rows
      from public.play_history
    `;
    expect(shared).toEqual({ encounters: 1, rows: 2 });
  });

  it('writes the encounter on every ending transition', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const count = async () =>
      ((await sql`select count(*)::int as n from public.play_history`)[0]?.n as number) ?? 0;

    // The owner leaves.
    await encounter(a, b);
    await invoke(a, 'rooms', { action: 'leave' });
    expect(await count()).toBe(2);

    // The guest blocks (and leaves).
    let roomId = await encounter(a, b);
    await invoke(b, 'safety', { action: 'block', roomId });
    expect(await count()).toBe(4);
    await sql`delete from public.blocks`;

    // The guest's table ends.
    await encounter(a, b);
    await invoke(b, 'checkin', { action: 'leave' });
    expect(await count()).toBe(6);

    // The room closes for inactivity.
    roomId = await encounter(a, b);
    await sql`update public.rooms set last_activity_at = now() - interval '11 minutes' where id = ${roomId}`;
    await sql`select private.close_idle_rooms()`;
    expect(await count()).toBe(8);

    // "Odayı bitir": written at once, visible only when the window ends.
    roomId = await encounter(a, b);
    await invoke(a, 'rooms', { action: 'end' });
    expect(await count()).toBe(10);
    const [room] = await sql`select reveal_ends_at from public.rooms where id = ${roomId}`;
    const [written] = await sql`
      select available_at from public.play_history where room_id = ${roomId} limit 1
    `;
    expect(written?.available_at).toEqual(room?.reveal_ends_at);
    expect((await history(a)).some((h) => h.room_id === roomId)).toBe(false);
  });

  it('opens both rows at once as mutual after two "Evet"', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const roomId = await encounter(a, b);
    await endMutual(a, b, roomId);
    const [rowA] = await history(a);
    const [rowB] = await history(b);
    expect(rowA).toMatchObject({ room_id: roomId, reveal_mutual: true });
    expect(rowB).toMatchObject({ room_id: roomId, reveal_mutual: true });
  });
});

describe('the "Evet" side cannot tell no, leaving and no answer apart', () => {
  it('sees the same history rows, timing and inbox events in all three', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const inboxA = await join(a, inboxChannel(await userIdOf(a)));
    const views: unknown[] = [];
    for (const other of ['no', 'leave', 'silent'] as const) {
      const roomId = await encounter(a, b);
      await invoke(a, 'rooms', { action: 'end' });
      await invoke(a, 'reveal', { action: 'decide', roomId, wantsMeet: true });
      if (other === 'no') await invoke(b, 'reveal', { action: 'decide', roomId, wantsMeet: false });
      if (other === 'leave') await invoke(b, 'checkin', { action: 'leave' });
      const [row] = await sql`
        select reveal_mutual, available_at = r.reveal_ends_at as at_window_end
        from public.play_history h join public.rooms r on r.id = h.room_id
        where h.room_id = ${roomId} and h.user_id = ${await userIdOf(a)}
      `;
      views.push({ row, visible: (await history(a)).filter((h) => h.room_id === roomId) });
      // Close the window so the next room can start.
      await sql`update public.rooms set reveal_ends_at = now() - interval '1 second' where id = ${roomId}`;
      await sql`select private.close_expired_reveals()`;
      await sql`update public.play_history set available_at = now() where room_id = ${roomId}`;
    }
    expect(views).toEqual([views[0], views[0], views[0]]);
    expect(views[0]).toEqual({ row: { reveal_mutual: false, at_window_end: true }, visible: [] });
    await quiet();
    expect(inboxA.events).toEqual([]);
  });
});

describe('friend requests', () => {
  it('needs a display name to send and to accept', async () => {
    const { a, b, historyA, historyB } = await metOnce({ names: [null, null] });
    const required = { status: 409, body: errorBody('display_name_required') };
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(required);
    await invoke(a, 'profile', { action: 'update', displayName: 'Ayşe' });
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    const [req] = await incoming(b);
    expect(
      await friends(b, { action: 'respond', requestId: req?.request_id, accept: true }),
    ).toEqual(required);
    expect(await friends(b, { action: 'add-from-room', historyId: historyB })).toEqual(required);
  });

  it('shows the request with the table alias and date, never a profile id', async () => {
    const { a, b, historyA, roomId } = await metOnce();
    const [aliases] =
      await sql`select owner_alias, guest_alias from public.rooms where id = ${roomId}`;
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);

    const [req] = await incoming(b);
    expect(req).toMatchObject({
      history_id: await latestHistoryId(b),
      concept: 'sohbet',
      other_alias: aliases?.owner_alias,
      other_headcount: 2,
    });
    expect(Object.keys(req ?? {}).sort()).toEqual(
      [
        'concept',
        'created_at',
        'history_id',
        'other_alias',
        'other_headcount',
        'played_at',
        'request_id',
      ].sort(),
    );
    expect(await sent(a)).toEqual([
      expect.objectContaining({
        other_alias: (await history(a))[0]?.other_alias,
        status: 'pending',
      }),
    ]);
    // The history row now says only that the button was pressed.
    expect((await history(a))[0]?.friend_action_at).not.toBeNull();
  });

  it('shows the sender the same for an unanswered and a declined request, for ever', async () => {
    const { a, b, historyA } = await metOnce();
    await friends(a, { action: 'request', historyId: historyA });
    const before = await sent(a);
    const [req] = await incoming(b);
    expect(
      await friends(b, { action: 'respond', requestId: req?.request_id, accept: false }),
    ).toEqual(OK);
    expect(await sent(a)).toEqual(before);
    expect(await incoming(b)).toEqual([]);

    // A second request to the same account is swallowed: same answer, no new row.
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    expect(await sent(a)).toEqual(before);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(1);
  });

  it('creates no new request row from a second encounter of the same two accounts', async () => {
    const { a, b, historyA } = await metOnce();
    await friends(a, { action: 'request', historyId: historyA });

    // Pending: a meets b again and asks from the new row.
    await encounter(a, b);
    await endByGuestLeaving(b);
    const newer = await latestHistoryId(a);
    expect(newer).not.toBe(historyA);
    expect(await friends(a, { action: 'request', historyId: newer })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(1);

    // Declined: the same after a third encounter.
    const [req] = await incoming(b);
    await friends(b, { action: 'respond', requestId: req?.request_id, accept: false });
    await encounter(a, b);
    await endByGuestLeaving(b);
    expect(await friends(a, { action: 'request', historyId: await latestHistoryId(a) })).toEqual(
      OK,
    );
    const rows = await sql`select status from public.friend_requests`;
    expect(rows).toEqual([{ status: 'declined' }]);
  });

  it('makes friends at once when the other side had already asked', async () => {
    const { a, b, historyA, historyB } = await metOnce();
    await friends(b, { action: 'request', historyId: historyB });
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    expect((await friendList(a)).map((f) => f.publicId)).toEqual([await publicIdOf(b)]);
    expect(await sent(b)).toEqual([expect.objectContaining({ status: 'accepted' })]);
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual({
      status: 409,
      body: errorBody('already_friends'),
    });
  });

  it('swallows requests across a block in either direction, and when the other account is gone', async () => {
    const { a, b, historyA, historyB } = await metOnce();
    expect(await safety(b, { action: 'block', historyId: historyB })).toEqual(OK);
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(0);
    expect(await incoming(b)).toEqual([]);
    await sql`delete from public.blocks`;

    // A request that was waiting before the block is hidden from the blocked side's view.
    await friends(a, { action: 'request', historyId: historyA });
    expect(await incoming(b)).toHaveLength(1);
    await safety(a, { action: 'block', historyId: historyA });
    expect(await incoming(b)).toEqual([]);
    await sql`delete from public.blocks`;
    await sql`delete from public.friend_requests`;

    await deleteUserByPhone(PHONES[1]);
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(0);
    // The row stays in the history of a.
    expect(await history(a)).toHaveLength(1);
  });

  it("does nothing with another account's row or an unknown row, with the same answer", async () => {
    const { a, historyB } = await metOnce();
    expect(await friends(a, { action: 'request', historyId: historyB })).toEqual(OK);
    expect(await friends(a, { action: 'request', historyId: randomUUID() })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(0);
  });

  it('cannot be sent from the history during the "Tanışalım mı?" window', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const roomId = await encounter(a, b);
    await invoke(a, 'rooms', { action: 'end' });
    await invoke(b, 'reveal', { action: 'decide', roomId, wantsMeet: false });
    const [row] = await sql`
      select h.id from public.play_history h
      join auth.users u on u.id = h.user_id where u.phone = ${PHONES[1].replace(/\D/g, '')}
    `;
    expect(await friends(b, { action: 'request', historyId: row?.id })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(0);
    expect(await history(b)).toEqual([]);
  });
});

describe('"Arkadaş ekle" after a mutual Evet', () => {
  it('does nothing when one side presses, and makes friends when both do', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const roomId = await encounter(a, b);
    await endMutual(a, b, roomId);
    const historyA = await latestHistoryId(a);
    const historyB = await latestHistoryId(b);

    const inboxB = await join(b, inboxChannel(await userIdOf(b)));
    expect(inboxB.status).toBe('SUBSCRIBED');
    const beforeB = JSON.stringify(await history(b));
    expect(await friends(a, { action: 'add-from-room', historyId: historyA })).toEqual(OK);
    expect(await friends(a, { action: 'add-from-room', historyId: historyA })).toEqual(OK);
    await quiet();
    expect(inboxB.events).toEqual([]);
    expect(JSON.stringify(await history(b))).toBe(beforeB);
    expect(await incoming(b)).toEqual([]);
    expect(await friendList(a)).toEqual([]);
    expect(await friendList(b)).toEqual([]);

    expect(await friends(b, { action: 'add-from-room', historyId: historyB })).toEqual(OK);
    await expect
      .poll(() => inboxB.events, { timeout: 8000 })
      .toEqual([BROADCAST.friendshipChanged]);
    expect((await friendList(a)).map((f) => f.publicId)).toEqual([await publicIdOf(b)]);
    expect(await sql`select source from public.friendships`).toEqual([
      { source: 'room_end_mutual' },
    ]);
  });

  it('writes nothing on an encounter without a mutual Evet', async () => {
    const { a, b, historyA, historyB } = await metOnce();
    expect(await friends(a, { action: 'add-from-room', historyId: historyA })).toEqual(OK);
    expect(await friends(b, { action: 'add-from-room', historyId: historyB })).toEqual(OK);
    expect(await sql`select 1 from public.mutual_friend_intents`).toHaveLength(0);
    expect(await sql`select 1 from public.friendships`).toHaveLength(0);
  });
});

describe('no profile id before a friendship', () => {
  it('keeps public_id out of every response until the request is accepted', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    const [idA, idB] = [await publicIdOf(a), await publicIdOf(b)];
    const [uidA, uidB] = [await userIdOf(a), await userIdOf(b)];
    const roomId = await encounter(a, b, { modes: ['profile', 'anonymous'] });

    // While the room runs, the profiled table's id reaches the other member (and only that one).
    const { data: member } = await b.rpc('room_member_profile', { target_room_id: roomId });
    expect(member).toBe(idA);
    await endByGuestLeaving(b);

    const answers = [
      await friends(a, { action: 'request', historyId: await latestHistoryId(a) }),
      await friends(b, { action: 'add-from-room', historyId: await latestHistoryId(b) }),
    ];
    const seenByA = (await everythingReadable(a, roomId)) + JSON.stringify(answers);
    const seenByB = await everythingReadable(b, roomId);
    expect(seenByA).not.toContain(idB);
    expect(seenByB).not.toContain(idA);
    // Account ids never, before or after.
    expect(seenByA).not.toContain(uidB);
    expect(seenByB).not.toContain(uidA);
    expect(await invoke(b, 'profile', { action: 'get', publicId: idA })).toEqual(
      await invoke(b, 'profile', { action: 'get', publicId: randomUUID() }),
    );

    const [req] = await incoming(b);
    await friends(b, { action: 'respond', requestId: req?.request_id, accept: true });
    expect((await friendList(b)).map((f) => f.publicId)).toEqual([idA]);
    expect((await invoke(b, 'profile', { action: 'get', publicId: idA })).status).toBe(200);
    expect(JSON.stringify(await friendList(b))).not.toContain(uidA);
  });

  it('lists friends with name, photo, date and thread only', async () => {
    const { a, b, historyA } = await metOnce();
    await becomeFriends(a, b, historyA);
    const [friend] = await friendList(b);
    expect(Object.keys(friend ?? {}).sort()).toEqual(
      [
        'displayName',
        'lastMessageAt',
        'photoUrl',
        'publicId',
        'since',
        'threadId',
        'unread',
      ].sort(),
    );
    expect(friend).toMatchObject({ displayName: 'Ayşe', photoUrl: null, unread: false });
  });
});

describe('ending a friendship', () => {
  async function friendsWithMessages() {
    const { a, b, historyA, historyB } = await metOnce();
    await becomeFriends(a, b, historyA);
    const threadId = (await friendList(a))[0]?.threadId ?? '';
    for (let i = 1; i <= 3; i++) {
      expect(await dm(i % 2 ? a : b, { action: 'send', threadId, body: `mesaj ${i}` })).toEqual(OK);
      await sql`update public.dm_messages set created_at = created_at - interval '2 seconds'`;
    }
    return { a, b, threadId, historyB };
  }

  it('removes silently: the other side sees the same after a removal and after a block', async () => {
    const first = await friendsWithMessages();
    const inboxA = await join(first.a, inboxChannel(await userIdOf(first.a)));
    expect(
      await friends(first.b, { action: 'remove', publicId: await publicIdOf(first.a) }),
    ).toEqual(OK);
    const afterRemoval = await friendList(first.a);
    await quiet();
    expect(inboxA.events).toEqual([]);
    expect(await sql`select 1 from public.dm_threads`).toHaveLength(0);
    expect(await sql`select 1 from public.dm_messages`).toHaveLength(0);
    expect(await sql`select 1 from public.reports`).toHaveLength(0);
    expect(await dm(first.a, { action: 'send', threadId: first.threadId, body: 'selam' })).toEqual({
      status: 403,
      body: errorBody('not_friends'),
    });

    // They become friends again (only the remover, b, can ask); this time b blocks.
    await becomeFriends(first.b, first.a, await latestHistoryId(first.b));
    await quiet();
    inboxA.events.length = 0; // the new friendship's own event
    expect(await safety(first.b, { action: 'block', publicId: await publicIdOf(first.a) })).toEqual(
      OK,
    );
    await quiet();
    expect(inboxA.events).toEqual([]);
    expect(await friendList(first.a)).toEqual(afterRemoval);
    expect(await sql`select blocked_alias from public.blocks`).toEqual([{ blocked_alias: 'Ayşe' }]);
  });

  it('copies the DMs into a report in the same transaction when asked', async () => {
    const { a, b, threadId } = await friendsWithMessages();
    expect(
      await friends(b, { action: 'remove', publicId: await publicIdOf(a), report: 'harassment' }),
    ).toEqual(OK);
    const [report] = await sql`
      select target_type, reason, dm_thread_id, messages_snapshot from public.reports
    `;
    expect(report).toMatchObject({
      target_type: 'dm',
      reason: 'harassment',
      dm_thread_id: threadId,
    });
    expect(report?.messages_snapshot).toEqual([
      expect.objectContaining({ from: 'reported', body: 'mesaj 1' }),
      expect.objectContaining({ from: 'reporter', body: 'mesaj 2' }),
      expect.objectContaining({ from: 'reported', body: 'mesaj 3' }),
    ]);
    expect(JSON.stringify(report)).not.toContain(await userIdOf(a));
    expect(await sql`select 1 from public.dm_messages`).toHaveLength(0);
  });

  it('keeps the friendship when the report cannot be written', async () => {
    const { a, b } = await friendsWithMessages();
    const [uidB, idA] = [await userIdOf(b), await publicIdOf(a)];
    await expect(
      sql`select public.friends_remove(${uidB}, ${idA}, 'not-a-reason')`,
    ).rejects.toThrow(/reports_reason_check/);
    await expect(
      sql`select public.safety_block_friend(${uidB}, ${idA}, 'not-a-reason')`,
    ).rejects.toThrow(/reports_reason_check/);
    expect(await sql`select 1 from public.friendships`).toHaveLength(1);
    expect(await sql`select 1 from public.dm_messages`).toHaveLength(3);
    expect(await sql`select 1 from public.blocks`).toHaveLength(0);
  });

  it('answers not_friends for anyone who is not a friend', async () => {
    const { a, b } = await metOnce();
    expect(await friends(a, { action: 'remove', publicId: await publicIdOf(b) })).toEqual({
      status: 403,
      body: errorBody('not_friends'),
    });
  });
});

describe('removal works as a permanent decline for the removed side', () => {
  // b removes a unless `block`, in which case b blocks a (from the friend list).
  async function endedBy(block: boolean) {
    const { a, b, historyA } = await metOnce();
    await becomeFriends(a, b, historyA);
    const idA = await publicIdOf(a);
    expect(
      block
        ? await safety(b, { action: 'block', publicId: idA })
        : await friends(b, { action: 'remove', publicId: idA }),
    ).toEqual(OK);
    return { a, b, historyA };
  }

  // Everything the removed side (a) can see after asking again.
  async function removedSideView(a: Client, historyA: string) {
    const answer = await friends(a, { action: 'request', historyId: historyA });
    // Ids, aliases and times differ between the two runs; the shape and states must not.
    return {
      answer,
      friends: await friendList(a),
      sent: (await sent(a)).map((r) => ({ concept: r.concept, status: r.status })),
      history: (await history(a)).map((h) => ({
        concept: h.concept,
        mode: h.mode,
        reveal_mutual: h.reveal_mutual,
        other_headcount: h.other_headcount,
        pressed: h.friend_action_at !== null,
      })),
      incoming: await incoming(a),
    };
  }

  it("swallows the removed side's new request and shows it pending for ever", async () => {
    const { a, b, historyA } = await endedBy(false);
    const rowsBefore =
      await sql`select from_user_id, to_user_id, status from public.friend_requests order by status`;
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    // A new encounter does not help either.
    await encounter(a, b);
    await endByGuestLeaving(b);
    const newer = await latestHistoryId(a);
    expect(await friends(a, { action: 'request', historyId: newer })).toEqual(OK);

    expect(
      await sql`select from_user_id, to_user_id, status from public.friend_requests order by status`,
    ).toEqual(rowsBefore);
    expect(await incoming(b)).toEqual([]);
    expect((await sent(a)).map((r) => r.status)).toEqual(['pending', 'pending']);
  });

  it('looks the same to the removed side as a block', async () => {
    const removed = await endedBy(false);
    const afterRemoval = await removedSideView(removed.a, removed.historyA);
    for (const phone of PHONES) await deleteUserByPhone(phone);
    await sql`delete from public.blocks`;

    const blocked = await endedBy(true);
    const afterBlock = await removedSideView(blocked.a, blocked.historyA);
    expect(afterBlock).toEqual(afterRemoval);
    expect(afterRemoval.answer).toEqual(OK);
    expect(afterRemoval.sent).toEqual([expect.objectContaining({ status: 'pending' })]);
  });

  it('lets the remover ask again', async () => {
    const { a, b } = await endedBy(false);
    const historyB = await latestHistoryId(b);
    expect(await friends(b, { action: 'request', historyId: historyB })).toEqual(OK);
    const [req] = await incoming(a);
    expect(req).toBeDefined();
    expect(
      await friends(a, { action: 'respond', requestId: req?.request_id, accept: true }),
    ).toEqual(OK);
    expect(await friendList(b)).toHaveLength(1);

    // Now a removes b: b, the earlier remover, becomes the removed side and a may ask again.
    expect(await friends(a, { action: 'remove', publicId: await publicIdOf(b) })).toEqual(OK);
    expect(await friends(b, { action: 'request', historyId: historyB })).toEqual(OK);
    expect(await incoming(a)).toEqual([]);
    expect(await friends(a, { action: 'request', historyId: await latestHistoryId(a) })).toEqual(
      OK,
    );
    expect(await incoming(b)).toHaveLength(1);
  });

  it('keeps an earlier real decline on removal, whoever removes', async () => {
    const { a, b, historyA, historyB } = await metOnce();
    // a asks, b declines; then b asks and a accepts.
    await friends(a, { action: 'request', historyId: historyA });
    const [first] = await incoming(b);
    await friends(b, { action: 'respond', requestId: first?.request_id, accept: false });
    await friends(b, { action: 'request', historyId: historyB });
    const [second] = await incoming(a);
    await friends(a, { action: 'respond', requestId: second?.request_id, accept: true });
    const [decline] = await sql`select id from public.friend_requests where status = 'declined'`;

    // b (who declined) removes a: the decline stays, untouched.
    await friends(b, { action: 'remove', publicId: await publicIdOf(a) });
    expect(
      await sql`select id, status from public.friend_requests where id = ${decline?.id}`,
    ).toEqual([{ id: decline?.id, status: 'declined' }]);

    // Friends again through b's request; now a (who was declined) removes b.
    await friends(b, { action: 'request', historyId: historyB });
    const [third] = await incoming(a);
    await friends(a, { action: 'respond', requestId: third?.request_id, accept: true });
    await friends(a, { action: 'remove', publicId: await publicIdOf(b) });
    expect(
      await sql`select id, status from public.friend_requests where id = ${decline?.id}`,
    ).toEqual([{ id: decline?.id, status: 'declined' }]);
  });
});

describe('DMs', () => {
  it('sends between friends only, filters profanity and limits the rate', async () => {
    const { a, b, historyA } = await metOnce();
    await becomeFriends(a, b, historyA);
    const threadId = (await friendList(a))[0]?.threadId ?? '';

    expect(await dm(a, { action: 'send', threadId, body: '  Selam! ' })).toEqual(OK);
    expect(await dm(a, { action: 'send', threadId, body: 'ikinci' })).toEqual({
      status: 429,
      body: errorBody('rate_limited'),
    });
    expect(await dm(b, { action: 'send', threadId, body: 'amk' })).toEqual({
      status: 422,
      body: errorBody('profanity_rejected'),
    });
    expect(await dm(b, { action: 'send', threadId, body: 'x'.repeat(501) })).toEqual({
      status: 400,
      body: errorBody('message_invalid'),
    });

    const { data: page } = await b.rpc('dm_messages_page', { target_thread_id: threadId });
    expect(page).toEqual([expect.objectContaining({ body: 'Selam!', from_me: false })]);
    expect(Object.keys(page?.[0] ?? {}).sort()).toEqual(['body', 'created_at', 'from_me', 'id']);
    expect((await friendList(b))[0]?.unread).toBe(true);
    expect(await dm(b, { action: 'read', threadId })).toEqual(OK);
    expect((await friendList(b))[0]?.unread).toBe(false);

    // A third account: no thread, no page.
    const c = await named(PHONES[2], 'Cem');
    expect(await dm(c, { action: 'send', threadId, body: 'selam' })).toEqual({
      status: 403,
      body: errorBody('not_friends'),
    });
    const { data: none } = await c.rpc('dm_messages_page', { target_thread_id: threadId });
    expect(none).toEqual([]);
  });

  it('keeps inbox and dm channels to their members, and only the server sends', async () => {
    const { a, b, historyA } = await metOnce();
    await becomeFriends(a, b, historyA);
    const threadId = (await friendList(a))[0]?.threadId ?? '';
    const c = await named(PHONES[2], 'Cem');

    expect((await join(c, inboxChannel(await userIdOf(a)))).status).toBe('CHANNEL_ERROR');
    expect((await join(c, dmChannel(threadId))).status).toBe('CHANNEL_ERROR');
    const dmB = await join(b, dmChannel(threadId));
    const inboxB = await join(b, inboxChannel(await userIdOf(b)));
    expect([dmB.status, inboxB.status]).toEqual(['SUBSCRIBED', 'SUBSCRIBED']);

    // A member cannot send on either channel, not even through the REST endpoint.
    for (const topic of [dmChannel(threadId), inboxChannel(await userIdOf(b))]) {
      await fetch(`${apiUrl}/realtime/v1/api/broadcast`, {
        method: 'POST',
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${await accessToken(a)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messages: [{ topic, event: 'fake', payload: {}, private: true }] }),
      });
    }
    await quiet();
    expect([...dmB.events, ...inboxB.events]).toEqual([]);

    await dm(a, { action: 'send', threadId, body: 'selam' });
    await expect.poll(() => dmB.events, { timeout: 8000 }).toEqual([BROADCAST.dmMessage]);
    await expect.poll(() => inboxB.events, { timeout: 8000 }).toEqual([BROADCAST.dm]);
  });
});

describe('history safety actions', () => {
  async function uploadPhoto(client: Client): Promise<void> {
    const res = await invoke(client, 'profile', { action: 'photo-upload-url' });
    const { path, token } = res.body as ProfileUploadUrl;
    const jfif = [0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const bytes = new Uint8Array([0xff, 0xd8, ...jfif, 0xff, 0xda, 0, 2, 0x12, 0xff, 0xd9]);
    await client.storage
      .from(PHOTO_BUCKET)
      .uploadToSignedUrl(path, token, bytes, { contentType: 'image/jpeg' });
    expect((await invoke(client, 'profile', { action: 'photo-commit', path })).status).toBe(200);
  }

  it('reports after the room ended with the profile copy of a table that joined with it', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    await invoke(a, 'profile', { action: 'update', bio: 'Tabu sever.' });
    await uploadPhoto(a);
    const roomId = await encounter(a, b, { modes: ['profile', 'anonymous'] });
    await invoke(b, 'chat', { action: 'send', roomId, body: 'iyi oyunlar' });
    await endByGuestLeaving(b);
    // The room is over: the profile is no longer visible to b.
    expect(
      (await invoke(b, 'profile', { action: 'get', publicId: await publicIdOf(a) })).status,
    ).toBe(404);

    expect(
      await safety(b, {
        action: 'report',
        target: 'history',
        historyId: await latestHistoryId(b),
        reason: 'inappropriate',
      }),
    ).toEqual(OK);
    const [report] = await sql`select * from public.reports`;
    expect(report).toMatchObject({
      target_type: 'history',
      reported_user_id: await userIdOf(a),
      room_id: roomId,
      profile_snapshot: expect.objectContaining({ display_name: 'Ayşe', bio: 'Tabu sever.' }),
      context: expect.objectContaining({ concept: 'sohbet', other_profiled: true }),
    });
    expect(report?.photo_copy).not.toBeNull();
    expect(report?.messages_snapshot).toEqual([expect.objectContaining({ body: 'iyi oyunlar' })]);
  });

  it('keeps only the game context for a table that joined anonymously', async () => {
    const [a, b] = await Promise.all([named(PHONES[0], 'Ayşe'), named(PHONES[1], 'Burak')]);
    await uploadPhoto(a);
    await encounter(a, b, { modes: ['anonymous', 'anonymous'] });
    await endByGuestLeaving(b);
    await safety(b, {
      action: 'report',
      target: 'history',
      historyId: await latestHistoryId(b),
      reason: 'spam',
    });
    const [report] = await sql`select profile_snapshot, photo_copy, context from public.reports`;
    expect(report).toMatchObject({
      profile_snapshot: null,
      photo_copy: null,
      context: expect.objectContaining({ other_profiled: false, other_alias: expect.any(String) }),
    });
  });

  it("writes nothing for another account's row or an unknown row, with the same answer", async () => {
    const { a, historyB } = await metOnce();
    for (const historyId of [historyB, randomUUID()]) {
      expect(
        await safety(a, { action: 'report', target: 'history', historyId, reason: 'spam' }),
      ).toEqual(OK);
      expect(await safety(a, { action: 'block', historyId })).toEqual(OK);
    }
    expect(await sql`select 1 from public.reports`).toHaveLength(0);
    expect(await sql`select 1 from public.blocks`).toHaveLength(0);
  });

  it('blocks with the alias of that encounter, reports in the same step, and ends a friendship', async () => {
    const { a, b, historyA, historyB, roomId } = await metOnce();
    await becomeFriends(a, b, historyA);
    const [aliases] = await sql`select owner_alias from public.rooms where id = ${roomId}`;
    expect(await safety(b, { action: 'block', historyId: historyB, report: 'harassment' })).toEqual(
      OK,
    );
    expect(await sql`select blocked_alias from public.blocks`).toEqual([
      { blocked_alias: aliases?.owner_alias },
    ]);
    expect(await sql`select target_type from public.reports`).toEqual([{ target_type: 'history' }]);
    expect(await sql`select 1 from public.friendships`).toHaveLength(0);
  });
});

describe('account deletion', () => {
  it('takes friendships, DMs, requests and intents; the other history row stays', async () => {
    const { a, b, historyA } = await metOnce();
    await becomeFriends(a, b, historyA);
    const threadId = (await friendList(a))[0]?.threadId ?? '';
    await dm(a, { action: 'send', threadId, body: 'selam' });
    expect((await invoke(b, 'account', { action: 'delete' })).status).toBe(200);
    for (const table of ['friendships', 'dm_threads', 'dm_messages', 'friend_requests']) {
      expect(await sql`select 1 from ${sql(`public.${table}`)}`, table).toHaveLength(0);
    }
    expect(await history(a)).toHaveLength(1);
    expect(await friends(a, { action: 'request', historyId: historyA })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(0);
  });
});
