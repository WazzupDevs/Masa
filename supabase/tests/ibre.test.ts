import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  IBRE_CONFIG,
  ibreBand,
  ibreBegin,
  ibreLock,
  ibreSide,
  newIbreGame,
} from '../functions/_shared/pure/ibre.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

// İbre (docs/SPEC_V3.md §20.5).
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

const rooms = (client: Client, body: Record<string, unknown>) => invoke(client, 'rooms', body);
const ibre = (client: Client, body: Record<string, unknown>) => invoke(client, 'ibre', body);

// A two-table room as a chat.
async function room() {
  const [a, b, third] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  await checkInAt(a, venue, V, 2);
  await checkInAt(b, venue, V, 2);
  await checkInAt(third, venue, V);
  const created = await rooms(a, { action: 'create', profiled: false });
  const roomId = (created.body as { roomId: string }).roomId;
  await rooms(b, { action: 'request-join', roomId, profiled: false });
  const [request] =
    await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
  await rooms(a, { action: 'respond', requestId: request?.id, accept: true });
  return { owner: a, guest: b, third, roomId };
}

// The guest's table proposes, the owner's accepts: round 1, the owner's table describes.
async function started() {
  const r = await room();
  expect(
    (await rooms(r.guest, { action: 'propose-game', roomId: r.roomId, concept: 'ibre' })).status,
  ).toBe(200);
  const answered = await rooms(r.owner, { action: 'answer-game', roomId: r.roomId, accept: true });
  expect(answered, JSON.stringify(answered.body)).toEqual(OK);
  const call = (client: Client, body: Record<string, unknown>) =>
    ibre(client, { roomId: r.roomId, ...body });
  return { ...r, call };
}

type Reveal = {
  roundNo: number;
  scale: { left: string; right: string };
  table: string;
  target: number;
  needle: number | null;
  band: number;
  side: string | null;
  sidePoint: boolean;
};
type Gs = {
  concept: string;
  phase: string;
  gameNo: number;
  turnPhase: string;
  readyEndsAt: string | null;
  roundNo: number;
  totalRounds: number;
  scale: { left: string; right: string };
  turnTable: 'owner' | 'guest';
  endsAt: string | null;
  needle: number | null;
  scores: { owner: number; guest: number };
  bullseyes: { owner: number; guest: number };
  reveal: Reveal | null;
  lastGame?: Record<string, unknown>;
};

async function state(roomId: string): Promise<{ concept: string | null; gs: Gs }> {
  const [row] = await sql`select concept, game_state from public.rooms where id = ${roomId}`;
  return { concept: row?.concept as string | null, gs: row?.game_state as Gs };
}

async function secret(roomId: string): Promise<{ roundNo: number; target: number }> {
  const [row] = await sql`
    select s.secret from public.game_secrets s join public.rooms r on r.id = s.room_id
    where s.room_id = ${roomId} and s.game_no = (r.game_state ->> 'gameNo')::int
  `;
  return row?.secret as { roundNo: number; target: number };
}

async function setTarget(roomId: string, target: number) {
  await sql`
    update public.game_secrets s set secret = jsonb_set(s.secret, '{target}', to_jsonb(${target}::int))
    from public.rooms r
    where r.id = s.room_id and s.room_id = ${roomId}
      and s.game_no = (r.game_state ->> 'gameNo')::int
  `;
}

// Moves a clock into the past: `endsAt` or `readyEndsAt`.
async function expire(roomId: string, field: 'endsAt' | 'readyEndsAt') {
  await sql`
    update public.rooms
    set game_state = jsonb_set(game_state, ${[field]}, to_jsonb(now() - interval '1 second'))
    where id = ${roomId}
  `;
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

describe('İbre rules in SQL (pure/ibre.ts)', () => {
  it('uses the same numbers and bands', async () => {
    const [row] = await sql`select private.ibre_config() as c`;
    expect(row?.c).toEqual({ ...IBRE_CONFIG });
    const bands = await sql`
      select d, private.ibre_band(d) as band from generate_series(-100, 100) as d
    `;
    expect(bands.map((b) => b.band)).toEqual(bands.map((b) => ibreBand(Number(b.d))));
    const [targets] = await sql`
      select min(t) as lo, max(t) as hi
      from (select private.ibre_target() as t from generate_series(1, 2000)) x
    `;
    expect(targets).toEqual({ lo: 0, hi: 100 });
  });

  it('keeps every İbre function server-side only', async () => {
    const rows = await sql`
      select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'ibre\\_%'
    `;
    expect(rows.map((r) => r.proname).sort()).toEqual([
      'ibre_advance',
      'ibre_begin',
      'ibre_local_deck',
      'ibre_lock',
      'ibre_side',
      'ibre_target',
    ]);
    expect(rows.every((r) => r.auth === false)).toBe(true);
  });
});

describe('İbre, two tables', () => {
  it('starts only from an accepted proposal', async () => {
    const r = await room();
    expect(await ibre(r.owner, { action: 'begin', roomId: r.roomId })).toEqual(OK);
    expect((await state(r.roomId)).concept).toBeNull();
    expect(await ibre(r.owner, { action: 'start', roomId: r.roomId })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
  });

  it('opens round 1 ready from an accepted proposal: a scale from the deck, the target hidden', async () => {
    const t = await started();
    const before = Date.now();
    const { concept, gs } = await state(t.roomId);
    expect(concept).toBe('ibre');
    expect(gs).toMatchObject({
      concept: 'ibre',
      phase: 'playing',
      turnPhase: 'ready',
      roundNo: 1,
      totalRounds: 4,
      turnTable: 'owner',
      endsAt: null,
      needle: null,
      scores: { owner: 0, guest: 0 },
      bullseyes: { owner: 0, guest: 0 },
      reveal: null,
    });
    expect(Math.abs(ms(gs.readyEndsAt) - (before + 10_000))).toBeLessThan(3_000);
    expect(JSON.stringify(gs)).not.toContain('target');
    const [card] = await sql`
      select c.prompt, c.word from public.room_used_cards u join public.cards c on c.id = u.card_id
      where u.room_id = ${t.roomId} and c.deck = 'ibre'
    `;
    expect(gs.scale).toEqual({ left: card?.prompt, right: card?.word });
    const sec = await secret(t.roomId);
    expect(sec.roundNo).toBe(1);
    expect(sec.target).toBeGreaterThanOrEqual(0);
    expect(sec.target).toBeLessThanOrEqual(100);
  });

  it('starts the clock from the describing table, or from readyEndsAt on advance, once however often it is sent', async () => {
    const t = await started();
    // The other table, and advance before readyEndsAt: nothing.
    expect(await t.call(t.guest, { action: 'begin' })).toEqual(OK);
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    expect((await state(t.roomId)).gs.turnPhase).toBe('ready');
    const before = Date.now();
    expect(await t.call(t.owner, { action: 'begin' })).toEqual(OK);
    const first = (await state(t.roomId)).gs;
    expect(first).toMatchObject({ turnPhase: 'running', readyEndsAt: null });
    expect(Math.abs(ms(first.endsAt) - (before + IBRE_CONFIG.clueSeconds * 1000))).toBeLessThan(
      3_000,
    );
    expect(await t.call(t.owner, { action: 'begin' })).toEqual(OK);
    expect(await t.call(t.guest, { action: 'begin' })).toEqual(OK);
    expect((await state(t.roomId)).gs.endsAt).toBe(first.endsAt);
  });

  it('starts the clock from readyEndsAt, not from the call, when nobody presses Başla', async () => {
    const u = await started();
    await sql`
      update public.rooms
      set game_state = jsonb_set(game_state, '{readyEndsAt}', to_jsonb(now() - interval '20 seconds'))
      where id = ${u.roomId}
    `;
    const ready = ms((await state(u.roomId)).gs.readyEndsAt);
    await Promise.all([
      u.call(u.owner, { action: 'advance' }),
      u.call(u.guest, { action: 'advance' }),
    ]);
    expect(await u.call(u.guest, { action: 'advance' })).toEqual(OK);
    const late = (await state(u.roomId)).gs;
    expect(late.turnPhase).toBe('running');
    expect(ms(late.endsAt)).toBe(ready + IBRE_CONFIG.clueSeconds * 1000);
  });

  it('hands the target to the describing table only, while a clock runs, the same each time', async () => {
    const t = await started();
    expect(await t.call(t.owner, { action: 'target', round: 1 })).toEqual({
      status: 409,
      body: errorBody('turn_not_started'),
    });
    await t.call(t.owner, { action: 'begin' });
    const sec = await secret(t.roomId);
    const asked = await t.call(t.owner, { action: 'target', round: 1 });
    expect(asked).toEqual({ status: 200, body: { roundNo: 1, target: sec.target } });
    expect(await t.call(t.owner, { action: 'target', round: 1 })).toEqual(asked);
    expect(await t.call(t.guest, { action: 'target', round: 1 })).toEqual({
      status: 403,
      body: errorBody('not_describer'),
    });
    expect(await t.call(t.owner, { action: 'target', round: 2 })).toEqual({
      status: 409,
      body: errorBody('turn_over'),
    });
    expect((await t.call(t.third, { action: 'target', round: 1 })).status).toBe(403);
    // Still the describing table's while the other table guesses.
    await t.call(t.owner, { action: 'lock', round: 1, value: 50 });
    expect(await t.call(t.owner, { action: 'target', round: 1 })).toEqual(asked);
  });

  it('locks the needle once, from the describing table, before its clock runs out', async () => {
    const t = await started();
    // Before Başla: nothing.
    expect(await t.call(t.owner, { action: 'lock', round: 1, value: 41 })).toEqual(OK);
    expect((await state(t.roomId)).gs.needle).toBeNull();
    await t.call(t.owner, { action: 'begin' });
    expect(await t.call(t.guest, { action: 'lock', round: 1, value: 41 })).toEqual(OK);
    expect(await t.call(t.owner, { action: 'lock', round: 2, value: 41 })).toEqual(OK);
    expect((await state(t.roomId)).gs).toMatchObject({ turnPhase: 'running', needle: null });
    expect((await t.call(t.owner, { action: 'lock', round: 1, value: 101 })).status).toBe(400);
    expect((await t.call(t.owner, { action: 'lock', round: 1, value: 40.5 })).status).toBe(400);

    const before = Date.now();
    expect(await t.call(t.owner, { action: 'lock', round: 1, value: 41 })).toEqual(OK);
    const gs = (await state(t.roomId)).gs;
    expect(gs).toMatchObject({ turnPhase: 'side', needle: 41 });
    expect(Math.abs(ms(gs.endsAt) - (before + 15_000))).toBeLessThan(3_000);
    expect(await t.call(t.owner, { action: 'lock', round: 1, value: 60 })).toEqual(OK);
    expect((await state(t.roomId)).gs.needle).toBe(41);
  });

  it('reveals on the side guess with the server’s bands and side point, then opens round 2 ready', async () => {
    const t = await started();
    const scale1 = (await state(t.roomId)).gs.scale;
    await setTarget(t.roomId, 34);
    await t.call(t.owner, { action: 'begin' });
    await t.call(t.owner, { action: 'lock', round: 1, value: 41 });
    // The describing table cannot guess the side.
    expect(await t.call(t.owner, { action: 'side', round: 1, side: 'left' })).toEqual(OK);
    expect((await state(t.roomId)).gs.turnPhase).toBe('side');
    expect(await t.call(t.guest, { action: 'side', round: 1, side: 'left' })).toEqual(OK);
    expect(await t.call(t.guest, { action: 'side', round: 1, side: 'right' })).toEqual(OK);

    const { gs } = await state(t.roomId);
    // The reducer on the same moves.
    const local = ibreSide(
      ibreLock(ibreBegin(newIbreGame(scale1, 0), 'owner', 0), 'owner', 1, 41, 0),
      'guest',
      1,
      'left',
      34,
      () => gs.scale,
      0,
    );
    expect(gs).toMatchObject({
      roundNo: 2,
      turnTable: 'guest',
      turnPhase: 'ready',
      needle: null,
      endsAt: null,
      scores: local.scores,
      bullseyes: local.bullseyes,
      reveal: local.reveal,
    });
    expect(gs.reveal).toEqual({
      roundNo: 1,
      scale: scale1,
      table: 'owner',
      target: 34,
      needle: 41,
      band: 3,
      side: 'left',
      sidePoint: true,
    });
    expect(gs.scores).toEqual({ owner: 3, guest: 1 });
    // Round 2 has its own target and a scale the room has not seen.
    expect((await secret(t.roomId)).roundNo).toBe(2);
    expect(
      await sql`
        select 1 from public.room_used_cards u join public.cards c on c.id = u.card_id
        where u.room_id = ${t.roomId} and c.deck = 'ibre'
      `,
    ).toHaveLength(2);
  });

  it('counts a bullseye and gives no side point on the target', async () => {
    const t = await started();
    await setTarget(t.roomId, 50);
    await t.call(t.owner, { action: 'begin' });
    await t.call(t.owner, { action: 'lock', round: 1, value: 50 });
    await t.call(t.guest, { action: 'side', round: 1, side: 'right' });
    const { gs } = await state(t.roomId);
    expect(gs.reveal).toMatchObject({ band: 4, sidePoint: false });
    expect(gs.scores).toEqual({ owner: 4, guest: 0 });
    expect(gs.bullseyes).toEqual({ owner: 1, guest: 0 });
  });

  it("ends the round without a side guess when the other table's clock runs out, once from both phones", async () => {
    const t = await started();
    await setTarget(t.roomId, 70);
    await t.call(t.owner, { action: 'begin' });
    await t.call(t.owner, { action: 'lock', round: 1, value: 60 });
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    expect((await state(t.roomId)).gs.turnPhase).toBe('side');
    await expire(t.roomId, 'endsAt');
    const both = await Promise.all([
      t.call(t.owner, { action: 'advance' }),
      t.call(t.guest, { action: 'advance' }),
    ]);
    expect(both).toEqual([OK, OK]);
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    const { gs } = await state(t.roomId);
    expect(gs).toMatchObject({
      roundNo: 2,
      turnPhase: 'ready',
      scores: { owner: 3, guest: 0 },
      reveal: { target: 70, needle: 60, band: 3, side: null, sidePoint: false },
    });
  });

  it('ends the round without points when the describing table never locks', async () => {
    const t = await started();
    await t.call(t.owner, { action: 'begin' });
    await expire(t.roomId, 'endsAt');
    expect(await t.call(t.owner, { action: 'lock', round: 1, value: 50 })).toEqual(OK);
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    const { gs } = await state(t.roomId);
    expect(gs).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 0 },
      reveal: { roundNo: 1, needle: null, band: 0, side: null, sidePoint: false },
    });
  });

  it('plays 4 rounds with the tables in turn, writes game_results and keeps the last reveal', async () => {
    const t = await started();
    const tables = { owner: t.owner, guest: t.guest };
    let lastScale = { left: '', right: '' };
    for (let round = 1; round <= 4; round++) {
      const { gs } = await state(t.roomId);
      lastScale = gs.scale;
      expect(gs.turnTable).toBe(round % 2 === 1 ? 'owner' : 'guest');
      const describer = tables[gs.turnTable];
      const guesser = tables[gs.turnTable === 'owner' ? 'guest' : 'owner'];
      // 3 points for the describer, 1 for the right side, every round.
      await setTarget(t.roomId, 40);
      await t.call(describer, { action: 'begin' });
      await t.call(describer, { action: 'lock', round, value: 50 });
      await t.call(guesser, { action: 'side', round, side: 'left' });
    }
    const { concept, gs } = await state(t.roomId);
    expect(concept).toBeNull();
    expect(gs.lastGame).toEqual({
      concept: 'ibre',
      scores: { owner: 8, guest: 8 },
      bullseyes: { owner: 0, guest: 0 },
      reveal: {
        roundNo: 4,
        scale: lastScale,
        table: 'guest',
        target: 40,
        needle: 50,
        band: 3,
        side: 'left',
        sidePoint: true,
      },
    });
    const [ownerId, guestId] = await Promise.all([userIdOf(t.owner), userIdOf(t.guest)]);
    const results = await sql`
      select user_id, concept, mode, score, won from public.game_results where room_id = ${t.roomId}
      order by user_id = ${ownerId} desc
    `;
    expect(results).toEqual([
      { user_id: ownerId, concept: 'ibre', mode: 'ibre', score: 8, won: false },
      { user_id: guestId, concept: 'ibre', mode: 'ibre', score: 8, won: false },
    ]);
    // Nothing moves after the end.
    expect(await t.call(t.owner, { action: 'advance' })).toEqual(OK);
    expect(await t.call(t.owner, { action: 'target', round: 4 })).toEqual({
      status: 409,
      body: errorBody('no_game'),
    });
  });

  it('keeps the scores and where it stopped when the game is ended early', async () => {
    const t = await started();
    expect(await rooms(t.guest, { action: 'end-game', roomId: t.roomId })).toEqual(OK);
    expect((await state(t.roomId)).gs.lastGame).toEqual({
      concept: 'ibre',
      abandoned: true,
      turnNo: 1,
      totalTurns: 4,
      scores: { owner: 0, guest: 0 },
    });
    expect(await sql`select 1 from public.game_results`).toHaveLength(0);
  });
});

describe('İbre, the target (rules 4 and 9)', () => {
  // The room channel as the app subscribes to it (useRoom).
  function watchRoomChannel(client: Client, roomId: string) {
    const payloads: unknown[] = [];
    const channel = client.channel(`room:${roomId}`, { config: { private: true } });
    for (const table of ['rooms', 'game_events', 'game_proposals', 'messages']) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: table === 'rooms' ? `id=eq.${roomId}` : `room_id=eq.${roomId}`,
        },
        (payload: unknown) => payloads.push(payload),
      );
    }
    const subscribed = new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('TIMED_OUT'), 8000);
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer);
          resolve(status);
        }
      });
    });
    return { payloads, channel, subscribed };
  }

  // A target anywhere but in a reveal of an earlier round.
  function targetsOutsideReveals(value: unknown, round: number): unknown[] {
    const found: unknown[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (typeof v !== 'object' || v === null) return;
      const o = v as Record<string, unknown>;
      for (const [key, inner] of Object.entries(o)) {
        if (key === 'reveal') {
          const r = inner as { roundNo?: number } | null;
          if (r && typeof r.roundNo === 'number' && r.roundNo >= round) found.push(inner);
          continue;
        }
        if (key === 'target') found.push(o);
        walk(inner);
      }
    };
    walk(value);
    return found;
  }

  it('keeps the target off the room, the events and Realtime until the reveal', async () => {
    const t = await started();
    const watch = watchRoomChannel(t.guest, t.roomId);
    expect(await watch.subscribed).toBe('SUBSCRIBED');
    await expect
      .poll(
        async () => {
          await sql`update public.rooms set last_activity_at = last_activity_at where id = ${t.roomId}`;
          return watch.payloads.length;
        },
        { timeout: 15_000, interval: 500 },
      )
      .toBeGreaterThan(0);

    const readable = async (client: Client) => {
      const reads = await Promise.all([
        client.from('rooms').select('game_state, concept').eq('id', t.roomId),
        client.from('game_events').select('type, payload').eq('room_id', t.roomId),
        client.from('game_secrets').select('*'),
      ]);
      return reads.map((r) => r.data ?? []);
    };

    await t.call(t.owner, { action: 'begin' });
    await t.call(t.owner, { action: 'target', round: 1 });
    await t.call(t.owner, { action: 'lock', round: 1, value: 50 });
    for (const client of [t.owner, t.guest]) {
      const [roomsRead, events, secrets] = await readable(client);
      expect(targetsOutsideReveals(roomsRead, 1)).toEqual([]);
      expect(targetsOutsideReveals(events, 1)).toEqual([]);
      expect(secrets).toEqual([]);
    }
    // The reveal carries round 1's target; round 2's stays hidden.
    await t.call(t.guest, { action: 'side', round: 1, side: 'left' });
    await t.call(t.guest, { action: 'begin' });
    await t.call(t.guest, { action: 'lock', round: 2, value: 10 });
    const [roomsRead] = await readable(t.guest);
    expect(targetsOutsideReveals(roomsRead, 2)).toEqual([]);

    await new Promise((resolve) => setTimeout(resolve, 1500));
    const rows = (watch.payloads as { new?: unknown; old?: unknown }[]).flatMap((p) => [
      p.new,
      p.old,
    ]);
    expect(rows.length).toBeGreaterThan(3);
    // Each change before round 2's reveal: no target outside an earlier round's reveal.
    for (const row of rows) {
      const gs = (row as { game_state?: { roundNo?: number } } | undefined)?.game_state;
      expect(targetsOutsideReveals(row, gs?.roundNo ?? 1)).toEqual([]);
    }
    await t.guest.removeChannel(watch.channel);
  });
});

describe('İbre, one table', () => {
  it('hands a one-table room 4 scales; the room counts them as used', async () => {
    const client = await onboarded(PHONES[0]);
    await checkInAt(client, venue, V, 3);
    const created = await rooms(client, { action: 'create-solo' });
    const roomId = (created.body as { roomId: string }).roomId;
    const res = await ibre(client, { action: 'start', roomId });
    expect(res.status).toBe(200);
    const { scales } = res.body as { scales: { left: string; right: string }[] };
    expect(scales).toHaveLength(IBRE_CONFIG.totalRounds);
    expect(new Set(scales.map((s) => s.left)).size).toBe(4);
    const used = await sql`
      select c.prompt as left, c.word as right
      from public.room_used_cards u join public.cards c on c.id = u.card_id
      where u.room_id = ${roomId} and c.deck = 'ibre'
    `;
    expect(used.map((u) => ({ left: u.left, right: u.right }))).toEqual(
      expect.arrayContaining(scales),
    );
    expect((await state(roomId)).concept).toBe('ibre');
    expect(await ibre(client, { action: 'begin', roomId })).toEqual(OK);
  });
});
