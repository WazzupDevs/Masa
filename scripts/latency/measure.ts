// DM and venue chat latency, step by step (saha testi, adım 9.1): from the moment one phone sends
// until the other phone has the message on screen. Two test accounts play the two phones in one
// process, so both ends read the same clock.
//
// Runs only against the local stack or the hosted dev project, like the E2E bot: the public Edge
// Function API, the publishable key and test numbers; never a database password or a secret key.
// The accounts become friends through the venue chat if they are not already (a profiled message,
// a request, an accept), check in at VENUE on its own point and leave at the end. The venue chat
// messages ("ölçüm 1/10" …) stay visible at the venue for 24 hours, anonymous.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<publishable key> \
//   PHONE_A=+905550000001 OTP_A=<code> PHONE_B=+905550000002 OTP_B=<code> VENUE="<venue name>" \
//     node --experimental-strip-types scripts/latency/measure.ts
//
// Optional: ROUNDS (default 10). The venue chat allows an account 20 messages per 10 minutes, so
// leave 10 minutes between two runs.
import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';

import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../../supabase/functions/_shared/pure/consent.ts';
import { isDevProjectUrl, isLocalUrl } from '../../supabase/functions/_shared/pure/devProject.ts';
import { BROADCAST, dmChannel, inboxChannel } from '../../supabase/functions/_shared/pure/rooms.ts';
import {
  VENUE_CHAT,
  VENUE_CHAT_BROADCAST,
  venueChatChannel,
} from '../../supabase/functions/_shared/pure/venueChat.ts';
import { markdownTable } from './stats.ts';

// The local stack's fixed publishable key (the same in every `supabase start`).
const LOCAL_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const isLocal = isLocalUrl(url);
if (!isLocal && !isDevProjectUrl(url)) {
  console.error(`latency: refusing ${url}; only the local stack and the dev project are allowed.`);
  process.exit(1);
}
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? (isLocal ? LOCAL_PUBLISHABLE_KEY : undefined);
if (!publishableKey) {
  console.error('latency: SUPABASE_PUBLISHABLE_KEY is required for the dev project.');
  process.exit(1);
}
const wantedVenue = process.env.VENUE;
if (!isLocal && !wantedVenue) {
  console.error('latency: VENUE (name or id) is required for the dev project.');
  process.exit(1);
}
const ROUNDS = Math.max(1, Math.min(Number(process.env.ROUNDS ?? 10), VENUE_CHAT.windowMax));

type Json = Record<string, unknown>;
type Phone = { name: string; client: SupabaseClient; userId: string };

const now = () => performance.now();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(phone: Phone, fn: string, body: Json): Promise<Json> {
  const { data, error } = await phone.client.functions.invoke(fn, { body });
  if (error instanceof FunctionsHttpError) {
    const text = await (error.context as Response).text();
    throw new Error(`${fn}/${String(body.action)} answered ${error.context.status}: ${text}`);
  }
  if (error) throw error;
  return (data ?? {}) as Json;
}

// Wall time of one step.
async function timed<T>(step: () => PromiseLike<T>): Promise<[T, number]> {
  const start = now();
  const result = await step();
  return [result, now() - start];
}

async function signIn(name: string, phone: string, otp: string): Promise<Phone> {
  const client = createClient(url, publishableKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let sent = await client.auth.signInWithOtp({ phone });
  // Auth allows one code per number per interval; a run right after another waits it out once.
  const wait = /after (\d+) seconds?/.exec(sent.error?.message ?? '')?.[1];
  if (wait) {
    console.log(`${name}: waiting ${wait} s for the code limit.`);
    await sleep((Number(wait) + 1) * 1000);
    sent = await client.auth.signInWithOtp({ phone });
  }
  if (sent.error) throw sent.error;
  const verified = await client.auth.verifyOtp({ phone, token: otp, type: 'sms' });
  if (verified.error) throw verified.error;
  const userId = verified.data.user?.id;
  if (!userId) throw new Error(`${name}: no user after sign-in`);
  const self: Phone = { name, client, userId };
  // Sign-up = profile (docs/SPEC_V3.md §3); a no-op for an account that already has one.
  await call(self, 'account', {
    action: 'complete-onboarding',
    termsVersion: CURRENT_TERMS_VERSION,
    kvkkVersion: CURRENT_KVKK_VERSION,
    displayName: name,
    birthDate: '1995-05-20',
  });
  return self;
}

// At VENUE (name or id; locally the first active venue), on the venue's own point and first spot.
async function checkIn(phone: Phone): Promise<string> {
  const { data, error } = await phone.client.rpc('explore_venues', {});
  if (error) throw error;
  const venues = (data ?? []) as { venue_id: string; name: string; lat: number; lng: number }[];
  const venue = wantedVenue
    ? venues.find((v) => v.venue_id === wantedVenue || v.name === wantedVenue)
    : venues[0];
  if (!venue) throw new Error(`venue "${wantedVenue ?? ''}" not found among the active venues`);
  const { data: spots } = await phone.client
    .from('venue_spots')
    .select('id')
    .eq('venue_id', venue.venue_id)
    .eq('is_active', true)
    .order('sort')
    .limit(1);
  await call(phone, 'checkin', {
    action: 'check-in',
    venueId: venue.venue_id,
    lat: venue.lat,
    lng: venue.lng,
    accuracyM: 10,
    headcount: 2,
    locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
    ...(spots?.[0] ? { spotId: spots[0].id } : {}),
  });
  return venue.venue_id;
}

// Waits out the venue chat's 3-second rule between two sends of the same account.
let lastVenueSend = 0;
async function venueSend(phone: Phone, venueId: string, body: string, profiled: boolean) {
  const wait = lastVenueSend + VENUE_CHAT.minIntervalMs + 300 - Date.now();
  if (wait > 0) await sleep(wait);
  const result = await call(phone, 'venue-chat', { action: 'send', venueId, body, profiled });
  lastVenueSend = Date.now();
  return result as { messageId: string };
}

async function threadWith(a: Phone, b: Phone, venueId: string): Promise<string> {
  const { data: own, error } = await b.client.from('profiles').select('public_id').single();
  if (error) throw error;
  const find = async () => {
    const list = (await call(a, 'friends', { action: 'list' })) as {
      friends: { publicId: string; threadId: string | null }[];
    };
    return list.friends.find((f) => f.publicId === own.public_id)?.threadId ?? null;
  };
  const existing = await find();
  if (existing) return existing;

  console.log('Not friends yet: a request through the venue chat.');
  const { messageId } = await venueSend(a, venueId, 'ölçüm: arkadaşlık', true);
  await call(b, 'friends', { action: 'request', venueChatMessageId: messageId });
  const incoming = (await call(a, 'friends', { action: 'incoming' })) as {
    requests: { requestId: string }[];
  };
  const request = incoming.requests[0];
  if (!request) {
    throw new Error('no request arrived (declined or blocked before between these accounts?)');
  }
  await call(a, 'friends', { action: 'respond', requestId: request.requestId, accept: true });
  const thread = await find();
  if (!thread) throw new Error('friends, but no conversation');
  return thread;
}

// One subscription per channel; `next(event)` resolves at the next broadcast of that event.
async function listen(phone: Phone, topic: string, events: readonly string[]) {
  const waiting = new Map<string, ((at: number) => void)[]>();
  const channel = phone.client.channel(topic, { config: { private: true } });
  for (const event of events) {
    channel.on('broadcast', { event }, () => {
      const at = now();
      for (const resolve of waiting.get(event) ?? []) resolve(at);
      waiting.set(event, []);
    });
  }
  const [status, joinMs] = await timed(
    () =>
      new Promise<string>((resolve) => {
        const timer = setTimeout(() => resolve('TIMED_OUT'), 10_000);
        channel.subscribe((s) => {
          if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
            clearTimeout(timer);
            resolve(s);
          }
        });
      }),
  );
  if (status !== 'SUBSCRIBED') throw new Error(`${topic}: ${status}`);
  return {
    joinMs,
    next: (event: string, timeoutMs = 10_000) =>
      new Promise<number>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`${topic} ${event}: timed out`)),
          timeoutMs,
        );
        waiting.set(event, [
          ...(waiting.get(event) ?? []),
          (at) => {
            clearTimeout(timer);
            resolve(at);
          },
        ]);
      }),
    close: () => phone.client.removeChannel(channel),
  };
}

const samples = new Map<string, number[]>();
const add = (step: string, value: number) =>
  samples.set(step, [...(samples.get(step) ?? []), value]);

async function main() {
  const a = await signIn(
    'Ölçüm A',
    process.env.PHONE_A ?? '+905550000001',
    process.env.OTP_A ?? '123456',
  );
  const b = await signIn(
    'Ölçüm B',
    process.env.PHONE_B ?? '+905550000002',
    process.env.OTP_B ?? '123456',
  );
  const venueId = await checkIn(a);
  await checkIn(b);
  const threadId = await threadWith(a, b, venueId);
  console.log(`${url}: ${ROUNDS} rounds.`);

  // The platform's own round trip: a function that only answers (gateway + edge runtime). Every
  // other function first checks the token with Auth (requireUser → auth.getUser), one more round
  // trip; from here it is measured client → Auth.
  for (let i = 0; i < ROUNDS; i += 1) {
    add('ping (fonksiyon taban süresi)', (await timed(() => call(a, 'ping', {})))[1]);
    add(
      'auth.getUser (her çağrıdaki token kontrolü)',
      (await timed(() => a.client.auth.getUser()))[1],
    );
  }

  const dm = await listen(b, dmChannel(threadId), [BROADCAST.dmMessage]);
  const inbox = await listen(b, inboxChannel(b.userId), [BROADCAST.dm]);
  const venue = await listen(b, venueChatChannel(venueId), [VENUE_CHAT_BROADCAST]);
  add('Realtime aboneliği (kanal başına)', dm.joinMs);
  add('Realtime aboneliği (kanal başına)', inbox.joinMs);
  add('Realtime aboneliği (kanal başına)', venue.joinMs);

  for (let i = 1; i <= ROUNDS; i += 1) {
    // DM: A sends; B hears on dm:{thread} and inbox:{user}, then reads.
    const onDm = dm.next(BROADCAST.dmMessage);
    const onInbox = inbox.next(BROADCAST.dm);
    const t0 = now();
    await call(a, 'dm', { action: 'send', threadId, body: `ölçüm ${i}/${ROUNDS}` });
    const replied = now();
    add('DM: dm/send yanıtı (A)', replied - t0);
    // Before adım 9.1 the sender's bubble turned into a tick only after it read the page again;
    // now the reply carries the message.
    const [, ownPage] = await timed(() =>
      a.client.rpc('dm_messages_page', { target_thread_id: threadId }),
    );
    add('DM: gönderende tik, eski yol (yanıt + sayfa)', replied - t0 + ownPage);
    add('DM: gönderende tik, yeni yol (yanıt)', replied - t0);
    const heard = await onDm;
    add('DM: yayın B’ye (dm:)', heard - t0);
    add('DM: yayın B’ye (inbox:)', (await onInbox) - t0);

    // New path: only the conversation's page.
    const [page, pageMs] = await timed(() =>
      b.client.rpc('dm_messages_page', { target_thread_id: threadId }),
    );
    if (!(page.data ?? []).some((m: { body: string }) => m.body === `ölçüm ${i}/${ROUNDS}`)) {
      throw new Error(`round ${i}: the message is not on B's page`);
    }
    add('DM: B sayfayı okur (yalnızca sayfa)', pageMs);
    add('DM: uçtan uca, yeni yol (gönder → B ekranda)', heard - t0 + pageMs);

    // The old path: the inbox broadcast invalidated every friends/* query; with the conversation
    // open these refetched together with the page.
    await sleep(DM_GAP_MS);
    const start = now();
    let pageAt = 0;
    await Promise.all([
      b.client.rpc('dm_messages_page', { target_thread_id: threadId }).then(() => (pageAt = now())),
      call(b, 'friends', { action: 'list' }),
      call(b, 'friends', { action: 'incoming' }),
      call(b, 'dm', { action: 'inbox' }),
      call(b, 'dm', { action: 'read', threadId }),
      b.client.rpc('my_incoming_requests'),
    ]);
    add('DM: B okur, eski yol (sayfa, 5 çağrıyla birlikte)', pageAt - start);
    add('DM: B’nin eski yenilemesi (hepsi biter)', now() - start);
    add(
      'DM: dm/inbox (B, fotoğraflar imzalı)',
      (await timed(() => call(b, 'dm', { action: 'inbox' })))[1],
    );
    await sleep(DM_GAP_MS);
  }

  for (let i = 1; i <= ROUNDS; i += 1) {
    const onVenue = venue.next(VENUE_CHAT_BROADCAST);
    const t0Wall = Date.now();
    const wait = lastVenueSend + VENUE_CHAT.minIntervalMs + 300 - t0Wall;
    if (wait > 0) await sleep(wait);
    const t0 = now();
    await venueSend(a, venueId, `ölçüm ${i}/${ROUNDS}`, false);
    add('Mekan: venue-chat/send yanıtı (A)', now() - t0);
    const heard = await onVenue;
    add('Mekan: yayın B’ye', heard - t0);
    const [, rpcMs] = await timed(() =>
      b.client.rpc('venue_chat_page', { target_venue_id: venueId }),
    );
    add('Mekan: B okur (venue_chat_page RPC)', rpcMs);
    try {
      const [, fnMs] = await timed(() => call(b, 'venue-chat', { action: 'page', venueId }));
      add('Mekan: B okur (venue-chat/page, fotoğraflar imzalı)', fnMs);
    } catch {
      // Not deployed yet (#74): the function answers bad_request for `page`.
    }
    add('Mekan: uçtan uca (RPC ile)', heard - t0 + rpcMs);
  }

  await Promise.all([dm.close(), inbox.close(), venue.close()]);
  await call(a, 'checkin', { action: 'leave' });
  await call(b, 'checkin', { action: 'leave' });

  console.log(`\nms, ${url}, ${new Date().toISOString()}\n`);
  console.log(markdownTable([...samples].map(([step, values]) => ({ step, samples: values }))));
}

// The DM limit is one message per second per account.
const DM_GAP_MS = 600;

main().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(String(err));
    process.exit(1);
  },
);
