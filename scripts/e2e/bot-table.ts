// The second table for end-to-end tests. It plays through the same Edge Function API the app uses
// (no shortcut into the database for game actions): sign in with a test number, check in, ask to
// join the device's room, mark Tabu cards, end the room, answer "Tanışalım mı?", add the friend
// and exchange DMs.
//
// Runs only against the local stack or the hosted dev project; any other URL is refused. A few
// test hooks that move the clock (backdate the encounter, expire a turn) and the fixture setup
// write to the database directly, and only on the local stack.
//
//   node --experimental-strip-types scripts/e2e/bot-table.ts serve   # HTTP for Maestro, port 8787
//   node --experimental-strip-types scripts/e2e/bot-table.ts <action> [json]
import { createServer } from 'node:http';

import { createClient, FunctionsHttpError, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';

import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../../supabase/functions/_shared/pure/consent.ts';
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

function db() {
  if (!isLocal)
    throw new Error('this hook writes to the database and runs only on the local stack');
  const dbUrl = process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  if (!LOCAL_HOSTS.has(new URL(dbUrl).hostname)) throw new Error(`refusing database ${dbUrl}`);
  return postgres(dbUrl, { max: 1, onnotice: () => {} });
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

  async checkin(args) {
    const { data, error } = await me()
      .from('venues')
      .select('id')
      .eq('name', E2E_VENUE.name)
      .eq('is_active', true)
      .limit(1);
    if (error) throw error;
    venueId = data?.[0]?.id ?? null;
    if (!venueId) throw new Error(`venue "${E2E_VENUE.name}" not found`);
    return call('checkin', {
      action: 'check-in',
      venueId,
      lat: E2E_VENUE.at.lat,
      lng: E2E_VENUE.at.lng,
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
} else {
  run(command, rawArgs ? (JSON.parse(rawArgs) as Json) : {}).then(
    (result) => console.log(JSON.stringify(result)),
    (err: unknown) => {
      console.error(String(err));
      process.exit(1);
    },
  );
}
