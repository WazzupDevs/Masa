// Venue chat room (docs/SPEC_V3.md §7, §13 step 5): only accounts with a live table at the venue
// read, write and subscribe; a profiled message never carries its table alias; reports, hiding,
// blocks, the profile and friend requests go through the message, never a profile or account id.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { VENUE_CHAT, venueChatChannel } from '../functions/_shared/pure/venueChat.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import type { VenueChatPageResponse } from '../functions/_shared/pure/api/venueChat.ts';
import { checkInAt, errorBody, onboarded, PHONES, setTestPhoto, TEST_AGE } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

let venue: Record<string, string> = {};
const V = 'at-anchor';
const OK = { status: 200, body: { ok: true } };

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

// Three accounts at the venue: Ayşe, Burak and Cem, each with a live table.
async function threeAtVenue() {
  const [a, b, c] = (await Promise.all([
    onboarded(PHONES[0], { displayName: 'Ayşe' }),
    onboarded(PHONES[1], { displayName: 'Burak' }),
    onboarded(PHONES[2], { displayName: 'Cem' }),
  ])) as [Client, Client, Client];
  const tables = [];
  for (const client of [a, b, c]) tables.push(await checkInAt(client, venue, V));
  return { a, b, c, aliases: tables.map((t) => t.alias) as [string, string, string] };
}

// Sends without waiting out the 3-second limit (the limit has its own test).
async function send(client: Client, body: string, profiled = false) {
  await sql`update public.venue_chat_rate set last_sent_at = '-infinity'`;
  return (await invoke(client, 'venue-chat', {
    action: 'send',
    venueId: venue[V],
    body,
    profiled,
  })) as { status: number; body: { messageId: string } };
}

async function page(client: Client) {
  const { data, error } = await client.rpc('venue_chat_page', { target_venue_id: venue[V] ?? '' });
  if (error) throw error;
  return data;
}

// The page as the app reads it (docs/SPEC_V3.md §7.2): through the function, photos signed.
async function fnPage(client: Client, before?: string) {
  const res = await invoke(client, 'venue-chat', {
    action: 'page',
    venueId: venue[V],
    ...(before ? { before } : {}),
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as VenueChatPageResponse).messages;
}

const report = (client: Client, messageId: string) =>
  invoke(client, 'safety', { action: 'report', target: 'venue_chat', messageId, reason: 'spam' });

describe('venue chat: who reads and writes', () => {
  it('lets only accounts with a live table at the venue read and write', async () => {
    const { a, b } = await threeAtVenue();
    expect((await send(a, 'Merhaba mekan')).status).toBe(200);
    expect((await page(b)).map((m) => m.body)).toEqual(['Merhaba mekan']);

    // Another venue: nothing to read, nothing to write here.
    await checkInAt(b, venue, 'near');
    expect(await page(b)).toEqual([]);
    expect(
      await invoke(b, 'venue-chat', {
        action: 'send',
        venueId: venue[V],
        body: 'x',
        profiled: false,
      }),
    ).toEqual({ status: 409, body: errorBody('no_active_table') });

    // Leaving the venue ends access at once, history included.
    await invoke(a, 'checkin', { action: 'leave' });
    expect(await page(a)).toEqual([]);
    // An expired table too.
    const c = (await onboarded(PHONES[2])) as Client;
    await checkInAt(c, venue, V);
    expect(await page(c)).toHaveLength(1);
    await sql`update public.table_sessions set expires_at = now() - interval '1 second'
              where user_id = ${await userIdOf(c)}`;
    expect(await page(c)).toEqual([]);
  });

  it('lets only the venue subscribe to venue_chat:, and no client send on it', async () => {
    const { a } = await threeAtVenue();
    const outsider = await onboarded(PHONES[2]);
    await checkInAt(outsider, venue, 'near');
    const topic = venueChatChannel(venue[V] ?? '');
    const allowed = await sql`
      select private.realtime_topic_allowed(${topic}, false) as read,
             private.realtime_topic_allowed(${topic}, true) as write
    `.then(async () => {
      const read = async (client: Client) => {
        const ch = client.channel(topic, { config: { private: true } });
        const status = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
          ch.subscribe((s) => {
            if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
              clearTimeout(timer);
              resolve(s);
            }
          });
        });
        await client.removeChannel(ch);
        return status;
      };
      return { member: await read(a), outsider: await read(outsider) };
    });
    expect(allowed).toEqual({ member: 'SUBSCRIBED', outsider: 'CHANNEL_ERROR' });

    // Policy check for sending, as the member's JWT would run it.
    const uid = await userIdOf(a);
    const [row] = await sql.begin(async (tx) => {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: uid })}, true)`;
      return tx`select private.realtime_topic_allowed(${topic}, true) as send,
                       private.realtime_topic_allowed(${topic}, false) as read`;
    });
    expect(row).toEqual({ send: false, read: true });
  });

  it('rejects profanity, empty and long messages, and limits the rate', async () => {
    const { a } = await threeAtVenue();
    expect((await send(a, 'amk bu ne')).body).toEqual(errorBody('profanity_rejected'));
    expect((await send(a, '   ')).body).toEqual(errorBody('message_invalid'));
    expect((await send(a, 'a'.repeat(201))).body).toEqual(errorBody('message_invalid'));
    // Gündelik kelimeler geçer.
    expect((await send(a, 'sık sık geliriz')).status).toBe(200);

    // One per 3 seconds.
    await sql`update public.venue_chat_rate set last_sent_at = '-infinity'`;
    const first = await invoke(a, 'venue-chat', {
      action: 'send',
      venueId: venue[V],
      body: 'bir',
      profiled: false,
    });
    expect(first.status).toBe(200);
    expect(
      await invoke(a, 'venue-chat', {
        action: 'send',
        venueId: venue[V],
        body: 'iki',
        profiled: false,
      }),
    ).toEqual({ status: 429, body: errorBody('too_soon') });

    // At most 20 in 10 minutes.
    await sql`update public.venue_chat_rate
              set count = ${VENUE_CHAT.windowMax}, last_sent_at = '-infinity'`;
    expect(
      await invoke(a, 'venue-chat', {
        action: 'send',
        venueId: venue[V],
        body: 'üç',
        profiled: false,
      }),
    ).toEqual({ status: 429, body: errorBody('rate_limited') });
    await sql`update public.venue_chat_rate set window_started_at = now() - interval '11 minutes'`;
    expect((await send(a, 'dört')).status).toBe(200);
  });
});

describe('venue chat: anonymous and profiled messages', () => {
  it('shows the alias of an anonymous message and only the name of a profiled one', async () => {
    const { a, b, aliases } = await threeAtVenue();
    await send(a, 'anonim yazıyorum');
    await send(a, 'adımla yazıyorum', true);
    const seen = await page(b);
    expect(seen).toEqual([
      expect.objectContaining({
        body: 'adımla yazıyorum',
        profiled: true,
        display_name: 'Ayşe',
        sender_alias: null,
        from_me: false,
      }),
      expect.objectContaining({
        body: 'anonim yazıyorum',
        profiled: false,
        display_name: null,
        sender_alias: aliases[0],
        from_me: false,
      }),
    ]);
    expect(Object.keys(seen[0] ?? {}).sort()).toEqual(
      ['body', 'created_at', 'display_name', 'from_me', 'id', 'profiled', 'sender_alias'].sort(),
    );
    expect((await page(a)).every((m) => m.from_me)).toBe(true);
  });

  it('never gives a profiled sender’s alias, account id or public_id anywhere', async () => {
    const { a, b, aliases } = await threeAtVenue();
    const [uidA] = [await userIdOf(a)];
    const { data: own } = await a.from('profiles').select('public_id').single();
    const sent = await send(a, 'merhaba', true);
    const messageId = sent.body.messageId;

    const channel = b.channel(venueChatChannel(venue[V] ?? ''), { config: { private: true } });
    const payloads: unknown[] = [];
    channel.on('broadcast', { event: '*' }, (msg) => payloads.push(msg));
    await new Promise<void>((resolve) =>
      channel.subscribe((s) => {
        if (s === 'SUBSCRIBED') resolve();
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await send(a, 'ikinci', true);
    await expect.poll(() => payloads.length, { timeout: 8000 }).toBeGreaterThan(0);
    await b.removeChannel(channel);

    const seen = JSON.stringify([
      await page(b),
      payloads,
      await invoke(b, 'profile', { action: 'get', venueChatMessageId: messageId }),
      await invoke(b, 'friends', { action: 'request', venueChatMessageId: messageId }),
      await invoke(a, 'friends', { action: 'incoming' }),
      await invoke(b, 'friends', { action: 'incoming' }),
      (await b.rpc('my_sent_venue_chat_requests')).data,
      (await a.rpc('my_sent_venue_chat_requests')).data,
    ]);
    expect(seen).not.toContain(aliases[0]);
    expect(seen).not.toContain(uidA);
    expect(seen).not.toContain(own?.public_id ?? 'missing');
    // The broadcast carries no data.
    expect(payloads).toEqual([expect.objectContaining({ event: 'venue_chat', payload: {} })]);
  });
});

describe('venue chat: photos (venue-chat/page)', () => {
  it('signs the photo of a profiled message and never gives an anonymous one a photo path', async () => {
    const { a, b, aliases } = await threeAtVenue();
    const path = await setTestPhoto(a);
    await send(a, 'anonim yazıyorum');
    await send(a, 'adımla yazıyorum', true);

    // The RPC behind the function: a path only on the profiled message.
    const rows = await sql`
      select body, photo_path, sender_alias
      from public.venue_chat_page_for(${await userIdOf(b)}, ${venue[V] ?? ''})
    `;
    expect(rows).toEqual([
      { body: 'adımla yazıyorum', photo_path: path, sender_alias: null },
      { body: 'anonim yazıyorum', photo_path: null, sender_alias: aliases[0] },
    ]);

    const seen = await fnPage(b);
    expect(seen).toEqual([
      {
        id: expect.any(String),
        profiled: true,
        senderAlias: null,
        displayName: 'Ayşe',
        photoUrl: expect.stringContaining('token='),
        body: 'adımla yazıyorum',
        createdAt: expect.any(String),
        fromMe: false,
      },
      {
        id: expect.any(String),
        profiled: false,
        senderAlias: aliases[0],
        displayName: null,
        photoUrl: null,
        body: 'anonim yazıyorum',
        createdAt: expect.any(String),
        fromMe: false,
      },
    ]);
    // Nothing of the photo rides on the anonymous message.
    expect(JSON.stringify(seen[1])).not.toContain(path);
    // Older messages: before the newest one's time.
    expect((await fnPage(b, seen[0]?.createdAt)).map((m) => m.body)).toEqual(['anonim yazıyorum']);
    // The same page however often it is read (apiRetry: venue-chat/page).
    const again = await fnPage(b);
    expect(again.map(({ photoUrl, ...m }) => ({ ...m, photo: photoUrl !== null }))).toEqual(
      seen.map(({ photoUrl, ...m }) => ({ ...m, photo: photoUrl !== null })),
    );
  });

  it('gives no photo while it is hidden, and nothing without a live table at the venue', async () => {
    const { a, b } = await threeAtVenue();
    await setTestPhoto(a);
    await send(a, 'adımla yazıyorum', true);
    await sql`update public.profiles set photo_hidden_at = now() where id = ${await userIdOf(a)}`;
    expect(await fnPage(b)).toEqual([
      expect.objectContaining({ displayName: 'Ayşe', photoUrl: null }),
    ]);

    expect(await invoke(b, 'checkin', { action: 'leave' })).toEqual(OK);
    expect(await fnPage(b)).toEqual([]);
  });
});

describe('venue chat: profile through the message', () => {
  it('opens the profile of a profiled sender: name, age, bio, badges, no public_id', async () => {
    const { a, b } = await threeAtVenue();
    await invoke(a, 'profile', { action: 'update', bio: 'Kampüsteyim' });
    const { messageId } = (await send(a, 'merhaba', true)).body;
    const res = await invoke(b, 'profile', { action: 'get', venueChatMessageId: messageId });
    expect(res).toEqual({
      status: 200,
      body: { displayName: 'Ayşe', bio: 'Kampüsteyim', photoUrl: null, badges: [], age: TEST_AGE },
    });
  });

  it('answers not_found alike for anonymous, hidden, blocked, absent and unknown', async () => {
    const { a, b, c } = await threeAtVenue();
    const notFound = await invoke(b, 'profile', {
      action: 'get',
      venueChatMessageId: randomUUID(),
    });
    expect(notFound).toEqual({ status: 404, body: errorBody('not_found') });
    const same = async (client: Client, messageId: string) =>
      expect(
        await invoke(client, 'profile', { action: 'get', venueChatMessageId: messageId }),
      ).toEqual(notFound);

    const anonymous = (await send(a, 'anonim')).body.messageId;
    await same(b, anonymous);

    const hidden = (await send(a, 'gizlenecek', true)).body.messageId;
    await sql`update public.venue_chat_messages set hidden_at = now() where id = ${hidden}`;
    await same(b, hidden);

    const blocked = (await send(c, 'engellenecek', true)).body.messageId;
    expect(await invoke(b, 'safety', { action: 'block', venueChatMessageId: blocked })).toEqual(OK);
    await same(b, blocked);

    const profiled = (await send(a, 'profilli', true)).body.messageId;
    await invoke(b, 'checkin', { action: 'leave' });
    await same(b, profiled);
  });
});

describe('venue chat: reports, hiding and blocks', () => {
  it('copies the last 50 visible messages with the report', async () => {
    await sql`delete from public.reports`;
    const { a, b } = await threeAtVenue();
    for (let i = 1; i <= 52; i++) {
      await sql`
        insert into public.venue_chat_messages
          (venue_id, session_id, sender_user_id, sender_alias, profiled, body, created_at)
        select venue_id, id, user_id, alias, false, ${`mesaj ${i}`}, now() - make_interval(secs => ${60 - i})
        from public.table_sessions where user_id = ${await userIdOf(a)} and status = 'active'
      `;
    }
    const reported = (await send(a, 'şikayet edilecek', true)).body.messageId;
    expect(await report(b, reported)).toEqual(OK);
    const [row] = await sql`
      select target_type, reported_user_id, venue_chat_message_id, messages_snapshot
      from public.reports
    `;
    expect(row).toMatchObject({
      target_type: 'venue_chat',
      reported_user_id: await userIdOf(a),
      venue_chat_message_id: reported,
    });
    const snapshot = row?.messages_snapshot as { body: string; display_name: string | null }[];
    expect(snapshot).toHaveLength(VENUE_CHAT.reportSnapshotSize);
    expect(snapshot.at(-1)).toMatchObject({ body: 'şikayet edilecek', display_name: 'Ayşe' });
    expect(snapshot[0]?.body).toBe('mesaj 4');
  });

  it('hides after 3 different accounts, not 3 reports from one; the sender still sees it', async () => {
    const { a, b, c } = await threeAtVenue();
    const messageId = (await send(a, 'rahatsız edici')).body.messageId;

    // The same account three times, and the sender itself: not hidden.
    for (let i = 0; i < 3; i++) expect(await report(b, messageId)).toEqual(OK);
    expect(await report(a, messageId)).toEqual(OK);
    expect((await page(c)).map((m) => m.id)).toContain(messageId);

    // Only three test numbers exist: one more reporter is an account made in the database.
    const extra = randomUUID();
    await sql`
      insert into auth.users (id, instance_id, aud, role)
      values (${extra}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
    `;
    await sql`insert into public.venue_chat_reports (message_id, reporter_user_id)
              values (${messageId}, ${extra})`;
    // b, the extra account, and now c: three different accounts.
    expect(await report(c, messageId)).toEqual(OK);
    await sql`delete from auth.users where id = ${extra}`;

    expect((await page(b)).map((m) => m.id)).not.toContain(messageId);
    expect((await page(c)).map((m) => m.id)).not.toContain(messageId);
    // The sender cannot tell its own message was hidden.
    expect((await page(a)).map((m) => m.id)).toContain(messageId);
  });

  it('blocks both ways; the list shows the name of a profiled sender, never its alias', async () => {
    const { a, b, aliases } = await threeAtVenue();
    const anon = (await send(a, 'anonim')).body.messageId;
    const profiled = (await send(a, 'profilli', true)).body.messageId;
    expect(await invoke(b, 'safety', { action: 'block', venueChatMessageId: profiled })).toEqual(
      OK,
    );
    const blocks = await b.from('blocks').select('blocked_alias');
    expect(blocks.data).toEqual([{ blocked_alias: 'Ayşe' }]);
    expect(JSON.stringify(blocks.data)).not.toContain(aliases[0]);
    // Neither sees the other's messages.
    expect(await page(b)).toEqual([]);
    await send(b, 'beni görmemeli');
    expect((await page(a)).map((m) => m.id).sort()).toEqual([anon, profiled].sort());
    // An anonymous message's block keeps the alias.
    for (const phone of PHONES) await deleteUserByPhone(phone);
    const again = await threeAtVenue();
    const anon2 = (await send(again.a, 'anonim')).body.messageId;
    await invoke(again.b, 'safety', { action: 'block', venueChatMessageId: anon2 });
    expect((await again.b.from('blocks').select('blocked_alias')).data).toEqual([
      { blocked_alias: again.aliases[0] },
    ]);
  });

  it('deletes messages after 24 hours and keeps the report copy', async () => {
    // Reports outlive their accounts (reporter set null); start from none.
    await sql`delete from public.reports`;
    const { a, b } = await threeAtVenue();
    const messageId = (await send(a, 'eski mesaj')).body.messageId;
    expect(await report(b, messageId)).toEqual(OK);
    await sql`update public.venue_chat_messages set created_at = now() - interval '25 hours'`;
    await sql`select private.delete_old_venue_chat(${VENUE_CHAT.keepHours})`;
    expect(await sql`select 1 from public.venue_chat_messages`).toHaveLength(0);
    const [row] = await sql`select messages_snapshot, venue_chat_message_id from public.reports`;
    expect(row?.venue_chat_message_id).toBeNull();
    expect(JSON.stringify(row?.messages_snapshot)).toContain('eski mesaj');
    // The job runs hourly with the same number as pure/venueChat.ts.
    const [job] =
      await sql`select schedule, command from cron.job where jobname = 'delete-old-venue-chat'`;
    expect(job).toEqual({
      schedule: '17 * * * *',
      command: `select private.delete_old_venue_chat(${VENUE_CHAT.keepHours})`,
    });
  });
});

describe('venue chat: friend requests', () => {
  it('sends from a profiled message; the recipient sees name, age and photo, then accepts', async () => {
    const { a, b } = await threeAtVenue();
    const messageId = (await send(a, 'merhaba', true)).body.messageId;
    expect(
      await invoke(b, 'friends', { action: 'request', venueChatMessageId: messageId }),
    ).toEqual(OK);
    const incoming = (await invoke(a, 'friends', { action: 'incoming' })) as {
      body: { requests: Record<string, unknown>[] };
    };
    expect(incoming.body.requests).toEqual([
      {
        requestId: expect.any(String),
        venueName: 'Test Kafe Çapa',
        displayName: 'Burak',
        age: TEST_AGE,
        photoUrl: null,
        createdAt: expect.any(String),
      },
    ]);
    // The sender sees the name the other side showed, pending.
    expect((await b.rpc('my_sent_venue_chat_requests')).data).toEqual([
      expect.objectContaining({ to_name: 'Ayşe', status: 'pending' }),
    ]);
    const requestId = incoming.body.requests[0]?.requestId;
    expect(await invoke(a, 'friends', { action: 'respond', requestId, accept: true })).toEqual(OK);
    expect(await sql`select source from public.friendships`).toEqual([{ source: 'request' }]);
    expect((await b.rpc('my_sent_venue_chat_requests')).data).toEqual([
      expect.objectContaining({ status: 'accepted' }),
    ]);
    // Already friends.
    expect(
      await invoke(b, 'friends', { action: 'request', venueChatMessageId: messageId }),
    ).toEqual({ status: 409, body: errorBody('already_friends') });
  });

  it('swallows a request to an anonymous message, a decline stays pending, a block swallows', async () => {
    const { a, b, c } = await threeAtVenue();
    const anon = (await send(a, 'anonim')).body.messageId;
    expect(await invoke(b, 'friends', { action: 'request', venueChatMessageId: anon })).toEqual(OK);
    expect(await sql`select 1 from public.friend_requests`).toHaveLength(0);

    const profiled = (await send(a, 'profilli', true)).body.messageId;
    await invoke(b, 'friends', { action: 'request', venueChatMessageId: profiled });
    const [req] = (
      (await invoke(a, 'friends', { action: 'incoming' })) as {
        body: { requests: { requestId: string }[] };
      }
    ).body.requests;
    await invoke(a, 'friends', { action: 'respond', requestId: req?.requestId, accept: false });
    // A new request after the decline: swallowed, still pending for the sender.
    expect(await invoke(b, 'friends', { action: 'request', venueChatMessageId: profiled })).toEqual(
      OK,
    );
    expect((await b.rpc('my_sent_venue_chat_requests')).data).toEqual([
      expect.objectContaining({ status: 'pending' }),
    ]);
    expect(await sql`select status from public.friend_requests`).toEqual([{ status: 'declined' }]);

    // Blocked from a request: nothing more comes through.
    const fromC = (await send(c, 'cem', true)).body.messageId;
    await invoke(a, 'friends', { action: 'request', venueChatMessageId: fromC });
    const [toC] = (
      (await invoke(c, 'friends', { action: 'incoming' })) as {
        body: { requests: { requestId: string }[] };
      }
    ).body.requests;
    expect(
      await invoke(c, 'safety', {
        action: 'block',
        friendRequestId: toC?.requestId,
        report: 'spam',
      }),
    ).toEqual(OK);
    expect((await c.from('blocks').select('blocked_alias')).data).toEqual([
      { blocked_alias: 'Ayşe' },
    ]);
    expect((await invoke(c, 'friends', { action: 'incoming' })) as { body: unknown }).toMatchObject(
      { body: { requests: [] } },
    );
  });

  it('answers ok over the daily limit and writes nothing', async () => {
    const { a, b } = await threeAtVenue();
    const uidB = await userIdOf(b);
    // Ten requests today already (to other accounts in the table; fake recipients).
    for (let i = 0; i < VENUE_CHAT.dailyFriendRequests; i++) {
      const id = randomUUID();
      await sql`
        insert into auth.users (id, instance_id, aud, role)
        values (${id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
      `;
      await sql`
        insert into public.friend_requests (from_user_id, to_user_id, source, venue_chat_context)
        values (${uidB}, ${id}, 'venue_chat', '{}'::jsonb)
      `;
    }
    const messageId = (await send(a, 'merhaba', true)).body.messageId;
    expect(
      await invoke(b, 'friends', { action: 'request', venueChatMessageId: messageId }),
    ).toEqual(OK);
    expect(
      await sql`select 1 from public.friend_requests where to_user_id = ${await userIdOf(a)}`,
    ).toHaveLength(0);
    // The sender still sees it waiting, like any other request (rule 5).
    expect((await b.rpc('my_sent_venue_chat_requests')).data).toEqual([
      expect.objectContaining({ to_name: 'Ayşe', status: 'pending' }),
    ]);
    await sql`
      delete from auth.users where id in (
        select to_user_id from public.friend_requests where from_user_id = ${uidB}
      )
    `;
  });
});
