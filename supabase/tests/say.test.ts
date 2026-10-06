import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  HARF_LETTERS,
  newSayGame,
  SAY_CONFIG,
  sayAdvance,
  sayBegin,
  sayClaim,
  sayObject,
  type SayKind,
  turnSeconds,
} from '../functions/_shared/pure/sayChallenge.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql } from './local.ts';

// Harf Kapmaca and Şarkıda Geçsin (docs/SPEC_V3.md §20.3–20.4).
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

// The guest's table proposes, the owner's accepts.
async function started(kind: SayKind) {
  const r = await room();
  expect(
    (await rooms(r.guest, { action: 'propose-game', roomId: r.roomId, concept: kind })).status,
  ).toBe(200);
  const answered = await rooms(r.owner, { action: 'answer-game', roomId: r.roomId, accept: true });
  expect(answered, JSON.stringify(answered.body)).toEqual(OK);
  const call = (client: Client, body: Record<string, unknown>) =>
    invoke(client, kind, { roomId: r.roomId, ...body });
  return { ...r, call };
}

type Gs = {
  concept: string;
  phase: string;
  turnPhase: string;
  readyEndsAt: string | null;
  roundNo: number;
  totalRounds: number;
  prompt: string;
  letters: { letter: string; closed: boolean }[];
  turnTable: 'owner' | 'guest';
  step: number;
  endsAt: string | null;
  objectionEndsAt: string | null;
  lastClaim: { table: string; step: number; letter: string | null } | null;
  objectionsLeft: { owner: number; guest: number };
  scores: { owner: number; guest: number };
  lastRound: { roundNo: number; winner: string | null; reason: string } | null;
  lastGame?: Record<string, unknown>;
};

async function state(roomId: string): Promise<{ concept: string | null; gs: Gs }> {
  const [row] = await sql`select concept, game_state from public.rooms where id = ${roomId}`;
  return { concept: row?.concept as string | null, gs: row?.game_state as Gs };
}

// Moves a clock into the past: `endsAt`, `readyEndsAt` or `objectionEndsAt`.
async function expire(roomId: string, field: 'endsAt' | 'readyEndsAt' | 'objectionEndsAt') {
  await sql`
    update public.rooms
    set game_state = jsonb_set(game_state, ${[field]}, to_jsonb(now() - interval '1 second'))
    where id = ${roomId}
  `;
}

describe('say rules in SQL (pure/sayChallenge.ts)', () => {
  it('uses the same numbers, board and turn lengths', async () => {
    for (const kind of ['harf', 'sarki'] as const) {
      const [row] = await sql`select private.say_config(${kind}) as c`;
      expect(row?.c).toEqual({ ...SAY_CONFIG[kind] });
      for (let round = 1; round <= SAY_CONFIG[kind].totalRounds; round++) {
        const [t] = await sql`select private.say_turn_seconds(${kind}, ${round}) as s`;
        expect(t?.s).toBe(turnSeconds(kind, round));
      }
    }
    const [letters] = await sql`select private.say_letters() as l`;
    expect(letters?.l).toEqual([...HARF_LETTERS]);
  });

  it('keeps every say function server-side only', async () => {
    const rows = await sql`
      select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as auth
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'say\\_%'
    `;
    expect(rows.map((r) => r.proname).sort()).toEqual([
      'say_advance',
      'say_begin',
      'say_claim',
      'say_local_deck',
      'say_object',
    ]);
    expect(rows.every((r) => r.auth === false)).toBe(true);
  });
});

describe('Harf Kapmaca, two tables', () => {
  it('starts only from an accepted proposal: round 1 ready, a category from the deck, the full board', async () => {
    const t = await started('harf');
    const before = Date.now();
    const { concept, gs } = await state(t.roomId);
    expect(concept).toBe('harf');
    expect(gs).toMatchObject({
      phase: 'playing',
      turnPhase: 'ready',
      roundNo: 1,
      totalRounds: 5,
      turnTable: 'owner',
      step: 0,
      endsAt: null,
      objectionsLeft: { owner: 3, guest: 3 },
      scores: { owner: 0, guest: 0 },
    });
    expect(gs.letters.map((l) => l.letter)).toEqual([...HARF_LETTERS]);
    expect(Date.parse(String(gs.readyEndsAt)) - before).toBeLessThan(11_000);
    const [card] = await sql`
      select c.prompt from public.room_used_cards u join public.cards c on c.id = u.card_id
      where u.room_id = ${t.roomId} and c.deck = 'harf'
    `;
    expect(card?.prompt).toBe(gs.prompt);
  });

  it('starts the clock from the starting table, or from either table after readyEndsAt', async () => {
    const t = await started('harf');
    expect(await t.call(t.guest, { action: 'begin' })).toEqual(OK);
    expect((await state(t.roomId)).gs.turnPhase).toBe('ready');
    expect(await t.call(t.owner, { action: 'begin' })).toEqual(OK);
    const running = (await state(t.roomId)).gs;
    expect(running).toMatchObject({ turnPhase: 'running', readyEndsAt: null });
    // Sent again (the app retries after a 5xx): the same clock.
    expect(await t.call(t.owner, { action: 'begin' })).toEqual(OK);
    expect((await state(t.roomId)).gs.endsAt).toBe(running.endsAt);

    const u = await started('harf');
    await expire(u.roomId, 'readyEndsAt');
    expect(await u.call(u.guest, { action: 'begin' })).toEqual(OK);
    expect((await state(u.roomId)).gs.turnPhase).toBe('running');
  });

  it('closes a letter, passes the turn and opens the window; a stale or wrong claim is ignored', async () => {
    const t = await started('harf');
    await t.call(t.owner, { action: 'begin' });
    expect(await t.call(t.owner, { action: 'claim', round: 1, step: 0, letter: 'E' })).toEqual(OK);
    const { gs } = await state(t.roomId);
    expect(gs).toMatchObject({
      step: 1,
      turnTable: 'guest',
      lastClaim: { table: 'owner', step: 0, letter: 'E' },
    });
    expect(gs.letters.find((l) => l.letter === 'E')?.closed).toBe(true);
    const window = Date.parse(String(gs.objectionEndsAt)) - Date.now();
    expect(window).toBeGreaterThan(1_000);
    expect(window).toBeLessThanOrEqual(3_000);
    // Again (a retry), from the other table on the same step, a closed letter, a stale round.
    for (const [client, body] of [
      [t.owner, { action: 'claim', round: 1, step: 0, letter: 'E' }],
      [t.owner, { action: 'claim', round: 1, step: 1, letter: 'K' }],
      [t.guest, { action: 'claim', round: 1, step: 1, letter: 'E' }],
      [t.guest, { action: 'claim', round: 2, step: 1, letter: 'K' }],
    ] as const) {
      expect(await t.call(client, body)).toEqual(OK);
    }
    expect((await state(t.roomId)).gs).toEqual(gs);
    // Şarkı's action is not Harf's.
    expect((await t.call(t.guest, { action: 'said', round: 1, step: 1 })).status).toBe(400);
  });

  it('takes an objection inside the window: the claimer loses, once, and one objection is spent', async () => {
    const t = await started('harf');
    await t.call(t.owner, { action: 'begin' });
    await t.call(t.owner, { action: 'claim', round: 1, step: 0, letter: 'E' });
    // The claiming table cannot object to itself.
    expect(await t.call(t.owner, { action: 'object', round: 1, step: 0 })).toEqual(OK);
    expect((await state(t.roomId)).gs.roundNo).toBe(1);
    expect(await t.call(t.guest, { action: 'object', round: 1, step: 0 })).toEqual(OK);
    // Sent again: the round has moved on, nothing changes.
    expect(await t.call(t.guest, { action: 'object', round: 1, step: 0 })).toEqual(OK);
    const { gs } = await state(t.roomId);
    expect(gs).toMatchObject({
      roundNo: 2,
      turnTable: 'guest',
      turnPhase: 'ready',
      step: 0,
      scores: { owner: 0, guest: 1 },
      objectionsLeft: { owner: 3, guest: 2 },
      lastRound: { roundNo: 1, winner: 'guest', reason: 'objection' },
    });
    expect(gs.letters.every((l) => !l.closed)).toBe(true);
  });

  it('refuses an objection after the window, and with none left says so', async () => {
    const t = await started('harf');
    await t.call(t.owner, { action: 'begin' });
    await t.call(t.owner, { action: 'claim', round: 1, step: 0, letter: 'E' });
    await expire(t.roomId, 'objectionEndsAt');
    expect(await t.call(t.guest, { action: 'object', round: 1, step: 0 })).toEqual(OK);
    expect((await state(t.roomId)).gs.roundNo).toBe(1);

    const u = await started('harf');
    await sql`
      update public.rooms set game_state = jsonb_set(game_state, '{objectionsLeft,guest}', '0')
      where id = ${u.roomId}
    `;
    await u.call(u.owner, { action: 'begin' });
    await u.call(u.owner, { action: 'claim', round: 1, step: 0, letter: 'A' });
    expect(await u.call(u.guest, { action: 'object', round: 1, step: 0 })).toEqual({
      status: 409,
      body: errorBody('no_objections_left'),
    });
  });

  it('gives the round to the other table when the clock runs out, once from both phones', async () => {
    const t = await started('harf');
    await t.call(t.owner, { action: 'begin' });
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    expect((await state(t.roomId)).gs.roundNo).toBe(1);
    await expire(t.roomId, 'endsAt');
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    expect(await t.call(t.owner, { action: 'advance' })).toEqual(OK);
    expect((await state(t.roomId)).gs).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 1 },
      lastRound: { roundNo: 1, winner: 'guest', reason: 'timeout' },
    });
  });

  it('gives the full board to the table that closed the last letter, after the window', async () => {
    const t = await started('harf');
    await t.call(t.owner, { action: 'begin' });
    // All but Z closed; the owner's turn.
    await sql`
      update public.rooms
      set game_state = jsonb_set(game_state, '{letters}', (
        select jsonb_agg(jsonb_build_object('letter', l, 'closed', l <> 'Z') order by o)
        from unnest(private.say_letters()) with ordinality as x(l, o)
      ))
      where id = ${t.roomId}
    `;
    await t.call(t.owner, { action: 'claim', round: 1, step: 0, letter: 'Z' });
    const { gs } = await state(t.roomId);
    expect(gs.endsAt).toBe(gs.objectionEndsAt);
    expect(await t.call(t.guest, { action: 'claim', round: 1, step: 1, letter: 'A' })).toEqual(OK);
    await expire(t.roomId, 'endsAt');
    await t.call(t.guest, { action: 'advance' });
    expect((await state(t.roomId)).gs).toMatchObject({
      roundNo: 2,
      scores: { owner: 1, guest: 0 },
      lastRound: { winner: 'owner', reason: 'board' },
    });
  });

  it('ends after 5 categories: results for both accounts, the room back to chat with the scores', async () => {
    const t = await started('harf');
    for (let round = 1; round <= 5; round++) {
      const { gs } = await state(t.roomId);
      await t.call(gs.turnTable === 'owner' ? t.owner : t.guest, { action: 'begin' });
      await expire(t.roomId, 'endsAt');
      await t.call(t.owner, { action: 'advance' });
    }
    const { concept, gs } = await state(t.roomId);
    expect(concept).toBeNull();
    // Rounds 1, 3, 5 the owner started and ran out; 2, 4 the guest.
    expect(gs.lastGame).toMatchObject({
      concept: 'harf',
      scores: { owner: 2, guest: 3 },
      timeouts: 5,
      objectionsLeft: { owner: 3, guest: 3 },
    });
    const results = await sql`
      select score, won, mode from public.game_results where room_id = ${t.roomId} order by score
    `;
    expect(results).toEqual([
      { score: 2, won: false, mode: 'harf' },
      { score: 3, won: true, mode: 'harf' },
    ]);
    const events = await sql`
      select payload from public.game_events where room_id = ${t.roomId} and type = 'game_completed'
    `;
    expect(events).toEqual([{ payload: { concept: 'harf', scores: { owner: 2, guest: 3 } } }]);
  });

  it('plays the same game as pure/sayChallenge.ts', async () => {
    const t = await started('harf');
    const steps: {
      by: 'owner' | 'guest';
      action: 'claim' | 'object' | 'timeout';
      letter?: string;
    }[] = [
      { by: 'owner', action: 'claim', letter: 'A' },
      { by: 'guest', action: 'claim', letter: 'B' },
      { by: 'owner', action: 'object' },
    ];
    let pure = sayBegin(newSayGame('harf', (await state(t.roomId)).gs.prompt, 0), 'owner', 0);
    await t.call(t.owner, { action: 'begin' });
    for (const s of steps) {
      const { gs } = await state(t.roomId);
      const client = s.by === 'owner' ? t.owner : t.guest;
      if (s.action === 'claim') {
        await t.call(client, {
          action: 'claim',
          round: gs.roundNo,
          step: gs.step,
          letter: s.letter,
        });
        pure = sayClaim(pure, s.by, pure.roundNo, pure.step, s.letter ?? null, 1);
      } else {
        await t.call(client, { action: 'object', round: gs.roundNo, step: gs.lastClaim?.step });
        pure = sayObject(pure, s.by, pure.roundNo, pure.lastClaim?.step ?? 0, () => 'x', 1);
      }
    }
    const { gs } = await state(t.roomId);
    const pick = (
      g: Pick<Gs, 'roundNo' | 'turnTable' | 'step' | 'scores' | 'objectionsLeft' | 'lastRound'>,
    ) => ({
      roundNo: g.roundNo,
      turnTable: g.turnTable,
      step: g.step,
      scores: g.scores,
      objectionsLeft: g.objectionsLeft,
      lastRound: g.lastRound,
    });
    expect(pick(gs)).toEqual(pick(pure));
    // And a round run out on the clock.
    await t.call(gs.turnTable === 'owner' ? t.owner : t.guest, { action: 'begin' });
    pure = sayBegin(pure, pure.turnTable, 2);
    await expire(t.roomId, 'endsAt');
    await t.call(t.guest, { action: 'advance' });
    pure = sayAdvance(pure, () => 'x', Number.MAX_SAFE_INTEGER);
    expect(pick((await state(t.roomId)).gs)).toEqual(pick(pure));
  });

  it('keeps the scores and where it stopped when "Oyunu bitir" ends it', async () => {
    const t = await started('harf');
    await t.call(t.owner, { action: 'begin' });
    await expire(t.roomId, 'endsAt');
    await t.call(t.owner, { action: 'advance' });
    await rooms(t.guest, { action: 'end-game', roomId: t.roomId });
    expect((await state(t.roomId)).gs.lastGame).toEqual({
      concept: 'harf',
      abandoned: true,
      turnNo: 2,
      totalTurns: 5,
      scores: { owner: 0, guest: 1 },
    });
  });
});

describe('Şarkıda Geçsin, two tables', () => {
  it('opens only the first word ready; the next word starts at once with the other table', async () => {
    const t = await started('sarki');
    const { gs } = await state(t.roomId);
    expect(gs).toMatchObject({ turnPhase: 'ready', totalRounds: 8, letters: [] });
    const [card] = await sql`
      select c.word from public.room_used_cards u join public.cards c on c.id = u.card_id
      where u.room_id = ${t.roomId} and c.deck = 'sarki'
    `;
    expect(card?.word).toBe(gs.prompt);
    // Başla and the clock's advance, each sent twice (the app retries after a 5xx): one start, one
    // word lost.
    expect(await t.call(t.owner, { action: 'begin' })).toEqual(OK);
    const begun = (await state(t.roomId)).gs;
    expect(await t.call(t.owner, { action: 'begin' })).toEqual(OK);
    expect((await state(t.roomId)).gs).toEqual(begun);
    await expire(t.roomId, 'endsAt');
    expect(await t.call(t.guest, { action: 'advance' })).toEqual(OK);
    expect(await t.call(t.owner, { action: 'advance' })).toEqual(OK);
    const next = (await state(t.roomId)).gs;
    expect(next).toMatchObject({
      roundNo: 2,
      turnTable: 'guest',
      turnPhase: 'running',
      readyEndsAt: null,
    });
    expect(next.prompt).not.toBe(gs.prompt);
    expect(Date.parse(String(next.endsAt)) - Date.now()).toBeGreaterThan(8_000);
  });

  it('ends a word without a point after the 8th line; Harf’s action is not Şarkı’s', async () => {
    const t = await started('sarki');
    await t.call(t.owner, { action: 'begin' });
    for (let step = 0; step < 8; step++) {
      const { gs } = await state(t.roomId);
      expect(
        await t.call(gs.turnTable === 'owner' ? t.owner : t.guest, {
          action: 'said',
          round: 1,
          step,
        }),
      ).toEqual(OK);
    }
    const { gs } = await state(t.roomId);
    expect(gs).toMatchObject({ step: 8, lastClaim: { table: 'guest', step: 7, letter: null } });
    expect(gs.endsAt).toBe(gs.objectionEndsAt);
    expect(
      (await t.call(t.owner, { action: 'claim', round: 1, step: 8, letter: 'A' })).status,
    ).toBe(400);
    await expire(t.roomId, 'endsAt');
    await t.call(t.owner, { action: 'advance' });
    expect((await state(t.roomId)).gs).toMatchObject({
      roundNo: 2,
      scores: { owner: 0, guest: 0 },
      lastRound: { winner: null, reason: 'lines' },
    });
  });

  it('gives the last two words 5 seconds a line', async () => {
    const t = await started('sarki');
    await sql`
      update public.rooms set game_state = game_state || '{"roundNo": 6, "turnPhase": "running"}'::jsonb
      where id = ${t.roomId}
    `;
    await expire(t.roomId, 'endsAt');
    await t.call(t.owner, { action: 'advance' });
    const { gs } = await state(t.roomId);
    expect(gs.roundNo).toBe(7);
    const left = Date.parse(String(gs.endsAt)) - Date.now();
    expect(left).toBeGreaterThan(3_000);
    expect(left).toBeLessThanOrEqual(5_000);
  });
});

describe('one table', () => {
  it('has no local deck for a two-table room', async () => {
    const r = await room();
    expect(await invoke(r.owner, 'harf', { action: 'start', roomId: r.roomId })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
  });

  it('deals 5 categories or 8 words to a one-table room', async () => {
    const [a] = (await Promise.all([onboarded(PHONES[0] as string)])) as [Client];
    await checkInAt(a, venue, V, 2);
    for (const kind of ['harf', 'sarki'] as const) {
      const created = await rooms(a, { action: 'create', profiled: false });
      const roomId = (created.body as { roomId: string }).roomId;
      const res = await invoke(a, kind, { action: 'start', roomId });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const prompts = (res.body as { prompts: string[] }).prompts;
      expect(prompts).toHaveLength(SAY_CONFIG[kind].totalRounds);
      expect(new Set(prompts).size).toBe(prompts.length);
      expect((await state(roomId)).concept).toBe(kind);
      await rooms(a, { action: 'end' });
    }
  });
});
