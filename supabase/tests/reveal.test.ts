import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { REVEAL_COLORS, REVEAL_EMOJIS } from '../functions/_shared/pure/reveal.ts';
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

// A two-table room whose owner pressed "Odayı bitir".
async function endingRoom() {
  const [owner, guest, third] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  for (const c of [owner, guest, third]) await checkInAt(c, venue, V);
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
  expect((await invoke(owner, 'rooms', { action: 'end' })).status).toBe(200);
  return { owner, guest, third, roomId };
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
  it('opens for 60 seconds when a two-table room ends', async () => {
    const { owner, roomId } = await endingRoom();
    const [row] = await sql`
      select status, extract(epoch from reveal_ends_at - now()) as left_s from public.rooms where id = ${roomId}
    `;
    expect(row?.status).toBe('ending');
    expect(Number(row?.left_s)).toBeGreaterThan(55);
    expect(Number(row?.left_s)).toBeLessThanOrEqual(60);
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
  ])('shows both tables the same "none" for owner=%s guest=%s', async (ownerSays, guestSays) => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, ownerSays);
    await decide(guest, roomId, guestSays);

    const a = await seenBy(owner, roomId);
    expect(a).toMatchObject({ status: 'closed', reveal_result: 'none', reveal_token: null });
    expect(await seenBy(guest, roomId)).toEqual(a);
  });

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

  it('closes with "none" when a table leaves during the window', async () => {
    const { owner, guest, roomId } = await endingRoom();
    await decide(owner, roomId, true);
    await invoke(guest, 'rooms', { action: 'leave' });
    expect(await seenBy(owner, roomId)).toMatchObject({ status: 'closed', reveal_result: 'none' });
  });

  it('closes forgotten windows from cron a minute after they end', async () => {
    const { owner, roomId } = await endingRoom();
    await expireWindow(roomId, '30 seconds');
    await sql`select private.close_expired_reveals()`;
    expect((await seenBy(owner, roomId))?.status).toBe('ending');
    await expireWindow(roomId, '2 minutes');
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
