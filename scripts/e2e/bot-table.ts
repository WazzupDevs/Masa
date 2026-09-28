// The second table for end-to-end tests. It plays through the same Edge Function API the app uses
// (no shortcut into the database for game actions): sign in with a test number, check in, ask to
// join the device's room, mark Tabu cards, end the room, answer "Tanışalım mı?", add the friend
// and exchange DMs.
//
// Runs only against the local stack or the hosted dev project; any other URL is refused. Against
// the dev project it uses only the public Edge Function API with the publishable key and a test
// number: it never asks for a database password or a secret key. A few test hooks that move the
// clock (backdate the encounter, expire a turn) and the fixture setup write to the database
// directly; they run only on the local stack and are refused anywhere else.
//
//   node --experimental-strip-types scripts/e2e/bot-table.ts serve     # HTTP for Maestro, port 8787
//   node --experimental-strip-types scripts/e2e/bot-table.ts opponent  # the other table, for one phone
//   node --experimental-strip-types scripts/e2e/bot-table.ts <action> [json]
import { createServer } from 'node:http';

import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../../supabase/functions/_shared/pure/consent.ts';
import type { VoiceTabuState } from '../../supabase/functions/_shared/pure/tabu.ts';
import { ANCHOR, offset } from '../../supabase/tests/fixtures/venues.ts';

// The hosted dev project (CLAUDE.md, "Barındırılan dev projesi"). No other remote is accepted.
const DEV_PROJECT_HOST = 'kphwbpqxhugrpoicmski.supabase.co';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);
// The local stack's fixed publishable key (the same in every `supabase start`).
const LOCAL_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const host = new URL(url).hostname;
const isLocal = LOCAL_HOSTS.has(host);
if (!isLocal && !(host === DEV_PROJECT_HOST && url.startsWith('https://'))) {
  console.error(
    `bot-table: refusing ${url}; only the local stack and the dev project are allowed.`,
  );
  process.exit(1);
}
const publishableKey =
  process.env.SUPABASE_PUBLISHABLE_KEY ?? (isLocal ? LOCAL_PUBLISHABLE_KEY : undefined);
if (!publishableKey) {
  console.error('bot-table: SUPABASE_PUBLISHABLE_KEY is required for the dev project.');
  process.exit(1);
}

const BOT_PHONE = process.env.BOT_PHONE ?? '+905550000002';
const BOT_OTP = process.env.BOT_OTP ?? '123456';
const BOT_NAME = process.env.BOT_NAME ?? 'Bot Masa';
const DEVICE_PHONE = process.env.DEVICE_PHONE ?? '+905550000001';
export const E2E_VENUE = {
  name: process.env.E2E_VENUE_NAME ?? 'E2E Kafe',
  sourceRef: 'e2e-kafe',
  at: ANCHOR,
};
// Where the device stands for the out-of-radius check (CHECKIN_RADIUS_M is 300).
export const OUTSIDE = offset(ANCHOR, 310, 90);

type Json = Record<string, unknown>;

let client: SupabaseClient | null = null;
let venueId: string | null = null;

// The local stack's database, with its fixed default credentials. There is no way to point it
// anywhere else.
function db() {
  if (!isLocal)
    throw new Error('this hook writes to the database and runs only on the local stack');
  return postgres('postgresql://postgres:postgres@127.0.0.1:54322/postgres', {
    max: 1,
    onnotice: () => {},
  });
}

function me(): SupabaseClient {
  if (!client) throw new Error('not signed in; call login first');
  return client;
}

async function call(fn: string, body: Json): Promise<Json> {
  const { data, error } = await me().functions.invoke(fn, { body });
  if (error instanceof FunctionsHttpError) {
    const text = await (error.context as Response).text();
    throw new Error(`${fn}/${String(body.action)} answered ${error.context.status}: ${text}`);
  }
  if (error) throw error;
  return (data ?? {}) as Json;
}

async function retryUntil<T>(what: string, attempt: () => Promise<T | null>, ms = 20_000) {
  const until = Date.now() + ms;
  for (;;) {
    const found = await attempt();
    if (found !== null) return found;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function myRoom(): Promise<{ id: string; game_state: Json; status: string }> {
  const { data, error } = await me()
    .from('rooms')
    .select('id, game_state, status')
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const room = data?.[0];
  if (!room) throw new Error('the bot is in no open room');
  return room as { id: string; game_state: Json; status: string };
}

export const actions: Record<string, (args: Json) => Promise<Json>> = {
  // Local only: the E2E venue, and both test accounts deleted so each run starts from zero.
  async setup() {
    const sql = db();
    try {
      await sql`delete from auth.users where phone in (${BOT_PHONE.slice(1)}, ${DEVICE_PHONE.slice(1)})`;
      const [venue] = await sql<{ id: string }[]>`
        insert into public.venues (name, city, district, location, source, source_ref, is_active)
        values (
          ${E2E_VENUE.name}, 'İstanbul', 'Test',
          extensions.st_setsrid(extensions.st_makepoint(${E2E_VENUE.at.lng}, ${E2E_VENUE.at.lat}), 4326)::extensions.geography,
          'e2e', ${E2E_VENUE.sourceRef}, true
        )
        on conflict (source, source_ref) do update set name = excluded.name, is_active = true
        returning id
      `;
      return { venueId: venue?.id ?? null, inside: E2E_VENUE.at, outside: OUTSIDE };
    } finally {
      await sql.end();
    }
  },

  async login() {
    client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const sent = await client.auth.signInWithOtp({ phone: BOT_PHONE });
    if (sent.error) throw sent.error;
    const verified = await client.auth.verifyOtp({ phone: BOT_PHONE, token: BOT_OTP, type: 'sms' });
    if (verified.error) throw verified.error;
    await call('account', {
      action: 'complete-onboarding',
      ageConfirmed: true,
      termsVersion: CURRENT_TERMS_VERSION,
      kvkkVersion: CURRENT_KVKK_VERSION,
    });
    await call('profile', { action: 'update', displayName: BOT_NAME });
    return { ok: true };
  },

  // At BOT_VENUE (name or id; the E2E venue by default), standing on the venue's own point.
  async checkin(args) {
    const wanted = String(args.venue ?? process.env.BOT_VENUE ?? E2E_VENUE.name);
    const { data, error } = await me().rpc('explore_venues', {});
    if (error) throw error;
    const venue = (
      (data ?? []) as { venue_id: string; name: string; lat: number; lng: number }[]
    ).find((v) => v.venue_id === wanted || v.name === wanted);
    if (!venue) throw new Error(`venue "${wanted}" not found among the active venues`);
    venueId = venue.venue_id;
    return call('checkin', {
      action: 'check-in',
      venueId,
      lat: venue.lat,
      lng: venue.lng,
      accuracyM: 10,
      headcount: Number(args.headcount ?? 3),
      locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
      participation: args.participation === 'profile' ? 'profile' : 'anonymous',
    });
  },

  // Asks to join the first open room of another table in the lobby (the device's).
  async 'request-join'() {
    const room = await retryUntil('an open room in the lobby', async () => {
      const { data, error } = await me().rpc('venue_lobby', { target_venue_id: venueId ?? '' });
      if (error) throw error;
      return ((data ?? []) as { room_id: string }[])[0] ?? null;
    });
    return call('rooms', { action: 'request-join', roomId: room.room_id });
  },

  // Marks the card now on the table; the server takes it only from the right side.
  async mark(args) {
    const room = await myRoom();
    const state = room.game_state as { turnNo: number; cardIndex: number };
    return call('tabu', {
      action: 'mark',
      roomId: room.id,
      turnNo: state.turnNo,
      cardIndex: state.cardIndex,
      result: String(args.result ?? 'correct'),
    });
  },

  // Local only: ends the current turn now instead of in 60 seconds.
  async 'expire-turn'() {
    const room = await myRoom();
    const state = room.game_state as { gameNo: number; turnNo: number };
    const sql = db();
    try {
      const expired = await sql`
        update public.tabu_turns set ends_at = now() - interval '1 second'
        where room_id = ${room.id} and game_no = ${state.gameNo} and turn_no = ${state.turnNo}
        returning 1
      `;
      if (expired.length !== 1) throw new Error('no current turn to expire');
    } finally {
      await sql.end();
    }
    return call('tabu', { action: 'end-turn', roomId: room.id });
  },

  // Local only: makes the two tables' encounter older than the 3 minutes the play history needs.
  async 'backdate-encounter'() {
    const room = await myRoom();
    const sql = db();
    try {
      await sql`
        update public.rooms set guest_joined_at = now() - interval '4 minutes' where id = ${room.id}
      `;
    } finally {
      await sql.end();
    }
    return { ok: true };
  },

  async 'end-room'() {
    return call('rooms', { action: 'end' });
  },

  // "Tanışalım mı?" for the room that is ending.
  async reveal(args) {
    const { data, error } = await me().from('rooms').select('id').eq('status', 'ending').limit(1);
    if (error) throw error;
    const roomId = data?.[0]?.id;
    if (!roomId) throw new Error('no room is waiting for an answer');
    return call('reveal', { action: 'decide', roomId, wantsMeet: args.yes !== false });
  },

  // "Arkadaş ekle" for the latest encounter.
  async 'add-friend'() {
    const { data, error } = await me()
      .from('play_history')
      .select('id')
      .order('played_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const historyId = data?.[0]?.id;
    if (!historyId) throw new Error('the bot has no play history');
    return call('friends', { action: 'add-from-room', historyId });
  },

  async 'dm-send'(args) {
    const thread = await retryUntil('a friend with a conversation', async () => {
      const list = (await call('friends', { action: 'list' })) as {
        friends: { threadId: string | null }[];
      };
      return list.friends[0]?.threadId ?? null;
    });
    return call('dm', { action: 'send', threadId: thread, body: String(args.body ?? 'Merhaba!') });
  },

  // The newest message of the conversation, so a flow can check what the device sent.
  async 'dm-last'() {
    const list = (await call('friends', { action: 'list' })) as {
      friends: { threadId: string | null }[];
    };
    const threadId = list.friends[0]?.threadId;
    if (!threadId) return { body: null };
    const { data, error } = await me().rpc('dm_messages_page', { target_thread_id: threadId });
    if (error) throw error;
    const rows = (data ?? []) as { body: string; created_at: string }[];
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { body: rows[0]?.body ?? null };
  },

  async leave() {
    return call('checkin', { action: 'leave' });
  },
};

// "Karşı masa": the other table for a one-phone P0 test on the dev project. Checks in at
// BOT_VENUE and then, every two seconds, does what the other table would: as a guest
// (BOT_ROLE=guest, default) asks to join each new room in the lobby; as a host (BOT_ROLE=host)
// keeps an open Tabu room and accepts the first request. In the room it starts the game (host),
// presses Doğru on each card after a few seconds, ends turns and the answer window when their time
// is up, says "Evet" to "Tanışalım mı?", adds the friend and answers every new DM. Only the public
// API: the same calls the app makes.
async function opponent() {
  const role = process.env.BOT_ROLE === 'host' ? 'host' : 'guest';
  const say = (text: string) => console.log(`${new Date().toLocaleTimeString('tr-TR')} ${text}`);
  const quiet = async (what: string, step: () => Promise<unknown>) => {
    try {
      await step();
    } catch (err) {
      say(`${what}: ${String(err)}`);
    }
  };

  await actions.login?.({});
  const checkedIn = (await actions.checkin?.({})) as { alias?: string };
  say(`checked in as ${checkedIn.alias ?? '?'} (${role})`);
  const { data: session } = await me()
    .from('table_sessions')
    .select('id')
    .eq('status', 'active')
    .limit(1);
  const sessionId = session?.[0]?.id as string | undefined;

  const asked = new Set<string>();
  const decided = new Set<string>();
  const befriended = new Set<string>();
  const answered = new Set<string>();
  const marked = new Set<string>();
  const firstSeen = new Map<string, number>();
  let started: string | null = null;

  for (;;) {
    await quiet('tick', async () => {
      const { data: rooms, error } = await me()
        .from('rooms')
        .select('id, status, owner_session_id, guest_session_id, game_state, reveal_ends_at')
        .neq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      const room = rooms?.[0];

      if (!room) {
        if (role === 'guest') {
          const { data: lobby } = await me().rpc('venue_lobby', { target_venue_id: venueId ?? '' });
          for (const { room_id } of (lobby ?? []) as { room_id: string }[]) {
            if (asked.has(room_id)) continue;
            asked.add(room_id);
            await quiet('request-join', () =>
              call('rooms', { action: 'request-join', roomId: room_id }),
            );
            say('asked to join a room');
          }
        } else {
          await call('rooms', { action: 'create', concept: 'tabu', visibility: 'open' });
          say('opened a Tabu room');
        }
        return;
      }

      if (room.status === 'waiting' && room.owner_session_id === sessionId) {
        const { data: requests } = await me()
          .from('join_requests')
          .select('id')
          .eq('room_id', room.id)
          .eq('status', 'pending')
          .limit(1);
        const request = requests?.[0];
        if (request) {
          await call('rooms', { action: 'respond', requestId: request.id, accept: true });
          say('accepted a request');
        }
        return;
      }

      if (room.status === 'active') {
        const state = room.game_state as Partial<VoiceTabuState> | null;
        const isOwner = room.owner_session_id === sessionId;
        if (isOwner && room.guest_session_id && !state?.mode && started !== room.id) {
          started = room.id;
          await call('tabu', { action: 'start', roomId: room.id });
          say('started Tabu');
          return;
        }
        if (state?.mode !== 'voice' || state.phase !== 'playing') return;
        if (Date.now() >= Date.parse(state.turnEndsAt ?? '')) {
          await quiet('end-turn', () => call('tabu', { action: 'end-turn', roomId: room.id }));
          return;
        }
        // One Doğru per card, after the card has been on the table for a few seconds.
        const card = `${room.id}/${state.gameNo}/${state.turnNo}/${state.cardIndex}`;
        const seen = firstSeen.get(card) ?? Date.now();
        firstSeen.set(card, seen);
        if (!marked.has(card) && Date.now() - seen > 5_000) {
          marked.add(card);
          await quiet('mark', async () => {
            await call('tabu', {
              action: 'mark',
              roomId: room.id,
              turnNo: state.turnNo,
              cardIndex: state.cardIndex,
              result: 'correct',
            });
            say(`Doğru, turn ${state.turnNo} card ${state.cardIndex + 1}`);
          });
        }
        return;
      }

      if (room.status === 'ending') {
        if (!decided.has(room.id)) {
          decided.add(room.id);
          await call('reveal', { action: 'decide', roomId: room.id, wantsMeet: true });
          say('said yes to meeting');
        }
        if (room.reveal_ends_at && Date.now() >= Date.parse(room.reveal_ends_at)) {
          await quiet('finalize', () => call('reveal', { action: 'finalize', roomId: room.id }));
        }
      }
    });

    await quiet('friends', async () => {
      const { data: history } = await me()
        .from('play_history')
        .select('id')
        .order('played_at', { ascending: false })
        .limit(1);
      const historyId = history?.[0]?.id as string | undefined;
      if (historyId && !befriended.has(historyId)) {
        befriended.add(historyId);
        await quiet('add-friend', () => call('friends', { action: 'add-from-room', historyId }));
      }
    });

    await quiet('dm', async () => {
      const list = (await call('friends', { action: 'list' })) as {
        friends: { threadId: string | null }[];
      };
      for (const { threadId } of list.friends) {
        if (!threadId) continue;
        const { data } = await me().rpc('dm_messages_page', { target_thread_id: threadId });
        const rows = (data ?? []) as {
          id: string;
          body: string;
          from_me: boolean;
          created_at: string;
        }[];
        rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
        const last = rows[0];
        if (!last || last.from_me || answered.has(last.id)) continue;
        answered.add(last.id);
        await call('dm', { action: 'send', threadId, body: `Aldım: ${last.body}` });
        say('answered a DM');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
async function run(action: string, args: Json): Promise<Json> {
  const fn = actions[action];
  if (!fn) throw new Error(`unknown action ${action}; one of ${Object.keys(actions).join(', ')}`);
  // Each CLI call is its own process: sign in first unless the action does not need it.
  if (!client && action !== 'setup' && action !== 'login') await actions.login?.({});
  return fn(args);
}

function serve(port: number) {
  // One action at a time, in the order the flow sends them.
  let queue: Promise<unknown> = Promise.resolve();
  createServer((req, res) => {
    const action = (req.url ?? '/').replace(/^\/+/, '').split('?')[0] ?? '';
    let raw = '';
    req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
    req.on('end', () => {
      queue = queue.then(async () => {
        try {
          const args = raw ? (JSON.parse(raw) as Json) : {};
          const result = await run(action, args);
          console.log(`bot-table ${action} ok`);
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(result));
        } catch (err) {
          console.error(`bot-table ${action} failed: ${String(err)}`);
          res
            .writeHead(500, { 'content-type': 'application/json' })
            .end(JSON.stringify({ error: String(err) }));
        }
      });
    });
  }).listen(port, '127.0.0.1', () => console.log(`bot-table listening on ${port} (${url})`));
}

const [command = 'serve', rawArgs] = process.argv.slice(2);
if (command === 'serve') {
  serve(Number(process.env.BOT_PORT ?? 8787));
} else if (command === 'opponent') {
  opponent().catch((err: unknown) => {
    console.error(String(err));
    process.exit(1);
  });
} else {
  run(command, rawArgs ? (JSON.parse(rawArgs) as Json) : {}).then(
    (result) => console.log(JSON.stringify(result)),
    (err: unknown) => {
      console.error(String(err));
      process.exit(1);
    },
  );
}
