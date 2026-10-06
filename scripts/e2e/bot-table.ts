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
import { isDevProjectUrl, isLocalUrl } from '../../supabase/functions/_shared/pure/devProject.ts';
import { dmTypingChannel, TYPING_EVENT } from '../../supabase/functions/_shared/pure/rooms.ts';
import { ownSeats, parseSahtekarState } from '../../supabase/functions/_shared/pure/sahtekar.ts';
import {
  parseSayState,
  type SayState,
} from '../../supabase/functions/_shared/pure/sayChallenge.ts';
import { parseReadyTurn, type VoiceTabuState } from '../../supabase/functions/_shared/pure/tabu.ts';
import { ANCHOR, offset, squareRing } from '../../supabase/tests/fixtures/venues.ts';

// The local stack's fixed publishable key (the same in every `supabase start`).
const LOCAL_PUBLISHABLE_KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
// The local stack or the hosted dev project (pure/devProject.ts). No other remote is accepted.
const isLocal = isLocalUrl(url);
if (!isLocal && !isDevProjectUrl(url)) {
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
// Local only: a second bot account for the venue chat flow (the first one is blocked by then).
const SECOND_BOT_PHONE = '+905550000003';
// A campus-like venue (docs/SPEC_V3.md §4): a 200 m square boundary around the anchor and two
// spots. The device checks in at "Kantin"; the bot opens a room at "Kütüphane" for "Bu noktadayım".
export const E2E_VENUE = {
  name: process.env.E2E_VENUE_NAME ?? 'E2E Kafe',
  sourceRef: 'e2e-kafe',
  at: ANCHOR,
  boundary: squareRing(ANCHOR, 100),
  spots: [
    { ref: 'kantin', name: 'Kantin' },
    { ref: 'kutuphane', name: 'Kütüphane' },
  ],
};
// A second venue so Keşfet starts as the list and the map (two active venues); `single-venue`
// closes every other venue for the pilot's single-venue view.
export const E2E_SECOND_VENUE = {
  name: 'E2E Kafe İki',
  sourceRef: 'e2e-kafe-2',
  at: offset(ANCHOR, 1500, 200),
};
// Where the device stands for the out-of-boundary check: 210 m outside the boundary, far past the
// 50 m tolerance.
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

// The bot's open room with a Harf or Şarkı game, its side and the parsed state.
async function sayRoom(): Promise<{
  id: string;
  kind: 'harf' | 'sarki';
  side: 'owner' | 'guest';
  state: SayState;
}> {
  const sessionId = await mySessionId();
  return retryUntil('a Harf or Şarkı game', async () => {
    const { data } = await me()
      .from('rooms')
      .select('id, game_state, owner_session_id')
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(1);
    const room = data?.[0];
    const state = room ? parseSayState(room.game_state) : null;
    if (!room || !state) return null;
    return {
      id: room.id as string,
      kind: state.kind,
      side: room.owner_session_id === sessionId ? 'owner' : 'guest',
      state,
    };
  });
}

// One step of the bot table's part in Harf Kapmaca or Şarkıda Geçsin (opponent mode): Başla on
// its own ready round after a few seconds, a random open letter (or a line) on its own turn after
// a few seconds, advance when a clock ran out. It never objects.
async function sayStep(
  room: { id: string; game_state: Json; owner_session_id?: string | null },
  sessionId: string | undefined,
  seen: Map<string, number>,
): Promise<string | null> {
  const state = parseSayState(room.game_state);
  if (!state) return null;
  const side = room.owner_session_id === sessionId ? 'owner' : 'guest';
  const key = `${room.id}/${state.roundNo}/${state.step}/${state.turnPhase}`;
  const since = seen.get(key) ?? Date.now();
  seen.set(key, since);
  if (state.turnPhase === 'ready') {
    if (
      (state.turnTable === side && Date.now() - since > 3_000) ||
      Date.now() >= (state.readyEndsAt ?? 0)
    ) {
      await call(state.kind, { action: 'begin', roomId: room.id });
      return 'began';
    }
    return null;
  }
  if (Date.now() >= (state.endsAt ?? Number.POSITIVE_INFINITY)) {
    await call(state.kind, { action: 'advance', roomId: room.id });
    return 'advanced';
  }
  if (state.turnTable === side && Date.now() - since > 2_500) {
    const open = state.letters.filter((l) => !l.closed);
    const letter = open[Math.floor(Math.random() * open.length)]?.letter;
    await call(
      state.kind,
      state.kind === 'harf'
        ? {
            action: 'claim',
            roomId: room.id,
            round: state.roundNo,
            step: state.step,
            letter: letter ?? 'A',
          }
        : { action: 'said', roomId: room.id, round: state.roundNo, step: state.step },
    );
    return state.kind === 'harf' ? `took ${letter}` : 'sang a line';
  }
  return null;
}

async function mySessionId(): Promise<string | undefined> {
  const { data } = await me().from('table_sessions').select('id').eq('status', 'active').limit(1);
  return data?.[0]?.id as string | undefined;
}

// The bot's part of a two-table Sahtekar game (docs/SPEC_V3.md §20.2), one step per call: it looks
// at its seats' cards, says "Söyledi" on its own clue steps, votes with each of its seats for the
// other table's first seat, guesses when it is caught (`guessWrong`, local only: a word that is not
// the secret one) and moves a phase on when its time is up. `done` keeps what it already did.
type SahtekarBot = { done: Set<string>; guessWrong: boolean };

async function sahtekarStep(
  room: { id: string; game_state: Json; owner_session_id?: string | null },
  sessionId: string | undefined,
  bot: SahtekarBot,
): Promise<string | null> {
  const state = parseSahtekarState(room.game_state);
  if (!state) return null;
  const side = room.owner_session_id === sessionId ? 'owner' : 'guest';
  const mine = ownSeats(state.seats, side);
  const deal = `${room.id}/${state.gameNo}/${state.dealNo}`;
  if (Date.now() >= Date.parse(state.endsAt)) {
    await call('sahtekar', { action: 'advance', roomId: room.id });
    return 'advanced';
  }
  if (state.phase === 'viewing') {
    for (const seat of mine) {
      if (state.viewed.includes(seat) || bot.done.has(`${deal}/view/${seat}`)) continue;
      bot.done.add(`${deal}/view/${seat}`);
      await call('sahtekar', { action: 'view', roomId: room.id, seat });
      return `looked at ${seat}`;
    }
  } else if (state.phase === 'clues') {
    const speaking = state.order[state.step];
    const key = `${deal}/said/${state.step}`;
    if (speaking && mine.includes(speaking) && !bot.done.has(key)) {
      bot.done.add(key);
      await call('sahtekar', { action: 'said', roomId: room.id, step: state.step });
      return `Söyledi for ${speaking}`;
    }
  } else if (state.phase === 'voting') {
    const target = state.seats.find((s) => !mine.includes(s));
    for (const voter of ownSeats(state.voters, side)) {
      const key = `${deal}/vote/${voter}`;
      if (!target || bot.done.has(key)) continue;
      bot.done.add(key);
      await call('sahtekar', { action: 'vote', roomId: room.id, voter, target });
      return `${voter} voted for ${target}`;
    }
  } else if (state.phase === 'guess' && state.accused && mine.includes(state.accused)) {
    const key = `${deal}/guess`;
    if (bot.done.has(key)) return null;
    bot.done.add(key);
    const { options } = (await call('sahtekar', { action: 'options', roomId: room.id })) as {
      options: string[];
    };
    let option = options[0] ?? '';
    if (bot.guessWrong && isLocal) {
      const sql = db();
      try {
        const [row] = await sql<{ word: string }[]>`
          select secret ->> 'word' as word from public.game_secrets
          where room_id = ${room.id} and game_no = ${state.gameNo}
        `;
        option = options.find((o) => o !== row?.word) ?? option;
      } finally {
        await sql.end();
      }
    }
    await call('sahtekar', { action: 'guess', roomId: room.id, option });
    return `guessed ${option}`;
  }
  return null;
}

export const actions: Record<string, (args: Json) => Promise<Json>> = {
  // Local only: the E2E venues, and both test accounts deleted so each run starts from zero.
  async setup() {
    const sql = db();
    try {
      await sql`
        delete from auth.users
        where phone in (${BOT_PHONE.slice(1)}, ${DEVICE_PHONE.slice(1)}, ${SECOND_BOT_PHONE.slice(1)})
      `;
      const wkt = `POLYGON((${E2E_VENUE.boundary.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
      const [venue] = await sql<{ id: string }[]>`
        insert into public.venues (name, city, district, location, boundary, source, source_ref, kind, is_active)
        values (
          ${E2E_VENUE.name}, 'İstanbul', 'Test',
          extensions.st_setsrid(extensions.st_makepoint(${E2E_VENUE.at.lng}, ${E2E_VENUE.at.lat}), 4326)::extensions.geography,
          extensions.st_geomfromtext(${wkt}, 4326)::extensions.geography,
          'e2e', ${E2E_VENUE.sourceRef}, 'campus', true
        )
        on conflict (source, source_ref) do update
          set name = excluded.name, location = excluded.location, boundary = excluded.boundary,
              kind = excluded.kind, is_active = true
        returning id
      `;
      const venueId = venue?.id ?? null;
      for (const [i, spot] of E2E_VENUE.spots.entries()) {
        await sql`
          insert into public.venue_spots (venue_id, ref, name, sort)
          values (${venueId}, ${spot.ref}, ${spot.name}, ${i})
          on conflict (venue_id, ref) do update
            set name = excluded.name, sort = excluded.sort, is_active = true
        `;
      }
      const second = E2E_SECOND_VENUE.at;
      await sql`
        insert into public.venues (name, city, district, location, source, source_ref, kind, is_active)
        values (
          ${E2E_SECOND_VENUE.name}, 'İstanbul', 'Test',
          extensions.st_setsrid(extensions.st_makepoint(${second.lng}, ${second.lat}), 4326)::extensions.geography,
          'e2e', ${E2E_SECOND_VENUE.sourceRef}, 'cafe', true
        )
        on conflict (source, source_ref) do update set name = excluded.name, kind = excluded.kind, is_active = true
      `;
      return { venueId, inside: E2E_VENUE.at, outside: OUTSIDE };
    } finally {
      await sql.end();
    }
  },

  // Local only: the pilot's Keşfet (docs/SPEC_V3.md §4.4). Every venue but the E2E venue is closed,
  // so Keşfet shows the single venue card. `setup` opens the second E2E venue again; the seed's
  // venues come back with `pnpm db:reset`.
  async 'single-venue'() {
    const sql = db();
    try {
      await sql`
        update public.venues set is_active = false
        where is_active and not (source = 'e2e' and source_ref = ${E2E_VENUE.sourceRef})
      `;
      return { ok: true };
    } finally {
      await sql.end();
    }
  },

  // Signs in as BOT_PHONE, or locally as the second bot (`{"second":true}`, name "Bot İki").
  async login(args) {
    const second = args.second === true;
    if (second && !isLocal) throw new Error('the second bot is local only');
    const phone = second ? SECOND_BOT_PHONE : BOT_PHONE;
    const name = second ? 'Bot İki' : BOT_NAME;
    client = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const sent = await client.auth.signInWithOtp({ phone });
    if (sent.error) throw sent.error;
    const verified = await client.auth.verifyOtp({ phone, token: BOT_OTP, type: 'sms' });
    if (verified.error) throw verified.error;
    // Sign-up = profile (docs/SPEC_V3.md §3): an adult birth date and the bot's name.
    await call('account', {
      action: 'complete-onboarding',
      termsVersion: CURRENT_TERMS_VERSION,
      kvkkVersion: CURRENT_KVKK_VERSION,
      displayName: name,
      birthDate: '1995-05-20',
    });
    return { ok: true };
  },

  // At BOT_VENUE (name or id; the E2E venue by default), standing on the venue's own point. At a
  // venue with spots, at `spot` or BOT_SPOT (ref or name), else the first spot.
  async checkin(args) {
    const wanted = String(args.venue ?? process.env.BOT_VENUE ?? E2E_VENUE.name);
    const { data, error } = await me().rpc('explore_venues', {});
    if (error) throw error;
    const venue = (
      (data ?? []) as { venue_id: string; name: string; lat: number; lng: number }[]
    ).find((v) => v.venue_id === wanted || v.name === wanted);
    if (!venue) throw new Error(`venue "${wanted}" not found among the active venues`);
    venueId = venue.venue_id;
    const { data: spots, error: spotsError } = await me()
      .from('venue_spots')
      .select('id, ref, name')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort');
    if (spotsError) throw spotsError;
    const wantedSpot = args.spot ?? process.env.BOT_SPOT;
    const spot =
      wantedSpot === undefined
        ? spots?.[0]
        : spots?.find((s) => s.ref === wantedSpot || s.name === wantedSpot);
    if (wantedSpot !== undefined && !spot)
      throw new Error(`spot "${String(wantedSpot)}" not found`);
    return call('checkin', {
      action: 'check-in',
      venueId,
      lat: venue.lat,
      lng: venue.lng,
      accuracyM: 10,
      headcount: Number(args.headcount ?? 3),
      locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
      ...(spot ? { spotId: spot.id } : {}),
    });
  },

  // An open room of the bot's table (for "Bu noktadayım" in the lobby of another spot); anonymous
  // unless `profiled`.
  async 'create-room'(args) {
    return call('rooms', { action: 'create', profiled: args.profiled === true });
  },

  // Asks to join the first open room of another table in the lobby (the device's).
  async 'request-join'(args) {
    const room = await retryUntil('an open room in the lobby', async () => {
      const { data, error } = await me().rpc('venue_lobby', { target_venue_id: venueId ?? '' });
      if (error) throw error;
      return ((data ?? []) as { room_id: string }[])[0] ?? null;
    });
    return call('rooms', {
      action: 'request-join',
      roomId: room.room_id,
      profiled: args.profiled === true,
    });
  },

  // "Oyun öner" in the bot's room (docs/SPEC_V3.md §5.3): `concept` tabu (default), sohbet or
  // sahtekar; `players` the bot table's Sahtekar count (otherwise its check-in headcount).
  async 'propose-game'(args) {
    const room = await myRoom();
    return call('rooms', {
      action: 'propose-game',
      roomId: room.id,
      concept: args.concept === 'sohbet' || args.concept === 'sahtekar' ? args.concept : 'tabu',
      ...(typeof args.players === 'number' ? { players: args.players } : {}),
    });
  },

  // Answers the other table's proposal: accepts unless `accept` is false.
  async 'answer-game'(args) {
    const room = await retryUntil('a proposal from the other table', async () => {
      const found = await myRoom();
      const { data, error } = await me()
        .from('game_proposals')
        .select('room_id')
        .eq('room_id', found.id)
        .limit(1);
      if (error) throw error;
      return data?.[0] ? found : null;
    });
    return call('rooms', {
      action: 'answer-game',
      roomId: room.id,
      accept: args.accept !== false,
      ...(typeof args.players === 'number' ? { players: args.players } : {}),
    });
  },

  // Harf Kapmaca and Şarkıda Geçsin (docs/SPEC_V3.md §20.3–20.4). `say-begin`: Başla on the bot's
  // ready round; `force` (local only) first moves readyEndsAt into the past, so the bot starts the
  // device's round too.
  async 'say-begin'(args) {
    const room = await retryUntil('a ready round', async () => {
      const r = await sayRoom();
      return r.state.turnPhase === 'ready' ? r : null;
    });
    if (args.force === true) {
      if (!isLocal) throw new Error('force is local only');
      const sql = db();
      try {
        await sql`
          update public.rooms
          set game_state = jsonb_set(game_state, '{readyEndsAt}', to_jsonb(now() - interval '1 second'))
          where id = ${room.id}
        `;
      } finally {
        await sql.end();
      }
    }
    return call(room.kind, { action: 'begin', roomId: room.id });
  },

  // A letter (`letter`, or the first open one) or a line on the bot's own turn.
  async 'say-claim'(args) {
    const room = await retryUntil('the bot table’s turn', async () => {
      const r = await sayRoom();
      return r.state.turnPhase === 'running' && r.state.turnTable === r.side ? r : null;
    });
    const { state } = room;
    const letter =
      typeof args.letter === 'string'
        ? args.letter
        : (state.letters.find((l) => !l.closed)?.letter ?? 'A');
    return call(
      room.kind,
      room.kind === 'harf'
        ? { action: 'claim', roomId: room.id, round: state.roundNo, step: state.step, letter }
        : { action: 'said', roomId: room.id, round: state.roundNo, step: state.step },
    );
  },

  // İtiraz on the other table's last claim, inside its window.
  async 'say-object'() {
    const room = await retryUntil('a claim to object to', async () => {
      const r = await sayRoom();
      const claim = r.state.lastClaim;
      return claim && claim.table !== r.side && Date.now() < (r.state.objectionEndsAt ?? 0)
        ? r
        : null;
    });
    return call(room.kind, {
      action: 'object',
      roomId: room.id,
      round: room.state.roundNo,
      step: room.state.lastClaim?.step,
    });
  },

  // Local only: runs the clock out now and moves the game on. `toRound` first jumps so the advance
  // opens that round; `lastRound` jumps to the last round, so the advance ends the game.
  async 'say-expire'(args) {
    if (!isLocal) throw new Error('say-expire is local only');
    const room = await sayRoom();
    const sql = db();
    try {
      await sql`
        update public.rooms
        set game_state = game_state
          || jsonb_build_object('endsAt', now() - interval '1 second', 'turnPhase', 'running')
          || case when ${args.lastRound === true}::boolean
               then jsonb_build_object('roundNo', game_state -> 'totalRounds')
               when ${typeof args.toRound === 'number'}::boolean
               then jsonb_build_object('roundNo', ${Number(args.toRound ?? 1) - 1}::int)
               else '{}'::jsonb end
        where id = ${room.id}
      `;
    } finally {
      await sql.end();
    }
    return call(room.kind, { action: 'advance', roomId: room.id });
  },

  // Plays the bot table's part of the Sahtekar game now starting in its room, in the background
  // until the game ends (the flow goes on meanwhile). Local only: `imposter` makes that seat the
  // impostor before anyone looks; `guessWrong` makes a caught bot guess a wrong word.
  async 'sahtekar-autoplay'(args) {
    const room = await retryUntil('a Sahtekar game', async () => {
      const r = await myRoom();
      return parseSahtekarState(r.game_state) ? r : null;
    });
    if (typeof args.imposter === 'string') {
      if (!isLocal) throw new Error('imposter is local only');
      const sql = db();
      try {
        await sql`
          update public.game_secrets s
          set secret = jsonb_set(s.secret, '{imposter}', to_jsonb(${args.imposter}::text))
          from public.rooms r
          where r.id = s.room_id and s.room_id = ${room.id}
            and s.game_no = (r.game_state ->> 'gameNo')::int
        `;
      } finally {
        await sql.end();
      }
    }
    const sessionId = await mySessionId();
    const bot: SahtekarBot = { done: new Set(), guessWrong: args.guessWrong === true };
    void (async () => {
      for (;;) {
        try {
          const { data } = await me()
            .from('rooms')
            .select('id, game_state, owner_session_id')
            .eq('id', room.id)
            .single();
          if (!data || !parseSahtekarState(data.game_state)) return;
          const did = await sahtekarStep(data, sessionId, bot);
          if (did) console.log(`bot-table sahtekar: ${did}`);
        } catch (err) {
          console.error(`bot-table sahtekar: ${String(err)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
    })();
    return { ok: true };
  },

  async 'end-game'() {
    const room = await myRoom();
    return call('rooms', { action: 'end-game', roomId: room.id });
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

  // Starts the ready turn (docs/SPEC_V3.md §19.1): the bot's own turn at once. `force` (local only)
  // first moves readyEndsAt into the past, so the bot starts the device's turn too, as either
  // table may then.
  async 'begin-turn'(args) {
    // The device's acceptance may still be on its way: wait for the ready turn first, or the call
    // finds no game and the turn stays ready.
    const room = await retryUntil('a ready Tabu turn', async () => {
      const r = await myRoom();
      return (r.game_state as { turnPhase?: string } | null)?.turnPhase === 'ready' ? r : null;
    });
    if (args.force === true) {
      const sql = db();
      try {
        await sql`
          update public.tabu_turns set ready_ends_at = now() - interval '1 second'
          where room_id = ${room.id} and ends_at is null
        `;
      } finally {
        await sql.end();
      }
    }
    await call('tabu', { action: 'begin-turn', roomId: room.id });
    // begin-turn answers ok even when it starts nothing: check that the clock runs.
    return retryUntil(
      'the turn to start',
      async () => {
        const r = await myRoom();
        return (r.game_state as { turnPhase?: string } | null)?.turnPhase === 'running'
          ? { ok: true }
          : null;
      },
      5_000,
    );
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
    // The newest: an earlier room of this account may still be waiting for its window to close.
    const { data, error } = await me()
      .from('rooms')
      .select('id')
      .eq('status', 'ending')
      .order('created_at', { ascending: false })
      .limit(1);
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
    // A person stops typing when they send: a running `dm-typing` ends first, so no dots follow.
    await stopTyping();
    return call('dm', { action: 'send', threadId: thread, body: String(args.body ?? 'Merhaba!') });
  },

  // The device's messages so far count as read (its ticks turn to "Okundu", docs/SPEC_V3.md §18.2).
  async 'dm-read'() {
    const threadId = await firstThread();
    return call('dm', { action: 'read', threadId });
  },

  // "yazıyor" on the device: `typing` on dm_typing:{thread} every 1.5 s for `seconds` (default 8),
  // in the background so the flow can look for the dots meanwhile.
  async 'dm-typing'(args) {
    const threadId = await firstThread();
    const until = Date.now() + Number(args.seconds ?? 8) * 1000;
    await stopTyping();
    typing = typeFor(threadId, until);
    return { ok: true };
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

  // Venue chat (docs/SPEC_V3.md §7): a message, anonymous unless `profiled`.
  async 'venue-chat-send'(args) {
    if (!venueId) throw new Error('check in first');
    return call('venue-chat', {
      action: 'send',
      venueId,
      body: String(args.body ?? 'Merhaba mekan!'),
      profiled: args.profiled === true,
    });
  },

  // Accepts the newest friend request from the venue chat.
  async 'accept-friend'() {
    const request = await retryUntil('a friend request from the venue chat', async () => {
      const { requests } = (await call('friends', { action: 'incoming' })) as {
        requests: { requestId: string }[];
      };
      return requests[0] ?? null;
    });
    return call('friends', { action: 'respond', requestId: request.requestId, accept: true });
  },
};

// "Karşı masa": the other table for a one-phone P0 test on the dev project. Checks in at
// BOT_VENUE (at a venue with spots: BOT_SPOT, else the first spot; only tables at the same spot
// play together) and then, every two seconds, does what the other table would: as a guest
// (BOT_ROLE=guest, default) asks to join each new room in the lobby; as a host (BOT_ROLE=host)
// keeps an open room and accepts the first request. In the room the host proposes Sesli Tabu once
// and either table accepts the other's proposal (docs/SPEC_V3.md §5.3); it presses Doğru on each card after a few seconds, ends turns and the answer window when their time
// is up, says "Evet" to "Tanışalım mı?", adds the friend, accepts requests from the venue chat and
// answers every new DM. Only the public
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
  const proposed = new Set<string>();
  const accepted = new Set<string>();
  const sahtekarBot: SahtekarBot = { done: new Set(), guessWrong: false };

  for (;;) {
    await quiet('tick', async () => {
      const { data: rooms, error } = await me()
        .from('rooms')
        .select(
          'id, status, concept, owner_session_id, guest_session_id, game_state, reveal_ends_at',
        )
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
              call('rooms', { action: 'request-join', roomId: room_id, profiled: false }),
            );
            say('asked to join a room');
          }
        } else {
          await call('rooms', { action: 'create', intent: 'game', profiled: false });
          say('opened a room');
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
        if (room.guest_session_id && room.concept === null) {
          const { data: proposals } = await me()
            .from('game_proposals')
            .select('proposer_session_id, created_at')
            .eq('room_id', room.id)
            .limit(1);
          const proposal = proposals?.[0];
          const key = `${room.id}/${proposal?.created_at ?? ''}`;
          if (proposal && proposal.proposer_session_id !== sessionId && !accepted.has(key)) {
            accepted.add(key);
            await quiet('answer-game', () =>
              call('rooms', { action: 'answer-game', roomId: room.id, accept: true }),
            );
            say('accepted a game proposal');
          } else if (!proposal && isOwner && !proposed.has(room.id)) {
            proposed.add(room.id);
            await quiet('propose-game', () =>
              call('rooms', { action: 'propose-game', roomId: room.id, concept: 'tabu' }),
            );
            say('proposed Sesli Tabu');
          }
          return;
        }
        if (room.concept === 'sahtekar') {
          const did = await sahtekarStep(room, sessionId, sahtekarBot);
          if (did) say(`Sahtekar: ${did}`);
          return;
        }
        if (room.concept === 'harf' || room.concept === 'sarki') {
          const did = await sayStep(room, sessionId, firstSeen);
          if (did) say(`${room.concept}: ${did}`);
          return;
        }
        if (!state?.mode || state.phase !== 'playing') return;
        const mySide = isOwner ? 'owner' : 'guest';
        // A ready turn (docs/SPEC_V3.md §19.1): the bot starts its own after a few seconds, and the
        // other table's once readyEndsAt has passed.
        const ready = parseReadyTurn(state);
        if (ready) {
          const key = `${room.id}/${state.gameNo}/${state.turnNo}`;
          const seen = firstSeen.get(key) ?? Date.now();
          firstSeen.set(key, seen);
          const mine = state.describingTable === mySide;
          if ((mine && Date.now() - seen > 3_000) || Date.now() >= Date.parse(ready.readyEndsAt)) {
            await quiet('begin-turn', () =>
              call('tabu', { action: 'begin-turn', roomId: room.id }),
            );
            if (mine) say(`started turn ${state.turnNo}`);
          }
          return;
        }
        if (Date.now() >= Date.parse(state.turnEndsAt ?? '')) {
          await quiet('end-turn', () => call('tabu', { action: 'end-turn', roomId: room.id }));
          return;
        }
        // Cooperative (docs/SPEC_V3.md §6.3): only the describing table presses; the bot waits
        // while the other table describes to it.
        if (state.mode === 'cooperative' && state.describingTable !== mySide) return;
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
            say(`Doğru, turn ${state.turnNo} card ${(state.cardIndex ?? 0) + 1}`);
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
      // Requests from the venue chat: accepted.
      const { requests } = (await call('friends', { action: 'incoming' })) as {
        requests: { requestId: string }[];
      };
      for (const { requestId } of requests) {
        await quiet('accept-friend', () =>
          call('friends', { action: 'respond', requestId, accept: true }),
        );
        say('accepted a friend request from the venue chat');
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
        // Read (the device's ticks turn to read), type a moment, then answer (§18.3).
        await call('dm', { action: 'read', threadId });
        await typeFor(threadId, Date.now() + 3000);
        await call('dm', { action: 'send', threadId, body: `Aldım: ${last.body}` });
        say('answered a DM');
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}
async function firstThread(): Promise<string> {
  return retryUntil('a friend with a conversation', async () => {
    const list = (await call('friends', { action: 'list' })) as {
      friends: { threadId: string | null }[];
    };
    return list.friends[0]?.threadId ?? null;
  });
}

// The background `dm-typing` loop, so `dm-send` can end it before the message goes.
let typing: Promise<void> | null = null;
let typingStopped = false;

async function stopTyping(): Promise<void> {
  if (!typing) return;
  typingStopped = true;
  await typing;
  typing = null;
  typingStopped = false;
}

// The typing channel is the one channel where a client sends (rule 9); only the two members join.
async function typeFor(threadId: string, until: number): Promise<void> {
  const channel = me().channel(dmTypingChannel(threadId), { config: { private: true } });
  const status = await new Promise<string>((resolve) => {
    const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
        clearTimeout(timer);
        resolve(s);
      }
    });
  });
  if (status !== 'SUBSCRIBED') {
    console.log(`bot-table: typing channel ${status}`);
    await me().removeChannel(channel);
    return;
  }
  while (Date.now() < until && !typingStopped) {
    await channel.send({ type: 'broadcast', event: TYPING_EVENT, payload: {} });
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await me().removeChannel(channel);
}

async function run(action: string, args: Json): Promise<Json> {
  const fn = actions[action];
  if (!fn) throw new Error(`unknown action ${action}; one of ${Object.keys(actions).join(', ')}`);
  // Each CLI call is its own process: sign in first unless the action does not need it.
  if (!client && !['setup', 'single-venue', 'login'].includes(action)) await actions.login?.({});
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
