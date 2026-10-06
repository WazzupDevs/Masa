import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { summarizeTurn, TABU, tabuMode } from '../functions/_shared/pure/tabu.ts';
import { normalize } from '../functions/_shared/pure/trText.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, dbUrl, deleteUserByPhone, invoke, sql } from './local.ts';

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

const tabu = (client: Client, body: Record<string, unknown>) => invoke(client, 'tabu', body);
const rooms = (client: Client, body: Record<string, unknown>) => invoke(client, 'rooms', body);

// A room starts as a chat, without a game (docs/SPEC_V3.md §5.1). Tables of 3 unless given.
async function room(withGuest: boolean, headcounts: { owner?: number; guest?: number } = {}) {
  const [owner, guest, third] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  await checkInAt(owner, venue, V, headcounts.owner ?? 3);
  await checkInAt(guest, venue, V, headcounts.guest ?? 3);
  await checkInAt(third, venue, V);
  const created = await rooms(owner, { action: 'create', profiled: false });
  const roomId = (created.body as { roomId: string }).roomId;
  if (withGuest) {
    await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false });
    const [request] =
      await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
    await invoke(owner, 'rooms', { action: 'respond', requestId: request?.id, accept: true });
  }
  return { owner, guest, third, roomId };
}

async function gameState(roomId: string) {
  const [row] = await sql`select game_state from public.rooms where id = ${roomId}`;
  return row?.game_state as Record<string, unknown>;
}

async function conceptOf(roomId: string) {
  const [row] = await sql`select concept from public.rooms where id = ${roomId}`;
  return row?.concept as string | null;
}

async function proposalOf(roomId: string) {
  const [row] =
    await sql`select concept, proposer_session_id from public.game_proposals where room_id = ${roomId}`;
  return row ?? null;
}

// One table proposes, the other accepts: the only way a two-table game starts (rule 3).
async function play(
  proposer: Client,
  answerer: Client,
  roomId: string,
  concept: 'tabu' | 'sohbet',
): Promise<void> {
  const proposed = await rooms(proposer, { action: 'propose-game', roomId, concept });
  expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
  const answered = await rooms(answerer, { action: 'answer-game', roomId, accept: true });
  expect(answered, JSON.stringify(answered.body)).toEqual({ status: 200, body: { ok: true } });
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Table aliases come from alias_words, whose animals are Tabu words too ("Kelebek").
const ALIAS_COLUMNS = new Set(['owner_alias', 'guest_alias', 'sender_alias']);

// Everything a member's client can read about the room outside tabu/turn-cards, as one string:
// every value, and every key inside JSON values. Column names are left out (they are the schema,
// and `created_at` would read as the card "At"), and so are the alias columns.
async function readableBy(guest: Client, roomId: string): Promise<string> {
  const reads = await Promise.all([
    guest.from('rooms').select('*').eq('id', roomId),
    guest.from('game_events').select('*').eq('room_id', roomId),
    guest.from('messages').select('*').eq('room_id', roomId),
    guest.from('my_join_requests').select('*'),
  ]);
  const rows = reads.flatMap((r) => (r.data ?? []) as Record<string, unknown>[]);
  const values = rows.flatMap((row) =>
    Object.entries(row)
      .filter(([column]) => !ALIAS_COLUMNS.has(column))
      .map(([, value]) => value),
  );
  // Random ids are not data either; a 4-hex chunk could read as the card "Dede".
  return normalize(JSON.stringify(values).replace(UUID, ' '));
}

// tabu/begin-turn (docs/SPEC_V3.md §19.1).
const begin = (client: Client, roomId: string) =>
  invoke(client, 'tabu', { action: 'begin-turn', roomId });

// Starts the ready turn from whichever table, as when readyEndsAt has passed.
async function beginNow(client: Client, roomId: string) {
  await sql`
    update public.tabu_turns set ready_ends_at = now() - interval '1 second'
    where room_id = ${roomId} and ends_at is null
  `;
  const begun = await begin(client, roomId);
  expect(begun, JSON.stringify(begun.body)).toEqual({ status: 200, body: { ok: true } });
}

async function expireTurn(roomId: string) {
  await sql`update public.tabu_turns set ends_at = now() - interval '1 second' where room_id = ${roomId}`;
  await sql`
    update public.rooms set game_state = jsonb_set(game_state, '{turnEndsAt}', to_jsonb(now() - interval '1 second'))
    where id = ${roomId}
  `;
}

describe('tabu, one table', () => {
  it('hands the deck to the room member and nobody else, without a proposal', async () => {
    const { owner, third, roomId } = await room(false);
    const res = await tabu(owner, { action: 'start', roomId });
    expect(res.status).toBe(200);
    const body = res.body as { mode: string; deck: { word: string; forbidden: string[] }[] };
    expect(body.mode).toBe('local');
    expect(body.deck.length).toBe(120);
    expect(body.deck.every((c) => c.forbidden.length === 5)).toBe(true);
    expect(await tabu(third, { action: 'start', roomId })).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
    // The room's activity is Tabu until "Oyunu bitir" (or a second table joins).
    expect(await conceptOf(roomId)).toBe('tabu');
    expect(await rooms(owner, { action: 'end-game', roomId })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await conceptOf(roomId)).toBeNull();
    expect(await gameState(roomId)).toEqual({ lastGame: { concept: 'tabu' } });
  });

  it('refuses a second game while Sohbet kartları runs', async () => {
    const { owner, roomId } = await room(false);
    expect((await invoke(owner, 'sohbet', { action: 'next-card', roomId })).status).toBe(200);
    expect(await tabu(owner, { action: 'start', roomId })).toEqual({
      status: 409,
      body: errorBody('game_in_progress'),
    });
  });

  it('ends the one-table game when a second table joins: the room returns to chat', async () => {
    const { owner, guest, roomId } = await room(false);
    expect((await tabu(owner, { action: 'start', roomId })).status).toBe(200);
    await rooms(guest, { action: 'request-join', roomId, profiled: false });
    const [request] =
      await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
    await rooms(owner, { action: 'respond', requestId: request?.id, accept: true });
    expect(await conceptOf(roomId)).toBeNull();
    expect(await gameState(roomId)).toEqual({});
    expect(await tabu(owner, { action: 'start', roomId })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
  });
});

describe('game proposals (docs/SPEC_V3.md §5.3)', () => {
  it('starts a room as a chat and a game only when the other table accepts', async () => {
    const { owner, guest, third, roomId } = await room(true);
    expect(await conceptOf(roomId)).toBeNull();
    expect(await rooms(owner, { action: 'propose-game', roomId, concept: 'tabu' })).toEqual({
      status: 200,
      body: { expiresAt: expect.any(String) },
    });
    // Both tables read the proposal; nobody else does.
    for (const member of [owner, guest]) {
      const { data } = await member.from('game_proposals').select('concept').eq('room_id', roomId);
      expect(data).toEqual([{ concept: 'tabu' }]);
    }
    expect((await third.from('game_proposals').select('room_id')).data).toEqual([]);
    // The proposer cannot answer its own proposal; the game has not started.
    expect(await rooms(owner, { action: 'answer-game', roomId, accept: true })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
    expect(await conceptOf(roomId)).toBeNull();

    expect(await rooms(guest, { action: 'answer-game', roomId, accept: true })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await proposalOf(roomId)).toBeNull();
    expect(await conceptOf(roomId)).toBe('tabu');
    expect(await gameState(roomId)).toMatchObject({ phase: 'playing', describingTable: 'owner' });
  });

  it('allows one proposal at a time, only in a two-table room with no game', async () => {
    const solo = await room(false);
    expect(
      await rooms(solo.owner, { action: 'propose-game', roomId: solo.roomId, concept: 'tabu' }),
    ).toEqual({ status: 409, body: errorBody('needs_two_tables') });
    for (const phone of PHONES) await deleteUserByPhone(phone);

    const { owner, guest, roomId } = await room(true);
    expect((await rooms(owner, { action: 'propose-game', roomId, concept: 'sohbet' })).status).toBe(
      200,
    );
    for (const table of [owner, guest]) {
      expect(await rooms(table, { action: 'propose-game', roomId, concept: 'tabu' })).toEqual({
        status: 409,
        body: errorBody('proposal_pending'),
      });
    }
    await rooms(guest, { action: 'answer-game', roomId, accept: true });
    expect(await conceptOf(roomId)).toBe('sohbet');
    expect(await rooms(guest, { action: 'propose-game', roomId, concept: 'tabu' })).toEqual({
      status: 409,
      body: errorBody('game_in_progress'),
    });
  });

  // S7: a decline shows at once; a timeout at 30 seconds. Both delete the row and leave the
  // proposer the same thing to read. The test does not claim equal timing.
  it('deletes a declined and an expired proposal alike', async () => {
    const { owner, guest, roomId } = await room(true);
    await rooms(owner, { action: 'propose-game', roomId, concept: 'tabu' });
    expect(await rooms(guest, { action: 'answer-game', roomId, accept: false })).toEqual({
      status: 200,
      body: { ok: true },
    });
    const afterDecline = await owner.from('game_proposals').select('*').eq('room_id', roomId);
    const roomAfterDecline = await gameState(roomId);

    await rooms(owner, { action: 'propose-game', roomId, concept: 'tabu' });
    await sql`update public.game_proposals set expires_at = now() - interval '1 second' where room_id = ${roomId}`;
    expect(await rooms(guest, { action: 'answer-game', roomId, accept: true })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
    await sql`select private.expire_game_proposals()`;
    const afterTimeout = await owner.from('game_proposals').select('*').eq('room_id', roomId);

    expect(afterDecline.data).toEqual([]);
    expect(afterTimeout.data).toEqual(afterDecline.data);
    expect(await gameState(roomId)).toEqual(roomAfterDecline);
    expect(await conceptOf(roomId)).toBeNull();
  });

  it('skips a proposal a user action holds instead of waiting for it', async () => {
    const { owner, roomId } = await room(true);
    await rooms(owner, { action: 'propose-game', roomId, concept: 'tabu' });
    await sql`update public.game_proposals set expires_at = now() - interval '1 second' where room_id = ${roomId}`;
    const job = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      await sql.begin(async (tx) => {
        await tx`select room_id from public.game_proposals where room_id = ${roomId} for update`;
        const [ran] = await job.begin(async (jtx) => {
          await jtx`set local lock_timeout = '2s'`;
          return jtx`select private.expire_game_proposals() as n`;
        });
        expect(ran).toEqual({ n: 0 });
      });
    } finally {
      await job.end();
    }
    const [next] = await sql`select private.expire_game_proposals() as n`;
    expect(next).toEqual({ n: 1 });
  });
});

describe('tabu, two tables face to face (docs/SPEC_V2.md §8.2)', () => {
  async function started() {
    const r = await room(true);
    await play(r.guest, r.owner, r.roomId, 'tabu');
    await begin(r.owner, r.roomId);
    return r;
  }

  async function turnCards(client: Client, roomId: string) {
    return (await tabu(client, { action: 'turn-cards', roomId })) as {
      status: number;
      body: { turnNo: number; cards: { word: string; forbidden: string[] }[] };
    };
  }

  const mark = (
    client: Client,
    roomId: string,
    turnNo: number,
    cardIndex: number,
    result: string,
  ) => tabu(client, { action: 'mark', roomId, turnNo, cardIndex, result });
  const OK = { status: 200, body: { ok: true } };

  it('starts only from an accepted proposal, the owner table describes first, and the state holds no card', async () => {
    const { owner, guest, roomId } = await room(true);
    for (const table of [owner, guest]) {
      expect(await tabu(table, { action: 'start', roomId })).toEqual({
        status: 409,
        body: errorBody('no_proposal'),
      });
    }
    // Whichever table proposed, the owner's table describes first.
    await play(guest, owner, roomId, 'tabu');
    const state = await gameState(roomId);
    expect(state).toMatchObject({
      concept: 'tabu',
      mode: 'refereed',
      phase: 'playing',
      turnNo: 1,
      totalTurns: 6,
      turnSeconds: 60,
      cardsPerTurn: 40,
      describingTable: 'owner',
      scores: { owner: 0, guest: 0 },
      passesUsed: 0,
      maxPasses: 3,
      cardIndex: 0,
    });
    expect(Object.keys(state).sort()).toEqual(
      [
        'cardIndex',
        'cardsPerTurn',
        'concept',
        'describingTable',
        'gameNo',
        'maxPasses',
        'mode',
        'passesUsed',
        'phase',
        'readyEndsAt',
        'scores',
        'totalTurns',
        'turnNo',
        'turnPhase',
        'turnSeconds',
      ].sort(),
    );
  });

  it("hands the turn's ordered card list to both tables, and to nobody outside the room", async () => {
    const { owner, guest, third, roomId } = await started();
    const [a, b] = await Promise.all([turnCards(owner, roomId), turnCards(guest, roomId)]);
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    // Sent twice, the same answer: the app may resend it after a 5xx (pure/apiRetry.ts).
    expect(await turnCards(owner, roomId)).toEqual(a);
    expect(a.body.turnNo).toBe(1);
    expect(a.body.cards).toHaveLength(40);
    expect(new Set(a.body.cards.map((c) => c.word)).size).toBe(40);
    expect(await turnCards(third, roomId)).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });
    // The public room row and events carry no card of the list.
    const readable = await readableBy(guest, roomId);
    // The Tabu deck is not readable by the app (the Sohbet deck is, by design).
    const deck = await guest.from('cards').select('word').eq('deck', 'tabu');
    expect(deck.data ?? []).toEqual([]);
    // No word of the whole deck, dealt or not, so the check does not depend on the deal. Whole
    // words only: the text is normalized with spaces around every word.
    const deckWords = (await sql`select word from public.cards where deck = 'tabu'`).map((row) =>
      normalize(String(row.word)),
    );
    expect(deckWords).toEqual(expect.arrayContaining(a.body.cards.map((c) => normalize(c.word))));
    expect(deckWords.filter((word) => ` ${readable} `.includes(` ${word} `))).toEqual([]);
  });

  it('lets the judge say Tabu, the describer say Pas, and both say Doğru', async () => {
    const { owner, guest, roomId } = await started();
    // Turn 1: the owner table describes, the guest table judges.
    expect(await mark(owner, roomId, 1, 0, 'taboo')).toEqual({
      status: 403,
      body: errorBody('not_judge'),
    });
    expect(await mark(guest, roomId, 1, 0, 'pass')).toEqual({
      status: 403,
      body: errorBody('not_describer'),
    });
    expect(await mark(owner, roomId, 1, 0, 'correct')).toEqual(OK);
    expect(await mark(guest, roomId, 1, 1, 'correct')).toEqual(OK);
    expect(await mark(guest, roomId, 1, 2, 'taboo')).toEqual(OK);
    expect(await mark(owner, roomId, 1, 3, 'pass')).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({
      scores: { owner: 1, guest: 0 },
      passesUsed: 1,
      cardIndex: 4,
    });
    const closed = await sql`
      select payload ->> 'cardIndex' as i, payload ->> 'result' as result from public.game_events
      where room_id = ${roomId} and type = 'card_closed' order by created_at
    `;
    expect(closed.map((e) => [Number(e.i), e.result])).toEqual([
      [0, 'correct'],
      [1, 'correct'],
      [2, 'taboo'],
      [3, 'pass'],
    ]);
  });

  it('ignores a second mark on the same card, a stale turn and a card ahead, without an error', async () => {
    const { owner, guest, roomId } = await started();
    expect(await mark(guest, roomId, 1, 0, 'correct')).toEqual(OK);
    const after = await gameState(roomId);
    // Both tables pressed on card 0: the server's first answer stands.
    expect(await mark(owner, roomId, 1, 0, 'correct')).toEqual(OK);
    expect(await mark(guest, roomId, 1, 0, 'taboo')).toEqual(OK);
    expect(await mark(guest, roomId, 2, 1, 'correct')).toEqual(OK);
    expect(await mark(guest, roomId, 1, 5, 'correct')).toEqual(OK);
    expect(await gameState(roomId)).toEqual(after);
    const events = await sql`
      select count(*)::int as n from public.game_events where room_id = ${roomId} and type = 'card_closed'
    `;
    expect(events[0]?.n).toBe(1);
  });

  it('allows 3 passes per turn and refuses marks after ends_at', async () => {
    const { owner, roomId } = await started();
    for (let i = 0; i < 3; i++) expect(await mark(owner, roomId, 1, i, 'pass')).toEqual(OK);
    expect(await mark(owner, roomId, 1, 3, 'pass')).toEqual({
      status: 409,
      body: errorBody('no_passes_left'),
    });
    await expireTurn(roomId);
    expect(await mark(owner, roomId, 1, 3, 'correct')).toEqual({
      status: 409,
      body: errorBody('turn_over'),
    });
  });

  it('alternates the tables, deals a new list per turn, and ends turns idempotently', async () => {
    const { owner, guest, roomId } = await started();
    const first = await turnCards(guest, roomId);
    expect((await tabu(guest, { action: 'end-turn', roomId })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({ turnNo: 1 });
    await expireTurn(roomId);
    expect((await tabu(owner, { action: 'end-turn', roomId })).status).toBe(200);
    expect((await tabu(guest, { action: 'end-turn', roomId })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({
      turnNo: 2,
      describingTable: 'guest',
      cardIndex: 0,
      passesUsed: 0,
      turnPhase: 'ready',
    });
    expect(await begin(guest, roomId)).toEqual(OK);
    const second = await turnCards(owner, roomId);
    expect(second.body.turnNo).toBe(2);
    // Only turn 1's shown card (the first) is used; the cards it never showed may come again
    // (docs/SPEC_V3.md §19.1).
    const shownWord = first.body.cards[0]?.word;
    expect(second.body.cards.some((c) => c.word === shownWord)).toBe(false);
    // Roles swap: the owner table judges now.
    expect(await mark(owner, roomId, 2, 0, 'taboo')).toEqual(OK);
    expect(await mark(guest, roomId, 2, 1, 'pass')).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({ scores: { owner: 0, guest: -1 } });
  });

  it('writes a result per account at the end, returns to chat, and a new proposal plays again', async () => {
    const { owner, guest, roomId } = await started();
    await mark(guest, roomId, 1, 0, 'correct');
    for (let turn = 1; turn <= 6; turn++) {
      await beginNow(owner, roomId);
      await expireTurn(roomId);
      await tabu(owner, { action: 'end-turn', roomId });
    }
    // The room returns to chat; the result stays as lastGame between games.
    expect(await conceptOf(roomId)).toBeNull();
    expect(await gameState(roomId)).toEqual({
      gameNo: 1,
      lastGame: { concept: 'tabu', scores: { owner: 1, guest: 0 } },
    });
    const results = await sql`
      select u.phone, g.concept, g.mode, g.score, g.won from public.game_results g
      join auth.users u on u.id = g.user_id order by u.phone
    `;
    expect(results).toEqual([
      { phone: PHONES[0].replace(/\D/g, ''), concept: 'tabu', mode: 'voice', score: 1, won: true },
      { phone: PHONES[1].replace(/\D/g, ''), concept: 'tabu', mode: 'voice', score: 0, won: false },
    ]);
    expect((await tabu(owner, { action: 'start', roomId })).status).toBe(409);
    await play(owner, guest, roomId, 'tabu');
    expect(await gameState(roomId)).toMatchObject({ gameNo: 2, scores: { owner: 0, guest: 0 } });
  });

  it('ends a game early with "Oyunu bitir", without a result', async () => {
    const { guest, roomId } = await started();
    expect(await rooms(guest, { action: 'end-game', roomId })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await conceptOf(roomId)).toBeNull();
    // Where the game stopped stays for game_abandoned (docs/SPEC_V3.md §19.1).
    expect(await gameState(roomId)).toEqual({
      gameNo: 1,
      lastGame: { concept: 'tabu', abandoned: true, turnNo: 1, totalTurns: 6 },
    });
    expect(await sql`select 1 from public.game_results`).toHaveLength(0);
    // Idempotent.
    expect((await rooms(guest, { action: 'end-game', roomId })).status).toBe(200);
  });

  it('keeps the game functions server-side only, and the written flow is gone', async () => {
    const { owner, roomId } = await started();
    for (const fn of [
      'tabu_mark',
      'tabu_turn_cards',
      'tabu_local_deck',
      'tabu_end_turn',
      'tabu_begin_turn',
    ]) {
      const { error } = await owner.rpc(
        fn as never,
        {
          target_user_id: '00000000-0000-4000-8000-000000000000',
          target_room_id: roomId,
        } as never,
      );
      expect(error, fn).not.toBeNull();
    }
    for (const action of ['clue', 'guess', 'pass', 'current-card', 'judge']) {
      expect((await tabu(owner, { action, roomId, text: 'deniz' })).status, action).toBe(400);
    }
    const gone = await sql`
      select proname from pg_proc
      where proname in ('tabu_add_clue', 'tabu_guess', 'tabu_pass', 'tabu_current_card', 'tabu_start')
    `;
    expect(gone).toEqual([]);
  });
});

describe('tabu, ready turns (docs/SPEC_V3.md §19.1)', () => {
  const OK = { status: 200, body: { ok: true } };
  const mark = (
    client: Client,
    roomId: string,
    turnNo: number,
    cardIndex: number,
    result: string,
  ) => tabu(client, { action: 'mark', roomId, turnNo, cardIndex, result });

  async function currentTurn(roomId: string) {
    const [row] = await sql`
      select t.ends_at, t.ready_ends_at, t.card_ids from public.tabu_turns t
      join public.rooms r on r.id = t.room_id
      where t.room_id = ${roomId}
        and t.game_no = (r.game_state ->> 'gameNo')::int
        and t.turn_no = (r.game_state ->> 'turnNo')::int
    `;
    return row as { ends_at: Date | null; ready_ends_at: Date; card_ids: string[] };
  }

  async function usedCards(roomId: string): Promise<string[]> {
    const rows = await sql`select card_id from public.room_used_cards where room_id = ${roomId}`;
    return rows.map((r) => String(r.card_id)).sort();
  }

  it('waits as long in SQL as pure/tabu.ts says', async () => {
    const [row] = await sql`select private.tabu_ready_seconds() as s`;
    expect(row?.s).toBe(TABU.readySeconds);
  });

  it('opens every turn ready: no clock, no card, readyEndsAt in 15 seconds', async () => {
    const { owner, guest, roomId } = await room(true);
    const before = Date.now();
    await play(guest, owner, roomId, 'tabu');
    const state = await gameState(roomId);
    expect(state).toMatchObject({ turnPhase: 'ready', turnNo: 1, describingTable: 'owner' });
    expect(state).not.toHaveProperty('turnEndsAt');
    expect(state).not.toHaveProperty('lastTurn');
    const readyEndsAt = Date.parse(String(state.readyEndsAt));
    expect(readyEndsAt - before).toBeGreaterThan((TABU.readySeconds - 2) * 1000);
    expect(readyEndsAt - before).toBeLessThan((TABU.readySeconds + 2) * 1000);

    for (const table of [owner, guest]) {
      expect(await tabu(table, { action: 'turn-cards', roomId })).toEqual({
        status: 409,
        body: errorBody('turn_not_started'),
      });
    }
    expect(await mark(owner, roomId, 1, 0, 'correct')).toEqual({
      status: 409,
      body: errorBody('turn_not_started'),
    });
    // A ready turn has not ended.
    expect(await tabu(guest, { action: 'end-turn', roomId })).toEqual(OK);
    expect(await gameState(roomId)).toEqual(state);
    // Nothing is used before a card is shown.
    expect(await usedCards(roomId)).toEqual([]);
  });

  it('leaves a ready turn alone when the judging table starts it before readyEndsAt', async () => {
    const { owner, guest, roomId } = await room(true);
    await play(guest, owner, roomId, 'tabu');
    const ready = await gameState(roomId);
    expect(await begin(guest, roomId)).toEqual(OK);
    expect(await gameState(roomId)).toEqual(ready);
    expect(
      await sql`select 1 from public.game_events where room_id = ${roomId} and type = 'turn_started'`,
    ).toHaveLength(0);
  });

  it('starts the clock once from the describing table, however often either phone sends it', async () => {
    const { owner, guest, roomId } = await room(true);
    await play(guest, owner, roomId, 'tabu');
    // Sent again (the app retries after a 5xx, pure/apiRetry.ts) and from the other phone: the
    // same answer and the same clock.
    const before = Date.now();
    expect(await begin(owner, roomId)).toEqual(OK);
    const running = await gameState(roomId);
    expect(running).toMatchObject({ turnPhase: 'running', turnNo: 1 });
    expect(running).not.toHaveProperty('readyEndsAt');
    const ends = Date.parse(String(running.turnEndsAt));
    expect(ends - before).toBeGreaterThan((TABU.turnSeconds - 2) * 1000);
    expect(ends - before).toBeLessThan((TABU.turnSeconds + 2) * 1000);
    expect(await begin(owner, roomId)).toEqual(OK);
    expect(await begin(guest, roomId)).toEqual(OK);
    expect(await gameState(roomId)).toEqual(running);
    expect(
      await sql`select 1 from public.game_events where room_id = ${roomId} and type = 'turn_started'`,
    ).toHaveLength(1);
  });

  it('lets either table start turn 2 once readyEndsAt has passed, and nothing without a game', async () => {
    const { owner, guest, roomId } = await room(true);
    await play(guest, owner, roomId, 'tabu');
    await begin(owner, roomId);
    // Turn 2: the guest table describes. The owner table waits for readyEndsAt, then may start.
    await expireTurn(roomId);
    await tabu(owner, { action: 'end-turn', roomId });
    expect(await gameState(roomId)).toMatchObject({
      turnPhase: 'ready',
      turnNo: 2,
      describingTable: 'guest',
    });
    expect(await begin(owner, roomId)).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({ turnPhase: 'ready' });
    await sql`
      update public.tabu_turns set ready_ends_at = now() - interval '1 second'
      where room_id = ${roomId} and ends_at is null
    `;
    expect(await begin(owner, roomId)).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({ turnPhase: 'running', turnNo: 2 });
    expect((await tabu(guest, { action: 'turn-cards', roomId })).status).toBe(200);

    // No game: nothing to start, no error.
    await rooms(owner, { action: 'end-game', roomId });
    expect(await begin(owner, roomId)).toEqual(OK);
  });

  it('keeps the same rules in the cooperative mode: the describer, or anyone after readyEndsAt', async () => {
    const { owner, guest, roomId } = await room(true, { owner: 1, guest: 3 });
    await play(owner, guest, roomId, 'tabu');
    expect(await gameState(roomId)).toMatchObject({ mode: 'cooperative', turnPhase: 'ready' });
    expect(await begin(guest, roomId)).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({ turnPhase: 'ready' });
    expect(await begin(owner, roomId)).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({ turnPhase: 'running' });
  });

  it('shows the previous turn on the ready screen: its score and how its cards closed', async () => {
    const { owner, guest, roomId } = await room(true);
    await play(guest, owner, roomId, 'tabu');
    await begin(owner, roomId);
    const results = ['correct', 'correct', 'taboo', 'pass', 'correct'] as const;
    for (const [i, result] of results.entries()) {
      expect(await mark(result === 'taboo' ? guest : owner, roomId, 1, i, result)).toEqual(OK);
    }
    await expireTurn(roomId);
    await tabu(guest, { action: 'end-turn', roomId });
    const state = await gameState(roomId);
    expect(state.lastTurn).toEqual(summarizeTurn(1, 'owner', results));
    expect(state.lastTurn).toEqual({
      turnNo: 1,
      describingTable: 'owner',
      score: 2,
      correct: 3,
      taboo: 1,
      pass: 1,
    });
    expect(state.scores).toEqual({ owner: 2, guest: 0 });
  });

  it('counts only the cards shown as used; the rest of a list stays free', async () => {
    const { owner, guest, roomId } = await room(true);
    await play(guest, owner, roomId, 'tabu');
    const first = await currentTurn(roomId);
    expect(first.card_ids).toHaveLength(TABU.cardsPerTurn);
    await begin(owner, roomId);
    // The first card is shown when the turn begins.
    expect(await usedCards(roomId)).toEqual([first.card_ids[0]].sort());
    for (let i = 0; i < 3; i++) await mark(owner, roomId, 1, i, 'correct');
    // Three closed, the fourth shown now.
    const shown = first.card_ids.slice(0, 4).sort();
    expect(await usedCards(roomId)).toEqual(shown);
    // A mark the server ignores shows nothing new.
    await mark(owner, roomId, 1, 1, 'correct');
    expect(await usedCards(roomId)).toEqual(shown);

    await expireTurn(roomId);
    await tabu(owner, { action: 'end-turn', roomId });
    const second = await currentTurn(roomId);
    // The next list never repeats a shown card; dealing it marks nothing.
    expect(second.card_ids.filter((id) => shown.includes(id))).toEqual([]);
    expect(await usedCards(roomId)).toEqual(shown);
    // The 36 cards dealt but never shown are free again: the next list may hold them.
    const unshown = first.card_ids.slice(4);
    const [free] = await sql`
      select count(*)::int as n from public.cards c
      where c.id = any(${unshown}::uuid[])
        and not exists (
          select 1 from public.room_used_cards u where u.room_id = ${roomId} and u.card_id = c.id
        )
    `;
    expect(free?.n).toBe(unshown.length);
  });

  it('starts over when fewer unused cards are left than a list needs, without a repeat in the list', async () => {
    const { owner, guest, roomId } = await room(true);
    await play(guest, owner, roomId, 'tabu');
    await begin(owner, roomId);
    // All but 5 cards of the deck are used in this room.
    await sql`
      insert into public.room_used_cards (room_id, card_id)
      select ${roomId}, c.id from public.cards c
      where c.deck = 'tabu' and c.is_active
      order by c.id offset 5
      on conflict do nothing
    `;
    const left = (
      await sql`
        select c.id from public.cards c
        where c.deck = 'tabu' and c.is_active
          and not exists (
            select 1 from public.room_used_cards u where u.room_id = ${roomId} and u.card_id = c.id
          )
      `
    ).map((r) => String(r.id));
    expect(left.length).toBeLessThan(TABU.cardsPerTurn);
    await expireTurn(roomId);
    await tabu(owner, { action: 'end-turn', roomId });
    const next = await currentTurn(roomId);
    expect(next.card_ids).toHaveLength(TABU.cardsPerTurn);
    expect(new Set(next.card_ids).size).toBe(TABU.cardsPerTurn);
    // The cards left come first in the list, then the deck starts over.
    expect(next.card_ids.slice(0, left.length).sort()).toEqual(left.sort());
    expect(await usedCards(roomId)).toEqual([]);
  });
});

describe('tabu modes (docs/SPEC_V3.md §6.1)', () => {
  it('decides the mode in SQL by the same rule as pure/tabu.ts', async () => {
    for (let owner = 1; owner <= 4; owner++) {
      for (let guest = 1; guest <= 4; guest++) {
        const [row] = await sql`select private.tabu_mode(${owner}, ${guest}) as mode`;
        expect(row?.mode, `${owner}+${guest}`).toBe(tabuMode(owner, guest));
      }
    }
  });

  it('plays the whole game in one mode, set from the headcounts when it starts', async () => {
    const refereed = await room(true, { owner: 2, guest: 4 });
    await play(refereed.owner, refereed.guest, refereed.roomId, 'tabu');
    expect(await gameState(refereed.roomId)).toMatchObject({
      mode: 'refereed',
      scores: { owner: 0, guest: 0 },
    });
    await rooms(refereed.owner, { action: 'end-game', roomId: refereed.roomId });
    for (const phone of PHONES) await deleteUserByPhone(phone);

    const coop = await room(true, { owner: 3, guest: 1 });
    await play(coop.owner, coop.guest, coop.roomId, 'tabu');
    expect(await gameState(coop.roomId)).toMatchObject({
      mode: 'cooperative',
      scores: { team: 0 },
    });
    // The headcounts change under a running game (they cannot from the app): the mode stays.
    await sql`update public.rooms set guest_headcount = 3 where id = ${coop.roomId}`;
    await beginNow(coop.owner, coop.roomId);
    await expireTurn(coop.roomId);
    await tabu(coop.owner, { action: 'end-turn', roomId: coop.roomId });
    expect(await gameState(coop.roomId)).toMatchObject({ mode: 'cooperative', turnNo: 2 });
  });
});

// The guessing table's room channel, as the app subscribes to it (useRoom): every row change of
// the room, its events and its proposal.
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

describe('tabu, cooperative mode (docs/SPEC_V3.md §6.3)', () => {
  // The owner's table is one person: cooperative. Turn 1: the owner describes, the guest guesses.
  async function started() {
    const r = await room(true, { owner: 1, guest: 3 });
    await play(r.guest, r.owner, r.roomId, 'tabu');
    await begin(r.owner, r.roomId);
    return r;
  }
  const mark = (client: Client, roomId: string, cardIndex: number, result: string, turnNo = 1) =>
    tabu(client, { action: 'mark', roomId, turnNo, cardIndex, result });
  const turnCards = async (client: Client, roomId: string) =>
    (await tabu(client, { action: 'turn-cards', roomId })) as {
      status: number;
      body: { turnNo: number; cards: { word: string; forbidden: string[] }[] };
    };
  const deckWords = async () =>
    (await sql`select word from public.cards where deck = 'tabu'`).map((row) =>
      normalize(String(row.word)),
    );
  const wordsIn = (text: string, words: string[]) =>
    words.filter((word) => ` ${text} `.includes(` ${word} `));

  it('gives the guessing table no card: not in turn-cards, the room row, events or Realtime', async () => {
    const { owner, guest, roomId } = await room(true, { owner: 1, guest: 3 });
    const watch = watchRoomChannel(guest, roomId);
    expect(await watch.subscribed).toBe('SUBSCRIBED');
    // SUBSCRIBED comes before Postgres Changes are live: touch the row until a change arrives.
    await expect
      .poll(
        async () => {
          await sql`update public.rooms set last_activity_at = last_activity_at where id = ${roomId}`;
          return watch.payloads.length;
        },
        { timeout: 15_000, interval: 500 },
      )
      .toBeGreaterThan(0);

    await play(guest, owner, roomId, 'tabu');
    await begin(owner, roomId);
    expect(await turnCards(guest, roomId)).toEqual({
      status: 403,
      body: errorBody('not_describer'),
    });
    const list = await turnCards(owner, roomId);
    expect(list.status).toBe(200);
    expect(list.body.cards).toHaveLength(40);
    const dealt = list.body.cards.map((c) => normalize(c.word));
    expect(await deckWords()).toEqual(expect.arrayContaining(dealt));

    // Before any action: no word of the deck anywhere the guessing table can read.
    expect(wordsIn(await readableBy(guest, roomId), await deckWords())).toEqual([]);

    // Card 0 closes: its word reaches the room (game_events), the open card's does not.
    expect(await mark(owner, roomId, 0, 'correct')).toEqual({ status: 200, body: { ok: true } });
    const readable = await readableBy(guest, roomId);
    expect(wordsIn(readable, [dealt[0] as string])).toEqual([dealt[0]]);
    const unclosed = dealt.slice(1).filter((w) => w !== dealt[0]);
    expect(wordsIn(readable, unclosed)).toEqual([]);

    // Realtime: give the changes time to arrive, then nothing but the closed card.
    await expect.poll(() => watch.payloads.length, { timeout: 10_000 }).toBeGreaterThan(3);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // As in readableBy: the rows' values only (column names would read as cards: created_at has
    // "at"), and without the alias columns (alias_words' animals are Tabu words too).
    const rows = (
      watch.payloads as { new?: Record<string, unknown>; old?: Record<string, unknown> }[]
    )
      .flatMap((p) => [p.new, p.old])
      .filter((row): row is Record<string, unknown> => !!row);
    const values = rows.flatMap((row) =>
      Object.entries(row)
        .filter(([column]) => !ALIAS_COLUMNS.has(column))
        .map(([, value]) => value),
    );
    expect(values.length).toBeGreaterThan(0);
    const pushed = normalize(JSON.stringify(values).replace(UUID, ' '));
    expect(wordsIn(pushed, unclosed)).toEqual([]);
    await guest.removeChannel(watch.channel);
  });

  it('lets only the describing table press, all three, into one team score', async () => {
    const { owner, guest, roomId } = await started();
    for (const result of ['correct', 'taboo', 'pass']) {
      expect(await mark(guest, roomId, 0, result)).toEqual({
        status: 403,
        body: errorBody('not_describer'),
      });
    }
    expect((await mark(owner, roomId, 0, 'taboo')).status).toBe(200);
    expect((await mark(owner, roomId, 1, 'correct')).status).toBe(200);
    expect((await mark(owner, roomId, 2, 'correct')).status).toBe(200);
    expect((await mark(owner, roomId, 3, 'pass')).status).toBe(200);
    // A second press on a closed card is ignored.
    expect((await mark(owner, roomId, 3, 'correct')).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({
      mode: 'cooperative',
      scores: { team: 1 },
      passesUsed: 1,
      cardIndex: 4,
    });
  });

  it('swaps the describer each turn: the other table gets the cards then', async () => {
    const { owner, guest, roomId } = await started();
    await mark(owner, roomId, 0, 'correct');
    await expireTurn(roomId);
    await tabu(owner, { action: 'end-turn', roomId });
    expect(await gameState(roomId)).toMatchObject({ turnNo: 2, describingTable: 'guest' });
    await begin(guest, roomId);
    expect((await turnCards(owner, roomId)).status).toBe(403);
    expect((await turnCards(guest, roomId)).body.cards).toHaveLength(40);
    expect(await mark(owner, roomId, 0, 'correct', 2)).toEqual({
      status: 403,
      body: errorBody('not_describer'),
    });
    expect((await mark(guest, roomId, 0, 'correct', 2)).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({ scores: { team: 2 } });
  });

  it('writes the same score for both accounts, with no winner, and keeps it as lastGame', async () => {
    const { owner, roomId } = await started();
    await mark(owner, roomId, 0, 'correct');
    for (let turn = 1; turn <= 6; turn++) {
      await beginNow(owner, roomId);
      await expireTurn(roomId);
      await tabu(owner, { action: 'end-turn', roomId });
    }
    expect(await conceptOf(roomId)).toBeNull();
    expect(await gameState(roomId)).toEqual({
      gameNo: 1,
      lastGame: { concept: 'tabu', scores: { team: 1 } },
    });
    const results = await sql`
      select g.concept, g.mode, g.score, g.won from public.game_results g order by g.user_id
    `;
    expect(results).toEqual([
      { concept: 'tabu', mode: 'cooperative', score: 1, won: null },
      { concept: 'tabu', mode: 'cooperative', score: 1, won: null },
    ]);
  });
});

describe('sohbet', () => {
  it('deals cards to both tables once accepted, at most every 5 seconds', async () => {
    const { owner, guest, third, roomId } = await room(true);
    expect(await invoke(guest, 'sohbet', { action: 'next-card', roomId })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
    // The accepted proposal deals the first card.
    await play(owner, guest, roomId, 'sohbet');
    const { data } = await owner.from('rooms').select('game_state').eq('id', roomId).single();
    const first = data?.game_state as { prompt: string; theme: string; nextAllowedAt: string };
    expect(first.prompt.length).toBeGreaterThan(0);
    expect(['isinma', 'film-dizi-muzik', 'hic-yaptin-mi', 'derin']).toContain(first.theme);

    expect(await invoke(owner, 'sohbet', { action: 'next-card', roomId })).toEqual({
      status: 429,
      body: errorBody('too_soon'),
    });
    expect(await invoke(third, 'sohbet', { action: 'next-card', roomId })).toEqual({
      status: 403,
      body: errorBody('not_in_room'),
    });

    await sql`update public.rooms set game_state = jsonb_set(game_state, '{nextAllowedAt}', to_jsonb(now() - interval '1 second')) where id = ${roomId}`;
    expect((await invoke(owner, 'sohbet', { action: 'next-card', roomId })).status).toBe(200);
    expect((await gameState(roomId)).prompt).not.toBe(first.prompt);
  });

  it('works in a one-table room without a proposal and lets clients read the Sohbet deck', async () => {
    const { owner, roomId } = await room(false);
    expect((await invoke(owner, 'sohbet', { action: 'next-card', roomId })).status).toBe(200);
    const { data } = await owner.from('cards').select('deck').limit(5);
    expect(new Set((data ?? []).map((c) => c.deck))).toEqual(new Set(['sohbet']));
  });
});
