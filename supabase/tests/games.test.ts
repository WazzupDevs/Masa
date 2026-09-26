import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { normalize } from '../functions/_shared/pure/trText.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql } from './local.ts';

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

async function room(concept: 'tabu' | 'sohbet', withGuest: boolean) {
  const [owner, guest, third] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  for (const c of [owner, guest, third]) await checkInAt(c, venue, V);
  const created = await invoke(owner, 'rooms', { action: 'create', concept, visibility: 'open' });
  const roomId = (created.body as { roomId: string }).roomId;
  if (withGuest) {
    await invoke(guest, 'rooms', { action: 'request-join', roomId });
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

async function expireTurn(roomId: string) {
  await sql`update public.tabu_turns set ends_at = now() - interval '1 second' where room_id = ${roomId}`;
  await sql`
    update public.rooms set game_state = jsonb_set(game_state, '{turnEndsAt}', to_jsonb(now() - interval '1 second'))
    where id = ${roomId}
  `;
}

describe('tabu, one table', () => {
  it('hands the deck to the room member and nobody else', async () => {
    const { owner, third, roomId } = await room('tabu', false);
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
  });

  it('refuses a Sohbet room', async () => {
    const { owner, roomId } = await room('sohbet', false);
    expect(await tabu(owner, { action: 'start', roomId })).toEqual({
      status: 409,
      body: errorBody('wrong_concept'),
    });
  });
});

describe('tabu, two tables face to face (docs/SPEC_V2.md §8.2)', () => {
  async function started() {
    const r = await room('tabu', true);
    expect(await tabu(r.owner, { action: 'start', roomId: r.roomId })).toEqual({
      status: 200,
      body: { mode: 'server' },
    });
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

  it('lets only the owner start, the owner table describes first, and the state holds no card', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    expect(await tabu(guest, { action: 'start', roomId })).toEqual({
      status: 403,
      body: errorBody('not_owner'),
    });
    expect((await tabu(owner, { action: 'start', roomId })).status).toBe(200);
    expect(await tabu(owner, { action: 'start', roomId })).toEqual({
      status: 409,
      body: errorBody('game_in_progress'),
    });
    const state = await gameState(roomId);
    expect(state).toMatchObject({
      concept: 'tabu',
      mode: 'voice',
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
        'scores',
        'totalTurns',
        'turnEndsAt',
        'turnNo',
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
    });
    const second = await turnCards(owner, roomId);
    expect(second.body.turnNo).toBe(2);
    const firstWords = new Set(first.body.cards.map((c) => c.word));
    expect(second.body.cards.some((c) => firstWords.has(c.word))).toBe(false);
    // Roles swap: the owner table judges now.
    expect(await mark(owner, roomId, 2, 0, 'taboo')).toEqual(OK);
    expect(await mark(guest, roomId, 2, 1, 'pass')).toEqual(OK);
    expect(await gameState(roomId)).toMatchObject({ scores: { owner: 0, guest: -1 } });
  });

  it('writes a result per account at the end, and the owner can play again', async () => {
    const { owner, guest, roomId } = await started();
    await mark(guest, roomId, 1, 0, 'correct');
    for (let turn = 1; turn <= 6; turn++) {
      await expireTurn(roomId);
      await tabu(owner, { action: 'end-turn', roomId });
    }
    expect(await gameState(roomId)).toMatchObject({
      phase: 'finished',
      scores: { owner: 1, guest: 0 },
    });
    const results = await sql`
      select u.phone, g.concept, g.mode, g.score, g.won from public.game_results g
      join auth.users u on u.id = g.user_id order by u.phone
    `;
    expect(results).toEqual([
      { phone: PHONES[0].replace(/\D/g, ''), concept: 'tabu', mode: 'voice', score: 1, won: true },
      { phone: PHONES[1].replace(/\D/g, ''), concept: 'tabu', mode: 'voice', score: 0, won: false },
    ]);
    expect((await tabu(guest, { action: 'start', roomId })).status).toBe(403);
    expect((await tabu(owner, { action: 'start', roomId })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({ gameNo: 2, scores: { owner: 0, guest: 0 } });
  });

  it('resets the game when the guest leaves', async () => {
    const { guest, roomId } = await started();
    await invoke(guest, 'rooms', { action: 'leave' });
    expect(await gameState(roomId)).toEqual({});
  });

  it('keeps the game functions server-side only, and the written flow is gone', async () => {
    const { owner, roomId } = await started();
    for (const fn of ['tabu_mark', 'tabu_turn_cards', 'tabu_start']) {
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
      where proname in ('tabu_add_clue', 'tabu_guess', 'tabu_pass', 'tabu_current_card')
    `;
    expect(gone).toEqual([]);
  });
});

describe('sohbet', () => {
  it('deals cards to both tables, at most every 5 seconds', async () => {
    const { owner, guest, third, roomId } = await room('sohbet', true);
    expect(await invoke(guest, 'sohbet', { action: 'next-card', roomId })).toEqual({
      status: 200,
      body: { ok: true },
    });
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

  it('works in a one-table room and lets clients read the Sohbet deck', async () => {
    const { owner, roomId } = await room('sohbet', false);
    expect((await invoke(owner, 'sohbet', { action: 'next-card', roomId })).status).toBe(200);
    const { data } = await owner.from('cards').select('deck').limit(5);
    expect(new Set((data ?? []).map((c) => c.deck))).toEqual(new Set(['sohbet']));
  });
});
