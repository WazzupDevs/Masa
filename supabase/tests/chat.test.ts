import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

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

const send = (client: Client, roomId: string, body: string) =>
  invoke(client, 'chat', { action: 'send', roomId, body });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Owner and guest in an open room; a third table at the venue.
async function roomWithGuest() {
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
  return { owner, guest, third, roomId };
}

async function messages(client: Client, roomId: string) {
  const { data } = await client
    .from('messages')
    .select('sender_alias, body')
    .eq('room_id', roomId)
    .order('created_at');
  return data ?? [];
}

describe('chat/send', () => {
  it('delivers messages to both tables, with the sender alias, and to nobody else', async () => {
    const { owner, guest, third, roomId } = await roomWithGuest();
    expect(await send(owner, roomId, '  Merhaba!  ')).toEqual({
      status: 200,
      body: { messageId: expect.any(String) },
    });
    await sleep(1100);
    await send(guest, roomId, 'Selam');

    const forOwner = await messages(owner, roomId);
    expect(forOwner.map((m) => m.body)).toEqual(['Merhaba!', 'Selam']);
    expect(await messages(guest, roomId)).toEqual(forOwner);
    expect(await messages(third, roomId)).toEqual([]);
    const [room] =
      await sql`select owner_alias, guest_alias from public.rooms where id = ${roomId}`;
    expect(forOwner.map((m) => m.sender_alias)).toEqual([room?.owner_alias, room?.guest_alias]);
  });

  it('streams new messages to the other table through Postgres Changes', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    const received = new Promise<string>((resolve, reject) => {
      const channel = guest
        .channel(`test-messages-${roomId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
          (payload) => resolve((payload.new as { body: string }).body),
        )
        // Postgres Changes are live once the server confirms the database subscription.
        .on('system', {}, (payload: { extension?: string; status?: string }) => {
          if (payload.extension === 'postgres_changes' && payload.status === 'ok') {
            void send(owner, roomId, 'canlı mesaj');
          }
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR') reject(new Error(status));
        });
      setTimeout(() => {
        void guest.removeChannel(channel);
        reject(new Error('no realtime message'));
      }, 10_000);
    });
    await expect(received).resolves.toBe('canlı mesaj');
  });

  it('filters profanity and length on the server', async () => {
    const { owner, roomId } = await roomWithGuest();
    expect(await send(owner, roomId, 'Siktir git')).toEqual({
      status: 422,
      body: errorBody('profanity_rejected'),
    });
    expect(await send(owner, roomId, 'ŞEREFSİZ')).toEqual({
      status: 422,
      body: errorBody('profanity_rejected'),
    });
    expect(await send(owner, roomId, '   ')).toEqual({
      status: 400,
      body: errorBody('message_invalid'),
    });
    expect(await send(owner, roomId, 'a'.repeat(201))).toEqual({
      status: 400,
      body: errorBody('message_invalid'),
    });
    expect((await send(owner, roomId, 'çok sıkıldım, sık sık gelelim')).status).toBe(200);
    expect(await messages(owner, roomId)).toHaveLength(1);
  });

  it('allows one message per second per table', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    expect((await send(owner, roomId, 'bir')).status).toBe(200);
    expect(await send(owner, roomId, 'iki')).toEqual({
      status: 429,
      body: errorBody('rate_limited'),
    });
    expect((await send(guest, roomId, 'misafir')).status).toBe(200);
    await sleep(1100);
    expect((await send(owner, roomId, 'üç')).status).toBe(200);
  });

  it('refuses non-members and closed rooms', async () => {
    const { owner, third, roomId } = await roomWithGuest();
    expect(await send(third, roomId, 'selam')).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
    await invoke(owner, 'rooms', { action: 'end' });
    expect(await send(owner, roomId, 'selam')).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
  });

  it('never shows a new guest what an earlier guest wrote', async () => {
    const { owner, guest, third, roomId } = await roomWithGuest();
    await send(guest, roomId, 'eski misafir');
    await invoke(guest, 'rooms', { action: 'leave' });
    await invoke(third, 'rooms', { action: 'request-join', roomId });
    const [request] =
      await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
    await invoke(owner, 'rooms', { action: 'respond', requestId: request?.id, accept: true });
    await send(owner, roomId, 'yeni misafire');

    expect((await messages(third, roomId)).map((m) => m.body)).toEqual(['yeni misafire']);
    expect((await messages(owner, roomId)).map((m) => m.body)).toEqual([
      'eski misafir',
      'yeni misafire',
    ]);
  });
});

describe('safety/report', () => {
  it('stores the last 50 messages and the reported account, hidden from clients', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    const [room] =
      await sql`select owner_session_id, guest_session_id, owner_alias from public.rooms where id = ${roomId}`;
    for (let i = 1; i <= 60; i++) {
      await sql`
        insert into public.messages (room_id, session_id, sender_alias, body, created_at)
        values (${roomId}, ${room?.owner_session_id}, ${room?.owner_alias}, ${`mesaj ${i}`}, now() + make_interval(secs => ${i}))
      `;
    }
    expect(
      await invoke(guest, 'safety', { action: 'report', roomId, reason: 'harassment' }),
    ).toEqual({
      status: 200,
      body: { ok: true },
    });

    const [report] = await sql`select * from public.reports where room_id = ${roomId}`;
    expect(report).toMatchObject({
      reporter_id: await userIdOf(guest),
      reported_user_id: await userIdOf(owner),
      reason: 'harassment',
      status: 'open',
    });
    const snapshot = report?.messages_snapshot as { body: string; alias: string }[];
    expect(snapshot).toHaveLength(50);
    expect(snapshot[0]?.body).toBe('mesaj 11');
    expect(snapshot[49]?.body).toBe('mesaj 60');

    const { error } = await guest.from('reports').select('id');
    expect(error?.code).toBe('42501');
  });

  it('validates the reason', async () => {
    const { guest, roomId } = await roomWithGuest();
    expect(
      (await invoke(guest, 'safety', { action: 'report', roomId, reason: 'nope' })).status,
    ).toBe(400);
  });
});

describe('safety/block and unblock', () => {
  it('blocks the other account, takes the blocker out of the room, and can be undone', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    const [room] = await sql`select guest_alias from public.rooms where id = ${roomId}`;
    expect(await invoke(owner, 'safety', { action: 'block', roomId })).toEqual({
      status: 200,
      body: { ok: true },
    });

    const { data: blocks } = await owner.from('blocks').select('blocked_id, blocked_alias');
    expect(blocks).toEqual([
      { blocked_id: await userIdOf(guest), blocked_alias: room?.guest_alias },
    ]);
    expect((await guest.from('blocks').select('blocked_id')).data).toEqual([]);
    const [after] = await sql`select status from public.rooms where id = ${roomId}`;
    expect(after?.status).toBe('closed');

    const blockedId = blocks?.[0]?.blocked_id;
    expect(await invoke(owner, 'safety', { action: 'unblock', blockedId })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect((await owner.from('blocks').select('blocked_id')).data).toEqual([]);
  });

  it('needs another table in the room', async () => {
    const [owner] = [await onboarded(PHONES[0])];
    await checkInAt(owner, venue, V);
    const created = await invoke(owner, 'rooms', {
      action: 'create',
      concept: 'tabu',
      visibility: 'private',
    });
    const roomId = (created.body as { roomId: string }).roomId;
    expect(await invoke(owner, 'safety', { action: 'block', roomId })).toEqual({
      status: 409,
      body: errorBody('nothing_to_block'),
    });
  });
});

describe('cleanup jobs', () => {
  it('deletes messages 24 hours after the room closed and reports after 30 days', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    await send(owner, roomId, 'silinecek');
    await invoke(guest, 'safety', { action: 'report', roomId, reason: 'spam' });
    await invoke(owner, 'rooms', { action: 'end' });

    await sql`update public.rooms set closed_at = now() - interval '23 hours' where id = ${roomId}`;
    await sql`select private.delete_old_messages()`;
    expect(await sql`select 1 from public.messages where room_id = ${roomId}`).toHaveLength(1);

    await sql`update public.rooms set closed_at = now() - interval '25 hours' where id = ${roomId}`;
    await sql`select private.delete_old_messages()`;
    expect(await sql`select 1 from public.messages where room_id = ${roomId}`).toHaveLength(0);
    // The report keeps its copy after the messages are gone.
    const [report] =
      await sql`select messages_snapshot from public.reports where room_id = ${roomId}`;
    expect((report?.messages_snapshot as unknown[]).length).toBe(1);

    await sql`update public.reports set created_at = now() - interval '31 days' where room_id = ${roomId}`;
    await sql`select private.delete_old_reports()`;
    expect(await sql`select 1 from public.reports where room_id = ${roomId}`).toHaveLength(0);

    const jobs =
      await sql`select jobname, schedule from cron.job where jobname like 'delete-old-%' order by jobname`;
    expect(jobs.map((j) => [j.jobname, j.schedule])).toEqual([
      ['delete-old-messages', '0 * * * *'],
      ['delete-old-reports', '0 * * * *'],
    ]);
  });
});
