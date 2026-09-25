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

async function currentWord(owner: Client, roomId: string): Promise<string> {
  const res = await tabu(owner, { action: 'current-card', roomId });
  expect(res.status).toBe(200);
  return (res.body as { word: string }).word;
}

// Everything the guesser's client can read about the room, as one string.
async function readableByGuesser(guest: Client, roomId: string): Promise<string> {
  const reads = await Promise.all([
    guest.from('rooms').select('*').eq('id', roomId),
    guest.from('game_events').select('*').eq('room_id', roomId),
    guest.from('messages').select('*').eq('room_id', roomId),
    guest.from('cards').select('*'),
    guest.from('my_join_requests').select('*'),
  ]);
  return normalize(JSON.stringify(reads.map((r) => r.data)));
}

// Pins the current turn's card, for tests that depend on the word itself.
async function pinCard(roomId: string, word: string) {
  await sql`
    update public.tabu_turns set card_id = (select id from public.cards where deck = 'tabu' and word = ${word})
    where room_id = ${roomId}
  `;
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

describe('tabu, two tables', () => {
  it('lets only the owner start and keeps the card out of the public state', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    expect(await tabu(guest, { action: 'start', roomId })).toEqual({
      status: 403,
      body: errorBody('not_owner'),
    });
    expect(await tabu(owner, { action: 'start', roomId })).toEqual({
      status: 200,
      body: { mode: 'server' },
    });
    expect(await tabu(owner, { action: 'start', roomId })).toEqual({
      status: 409,
      body: errorBody('game_in_progress'),
    });

    const state = await gameState(roomId);
    const [r] = await sql`select owner_session_id from public.rooms where id = ${roomId}`;
    expect(state).toMatchObject({
      concept: 'tabu',
      phase: 'playing',
      turnNo: 1,
      totalTurns: 6,
      turnSeconds: 60,
      describerSessionId: r?.owner_session_id,
      passesUsed: 0,
      maxPasses: 3,
      score: 0,
    });
    expect(Object.keys(state).sort()).toEqual(
      [
        'concept',
        'describerSessionId',
        'gameNo',
        'maxPasses',
        'passesUsed',
        'phase',
        'score',
        'totalTurns',
        'turnEndsAt',
        'turnNo',
        'turnSeconds',
      ].sort(),
    );
  });

  it('never lets the guesser see the word before the card closes', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    // A card whose word appears nowhere else the guesser can read (aliases, Sohbet prompts), so any
    // occurrence can only be a leak.
    await pinCard(roomId, 'Termometre');
    const word = await currentWord(owner, roomId);
    expect(word).toBe('Termometre');
    expect(await readableByGuesser(guest, roomId)).not.toContain(normalize(word));

    expect(await tabu(guest, { action: 'current-card', roomId })).toEqual({
      status: 403,
      body: errorBody('not_describer'),
    });
    await tabu(owner, { action: 'clue', roomId, text: 'ipucu bir' });
    await tabu(guest, { action: 'guess', roomId, text: 'yanlış tahmin' });
    expect(await readableByGuesser(guest, roomId)).not.toContain(normalize(word));
    const tabuCards = await guest.from('cards').select('id').not('word', 'is', null);
    expect(tabuCards.data).toEqual([]);
    expect((await guest.from('tabu_turns').select('id')).error?.code).toBe('42501');

    // Once the card closes, its word becomes public.
    await tabu(owner, { action: 'pass', roomId });
    expect(await readableByGuesser(guest, roomId)).toContain(normalize(word));
  });

  it('checks clues on the server: forbidden words, roots, profanity, describer only', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    // A root of 4+ letters, so suffixed forms count too (short roots match whole words only, §6).
    await pinCard(roomId, 'Termometre');
    const word = await currentWord(owner, roomId);

    expect(await tabu(owner, { action: 'clue', roomId, text: `${word}ler gibi` })).toEqual({
      status: 422,
      body: errorBody('clue_forbidden'),
    });
    expect(await tabu(owner, { action: 'clue', roomId, text: word.split('').join(' ') })).toEqual({
      status: 422,
      body: errorBody('clue_forbidden'),
    });
    expect(await tabu(owner, { action: 'clue', roomId, text: 'şerefsiz' })).toEqual({
      status: 422,
      body: errorBody('profanity_rejected'),
    });
    expect(await tabu(guest, { action: 'clue', roomId, text: 'ipucu' })).toEqual({
      status: 403,
      body: errorBody('not_describer'),
    });
    expect(await tabu(owner, { action: 'clue', roomId, text: 'güzel bir ipucu' })).toEqual({
      status: 200,
      body: { ok: true },
    });

    const { data: events } = await guest
      .from('game_events')
      .select('type, payload')
      .eq('room_id', roomId)
      .eq('type', 'clue');
    expect(events).toEqual([{ type: 'clue', payload: { text: 'güzel bir ipucu' } }]);
  });

  it('scores a correct guess, closes the card and deals a new one', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    const word = await currentWord(owner, roomId);

    expect(await tabu(guest, { action: 'guess', roomId, text: 'kesinlikle yanlış' })).toEqual({
      status: 200,
      body: { correct: false },
    });
    expect(await tabu(owner, { action: 'guess', roomId, text: word })).toEqual({
      status: 403,
      body: errorBody('not_guesser'),
    });
    expect(
      await tabu(guest, { action: 'guess', roomId, text: word.toLocaleUpperCase('tr-TR') }),
    ).toEqual({ status: 200, body: { correct: true } });

    expect((await gameState(roomId)).score).toBe(1);
    const closed =
      await sql`select payload from public.game_events where room_id = ${roomId} and type = 'card_closed'`;
    expect(closed.map((e) => e.payload)).toEqual([{ word, result: 'correct' }]);
    expect(await currentWord(owner, roomId)).not.toBe(word);
  });

  it('allows 3 passes per turn', async () => {
    const { owner, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    for (let i = 0; i < 3; i++)
      expect((await tabu(owner, { action: 'pass', roomId })).status).toBe(200);
    expect(await tabu(owner, { action: 'pass', roomId })).toEqual({
      status: 409,
      body: errorBody('no_passes_left'),
    });
    expect((await gameState(roomId)).passesUsed).toBe(3);
  });

  it('rejects clues and guesses after ends_at and ends turns idempotently', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    const [r] = await sql`select guest_session_id from public.rooms where id = ${roomId}`;

    expect(await tabu(guest, { action: 'end-turn', roomId })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect((await gameState(roomId)).turnNo).toBe(1);

    await expireTurn(roomId);
    expect(await tabu(owner, { action: 'clue', roomId, text: 'geç kalan ipucu' })).toEqual({
      status: 409,
      body: errorBody('turn_over'),
    });
    expect(await tabu(guest, { action: 'guess', roomId, text: 'geç tahmin' })).toEqual({
      status: 409,
      body: errorBody('turn_over'),
    });

    await Promise.all([
      tabu(owner, { action: 'end-turn', roomId }),
      tabu(guest, { action: 'end-turn', roomId }),
    ]);
    const state = await gameState(roomId);
    expect(state).toMatchObject({
      turnNo: 2,
      describerSessionId: r?.guest_session_id,
      passesUsed: 0,
    });
    const timeouts =
      await sql`select 1 from public.game_events where room_id = ${roomId} and type = 'card_closed' and payload->>'result' = 'timeout'`;
    expect(timeouts).toHaveLength(1);
  });

  it('plays 6 turns, alternating describers, then shows the score and lets the owner play again', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    const [r] =
      await sql`select owner_session_id, guest_session_id from public.rooms where id = ${roomId}`;
    const describers: string[] = [];
    for (let turn = 1; turn <= 6; turn++) {
      const state = await gameState(roomId);
      describers.push(state.describerSessionId === r?.owner_session_id ? 'A' : 'B');
      await expireTurn(roomId);
      await tabu(guest, { action: 'end-turn', roomId });
    }
    expect(describers).toEqual(['A', 'B', 'A', 'B', 'A', 'B']);
    expect((await gameState(roomId)).phase).toBe('finished');
    const done =
      await sql`select payload from public.game_events where room_id = ${roomId} and type = 'game_completed'`;
    expect(done.map((e) => e.payload)).toEqual([{ score: 0 }]);
    // MVP_SPEC §4.6: a finished game keeps the room; only "Odayı bitir" opens "Tanışalım mı?".
    const [after] = await sql`select status, reveal_ends_at from public.rooms where id = ${roomId}`;
    expect(after).toEqual({ status: 'active', reveal_ends_at: null });
    expect(await tabu(guest, { action: 'start', roomId })).toEqual({
      status: 403,
      body: errorBody('not_owner'),
    });
    expect((await tabu(owner, { action: 'start', roomId })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({
      phase: 'playing',
      gameNo: 2,
      turnNo: 1,
      score: 0,
      describerSessionId: r?.owner_session_id,
    });
  });

  it('resets the game when the guest leaves', async () => {
    const { owner, guest, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    await invoke(guest, 'rooms', { action: 'leave' });
    expect(await gameState(roomId)).toEqual({});
  });

  it('keeps the game functions server-side only', async () => {
    const { owner, roomId } = await room('tabu', true);
    const { error } = await owner.rpc('tabu_current_card', {
      target_user_id: '00000000-0000-4000-8000-000000000000',
      target_room_id: roomId,
    });
    expect(error?.code).toBe('42501');
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

describe('tabu, two tables by voice (docs/SPEC_V2.md §8.2)', () => {
  async function voiceRoom() {
    const r = await room('tabu', true);
    expect(await tabu(r.owner, { action: 'start', roomId: r.roomId, mode: 'voice' })).toEqual({
      status: 200,
      body: { mode: 'server' },
    });
    return r;
  }

  async function card(client: Client, roomId: string) {
    const res = await tabu(client, { action: 'current-card', roomId });
    return res as { status: number; body: { cardId: string; word: string; forbidden: string[] } };
  }

  const judge = (client: Client, roomId: string, cardId: string, result: string) =>
    tabu(client, { action: 'judge', roomId, cardId, result });

  it('starts with the owner table describing and one score per table, without the card', async () => {
    const { roomId } = await voiceRoom();
    const state = await gameState(roomId);
    expect(state).toMatchObject({
      concept: 'tabu',
      mode: 'voice',
      phase: 'playing',
      turnNo: 1,
      totalTurns: 6,
      turnSeconds: 60,
      describingTable: 'owner',
      scores: { owner: 0, guest: 0 },
      passesUsed: 0,
      maxPasses: 3,
    });
    expect(JSON.stringify(state)).not.toMatch(/word|forbidden|card/i);
  });

  it('gives the card to both tables and to nobody outside the room', async () => {
    const { owner, guest, third, roomId } = await voiceRoom();
    const [a, b] = await Promise.all([card(owner, roomId), card(guest, roomId)]);
    expect(a.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect(a.body.forbidden.length).toBeGreaterThan(0);
    expect(await card(third, roomId)).toEqual({ status: 403, body: errorBody('not_in_room') });
  });

  it('lets only the judging table act, and scores +1, −1 and 0 for the describing table', async () => {
    const { owner, guest, roomId } = await voiceRoom();
    let current = (await card(guest, roomId)).body.cardId;
    expect(await judge(owner, roomId, current, 'correct')).toEqual({
      status: 403,
      body: errorBody('not_judge'),
    });

    expect((await judge(guest, roomId, current, 'correct')).status).toBe(200);
    const afterCorrect = (await card(guest, roomId)).body.cardId;
    expect(afterCorrect).not.toBe(current);
    // A second press on the closed card is refused, not counted twice.
    expect(await judge(guest, roomId, current, 'correct')).toEqual({
      status: 409,
      body: errorBody('card_changed'),
    });
    current = afterCorrect;
    expect((await judge(guest, roomId, current, 'taboo')).status).toBe(200);
    current = (await card(guest, roomId)).body.cardId;
    expect((await judge(guest, roomId, current, 'pass')).status).toBe(200);

    expect(await gameState(roomId)).toMatchObject({
      scores: { owner: 0, guest: 0 },
      passesUsed: 1,
    });
    const events = await sql`
      select type, payload ->> 'result' as result from public.game_events
      where room_id = ${roomId} and type in ('correct', 'taboo', 'pass', 'card_closed')
      order by created_at
    `;
    expect(events.map((e) => e.result ?? e.type)).toEqual([
      'correct',
      'correct',
      'taboo',
      'taboo',
      'pass',
      'pass',
    ]);
  });

  it('limits passes per turn and refuses judging after the turn ended', async () => {
    const { guest, roomId } = await voiceRoom();
    for (let i = 0; i < 3; i++) {
      const id = (await card(guest, roomId)).body.cardId;
      expect((await judge(guest, roomId, id, 'pass')).status).toBe(200);
    }
    const id = (await card(guest, roomId)).body.cardId;
    expect(await judge(guest, roomId, id, 'pass')).toEqual({
      status: 409,
      body: errorBody('no_passes_left'),
    });
    await expireTurn(roomId);
    expect(await judge(guest, roomId, id, 'correct')).toEqual({
      status: 409,
      body: errorBody('turn_over'),
    });
  });

  it('alternates the tables and hands the judge buttons to the other one', async () => {
    const { owner, guest, roomId } = await voiceRoom();
    await expireTurn(roomId);
    expect((await tabu(owner, { action: 'end-turn', roomId })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({
      turnNo: 2,
      describingTable: 'guest',
      passesUsed: 0,
    });
    const id = (await card(owner, roomId)).body.cardId;
    expect(await judge(guest, roomId, id, 'correct')).toEqual({
      status: 403,
      body: errorBody('not_judge'),
    });
    expect((await judge(owner, roomId, id, 'correct')).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({ scores: { owner: 0, guest: 1 } });
    // Ending the turn again before it is over changes nothing.
    expect((await tabu(guest, { action: 'end-turn', roomId })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({ turnNo: 2 });
  });

  it('writes a result per account at the end, with its table score and whether it won', async () => {
    const { owner, guest, roomId } = await voiceRoom();
    const id = (await card(guest, roomId)).body.cardId;
    await judge(guest, roomId, id, 'correct');
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
    // The owner can start the next game; the room stays open.
    expect((await tabu(owner, { action: 'start', roomId, mode: 'voice' })).status).toBe(200);
    expect(await gameState(roomId)).toMatchObject({ gameNo: 2, scores: { owner: 0, guest: 0 } });
  });

  it('still opens the written game for a client that does not ask for voice', async () => {
    const { owner, roomId } = await room('tabu', true);
    await tabu(owner, { action: 'start', roomId });
    const state = await gameState(roomId);
    expect(state).toHaveProperty('describerSessionId');
    expect(state).not.toHaveProperty('mode');
  });
});
