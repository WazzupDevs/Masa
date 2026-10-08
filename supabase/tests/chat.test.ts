import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';

import { BROADCAST, messagesChannel } from '../functions/_shared/pure/rooms.ts';
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
  const created = await invoke(owner, 'rooms', { action: 'create', profiled: false });
  const roomId = (created.body as { roomId: string }).roomId;
  await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false });
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
        .channel(`messages:${roomId}`, { config: { private: true } })
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
    // "Odayı bitir", then the window closes: the room is closed for both tables.
    await invoke(owner, 'rooms', { action: 'end' });
    await sql`update public.rooms set reveal_ends_at = now() where id = ${roomId}`;
    await invoke(owner, 'reveal', { action: 'finalize', roomId });
    expect(await send(owner, roomId, 'selam')).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
  });

  // v3: a table leaving ends the encounter (docs/SPEC_V3.md §5.5); the room never takes another
  // guest, so no later table can read what was written.
  it('never lets another table into a room after its guest left', async () => {
    const { guest, third, roomId } = await roomWithGuest();
    await send(guest, roomId, 'eski misafir');
    await invoke(guest, 'checkin', { action: 'leave' });
    expect(
      await invoke(third, 'rooms', { action: 'request-join', roomId, profiled: false }),
    ).toEqual({ status: 409, body: errorBody('room_not_available') });
    expect(await messages(third, roomId)).toEqual([]);
  });
});

describe('room chat replies and reactions (docs/SPEC_V3.md §21)', () => {
  const OK = { status: 200, body: { ok: true } };
  const sendReply = (client: Client, roomId: string, body: string, replyTo: string) =>
    invoke(client, 'chat', { action: 'send', roomId, body, replyTo });
  const react = (client: Client, messageId: string, emoji: string | null) =>
    invoke(client, 'chat', { action: 'react', messageId, emoji });
  const extras = async (client: Client, roomId: string) => {
    const { data, error } = await client.rpc('room_chat_extras', { target_room_id: roomId });
    expect(error).toBeNull();
    return Object.fromEntries((data ?? []).map((r) => [r.message_id, r]));
  };
  const aliases = async (roomId: string) => {
    const [room] =
      await sql`select owner_alias, guest_alias from public.rooms where id = ${roomId}`;
    return { owner: room?.owner_alias as string, guest: room?.guest_alias as string };
  };

  it('quotes a message of the room by its table alias; nothing from outside the room', async () => {
    const { owner, guest, third, roomId } = await roomWithGuest();
    const names = await aliases(roomId);
    const first = await send(owner, roomId, 'Yarın aynı yerde mi?');
    const firstId = (first.body as { messageId: string }).messageId;
    const reply = await sendReply(guest, roomId, 'Olur', firstId);
    expect(reply.status).toBe(200);
    const replyId = (reply.body as { messageId: string }).messageId;

    const quote = { id: firstId, body: 'Yarın aynı yerde mi?', name: names.owner };
    expect((await extras(owner, roomId))[replyId]?.reply_to).toEqual({ ...quote, from_me: true });
    expect((await extras(guest, roomId))[replyId]?.reply_to).toEqual({ ...quote, from_me: false });
    // The messages carry the reply too (RLS read), and nobody outside the room gets extras.
    const { data: rows } = await owner
      .from('messages')
      .select('reply_to_id, replied')
      .eq('id', replyId);
    expect(rows).toEqual([{ reply_to_id: firstId, replied: true }]);
    expect(await extras(third, roomId)).toEqual({});

    await sleep(1100);
    const unavailable = { status: 409, body: errorBody('reply_unavailable') };
    expect(await sendReply(owner, roomId, 'x', randomUUID())).toEqual(unavailable);
    // A message from before the guest joined: the guest cannot quote it, and sees a reply to it
    // as gone.
    const [old] = await sql`
      insert into public.messages (room_id, session_id, sender_alias, body, created_at)
      select ${roomId}, owner_session_id, owner_alias, 'eski', guest_joined_at - interval '1 minute'
      from public.rooms where id = ${roomId}
      returning id
    `;
    expect(await sendReply(guest, roomId, 'x', old?.id)).toEqual(unavailable);
    const toOld = await sendReply(owner, roomId, 'hatırladın mı', old?.id);
    const toOldId = (toOld.body as { messageId: string }).messageId;
    expect((await extras(guest, roomId))[toOldId]?.reply_to).toEqual({ gone: true });
    expect((await extras(owner, roomId))[toOldId]?.reply_to).toMatchObject({ body: 'eski' });

    // The quoted message deleted.
    await sql`delete from public.messages where id = ${firstId}`;
    expect((await extras(owner, roomId))[replyId]?.reply_to).toEqual({ gone: true });
  });

  it('keeps one reaction per table, named by the table aliases, the same when sent twice', async () => {
    const { owner, guest, third, roomId } = await roomWithGuest();
    const names = await aliases(roomId);
    const sentOwner = await send(owner, roomId, 'selam');
    const messageId = (sentOwner.body as { messageId: string }).messageId;

    const heard = waitForBroadcast(owner, messagesChannel(roomId), BROADCAST.reaction);
    await heard.subscribed;
    expect(await react(guest, messageId, '👍')).toEqual(OK);
    await heard.received;
    await heard.close();
    expect(await react(guest, messageId, '👍')).toEqual(OK);
    expect(await react(owner, messageId, '👍')).toEqual(OK);
    expect((await extras(owner, roomId))[messageId]?.reactions).toEqual([
      { emoji: '👍', count: 2, aliases: [names.guest, names.owner], mine: true },
    ]);
    expect(await react(guest, messageId, '🔥')).toEqual(OK);
    expect(await react(owner, messageId, null)).toEqual(OK);
    expect((await extras(owner, roomId))[messageId]?.reactions).toEqual([
      { emoji: '🔥', count: 1, aliases: [names.guest], mine: false },
    ]);
    expect((await extras(guest, roomId))[messageId]?.reactions).toEqual([
      { emoji: '🔥', count: 1, aliases: [names.guest], mine: true },
    ]);

    expect(await react(guest, messageId, '💩')).toEqual({
      status: 400,
      body: errorBody('bad_request'),
    });
    expect(await react(third, messageId, '👍')).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
    expect(await react(guest, randomUUID(), '👍')).toEqual({
      status: 404,
      body: errorBody('not_found'),
    });
    // No account id anywhere in what a table reads.
    const seen = JSON.stringify(await extras(owner, roomId));
    expect(seen).not.toContain(await userIdOf(guest));

    await sql`delete from public.messages where id = ${messageId}`;
    expect(await sql`select count(*)::int as n from public.message_reactions`).toEqual([{ n: 0 }]);
  });

  // chat_react (docs/SPEC_V3.md §21.3): the table and the room, then the message's reactions.
  it('reacts only after taking the room', async () => {
    const { owner, guest, roomId } = await roomWithGuest();
    const sentOwner = await send(owner, roomId, 'selam');
    const messageId = (sentOwner.body as { messageId: string }).messageId;
    expect(await react(guest, messageId, '👍')).toEqual(OK);
    const guestId = await userIdOf(guest);

    const holder = postgres(dbUrl, { max: 1, onnotice: () => {} });
    const reacting = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      let reacted: Promise<unknown> = Promise.resolve();
      await holder.begin(async (tx) => {
        await tx`select id from public.rooms where id = ${roomId} for update`;
        reacted = reacting`select changed from public.chat_react(${guestId}, ${messageId}, '🔥')`
          .execute()
          .catch((err: unknown) => err);
        await waitUntilBlocked('chat_react');
        await tx`set local lock_timeout = '2s'`;
        const held = await tx`
          select emoji from public.message_reactions where message_id = ${messageId} for update
        `;
        expect(held).toHaveLength(1);
      });
      expect(await reacted).toEqual([{ changed: true }]);
    } finally {
      await Promise.all([holder.end(), reacting.end()]);
    }
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
  it('blocks the other account, ends the room like "Hayır", and can be undone', async () => {
    const { owner, guest, third, roomId } = await roomWithGuest();
    const [room] = await sql`select guest_alias from public.rooms where id = ${roomId}`;
    expect(await invoke(owner, 'safety', { action: 'block', roomId })).toEqual({
      status: 200,
      body: { ok: true },
    });

    const [row] = await sql`select id, blocked_id from public.blocks`;
    expect(row?.blocked_id).toBe(await userIdOf(guest));
    const { data: blocks } = await owner.from('blocks').select('id, blocked_alias, created_at');
    expect(blocks).toEqual([
      { id: row?.id, blocked_alias: room?.guest_alias, created_at: expect.any(String) },
    ]);
    expect((await guest.from('blocks').select('id')).data).toEqual([]);
    // docs/SPEC_V3.md §5.5 (S5): the window opens and the blocker's answer is "Hayır".
    const [after] = await sql`select status from public.rooms where id = ${roomId}`;
    expect(after?.status).toBe('ending');
    expect(
      await sql`select wants_meet from public.reveal_decisions where room_id = ${roomId}`,
    ).toEqual([{ wants_meet: false }]);

    // Someone else's block id does nothing.
    expect(await invoke(third, 'safety', { action: 'unblock', blockId: row?.id })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await sql`select 1 from public.blocks`).toHaveLength(1);

    expect(await invoke(owner, 'safety', { action: 'unblock', blockId: row?.id })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect((await owner.from('blocks').select('id')).data).toEqual([]);
  });

  // Rule 4: the blocked account's id never reaches the blocker's client.
  it('never shows the blocked account id to the client', async () => {
    const { owner, roomId } = await roomWithGuest();
    await invoke(owner, 'safety', { action: 'block', roomId });
    expect((await owner.from('blocks').select('blocked_id')).error?.code).toBe('42501');
    expect((await owner.from('blocks').select('*')).error?.code).toBe('42501');
  });

  it('needs another table in the room', async () => {
    const [owner] = [await onboarded(PHONES[0])];
    await checkInAt(owner, venue, V);
    const created = await invoke(owner, 'rooms', { action: 'create-solo' });
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
    await sql`update public.rooms set reveal_ends_at = now() where id = ${roomId}`;
    await invoke(owner, 'reveal', { action: 'finalize', roomId });

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
      // The venue chat's own job (venueChat.test.ts checks its command).
      ['delete-old-venue-chat', '17 * * * *'],
    ]);
  });
});
