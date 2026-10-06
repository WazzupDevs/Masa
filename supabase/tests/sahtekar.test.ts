import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { clueOrder, SAHTEKAR, seatsOf, tally } from '../functions/_shared/pure/sahtekar.ts';
import { normalize } from '../functions/_shared/pure/trText.ts';
import { deleteFixtureVenues, insertFixtureVenues } from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

// Sahtekar (docs/SPEC_V3.md §20.2).
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

const sahtekar = (client: Client, body: Record<string, unknown>) =>
  invoke(client, 'sahtekar', body);
const rooms = (client: Client, body: Record<string, unknown>) => invoke(client, 'rooms', body);

// A two-table room as a chat; the owner's table of `owner` people, the guest's of `guest`.
async function room(owner = 2, guest = 2) {
  const [a, b, third] = (await Promise.all(PHONES.map((p) => onboarded(p)))) as [
    Client,
    Client,
    Client,
  ];
  await checkInAt(a, venue, V, owner);
  await checkInAt(b, venue, V, guest);
  await checkInAt(third, venue, V);
  const created = await rooms(a, { action: 'create', profiled: false });
  const roomId = (created.body as { roomId: string }).roomId;
  await rooms(b, { action: 'request-join', roomId, profiled: false });
  const [request] =
    await sql`select id from public.join_requests where room_id = ${roomId} and status = 'pending'`;
  await rooms(a, { action: 'respond', requestId: request?.id, accept: true });
  return { owner: a, guest: b, third, roomId };
}

// The guest's table proposes, the owner's accepts; counts as given (or the headcounts).
async function started(
  owner = 2,
  guest = 2,
  counts: { proposer?: number; acceptor?: number } = {},
) {
  const r = await room(owner, guest);
  const proposed = await rooms(r.guest, {
    action: 'propose-game',
    roomId: r.roomId,
    concept: 'sahtekar',
    ...(counts.proposer ? { players: counts.proposer } : {}),
  });
  expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
  const answered = await rooms(r.owner, {
    action: 'answer-game',
    roomId: r.roomId,
    accept: true,
    ...(counts.acceptor ? { players: counts.acceptor } : {}),
  });
  return { ...r, answered };
}

async function state(roomId: string): Promise<Record<string, unknown>> {
  const [row] = await sql`select concept, game_state from public.rooms where id = ${roomId}`;
  return { concept: row?.concept as string | null, ...(row?.game_state as object) };
}

async function secret(roomId: string) {
  const [row] = await sql`
    select s.secret from public.game_secrets s join public.rooms r on r.id = s.room_id
    where s.room_id = ${roomId} and s.game_no = (r.game_state ->> 'gameNo')::int
  `;
  return row?.secret as {
    imposter: string;
    word: string;
    options: string[];
    votes: Record<string, string>;
  };
}

// The seat's table: A seats are the owner's.
const tableOf = (t: { owner: Client; guest: Client }, seat: string) =>
  seat.startsWith('A') ? t.owner : t.guest;

async function viewAll(t: { owner: Client; guest: Client; roomId: string }, seats: string[]) {
  for (const seat of seats) {
    const res = await sahtekar(tableOf(t, seat), { action: 'view', roomId: t.roomId, seat });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
}

// Makes `seat` the impostor (the server picks at random).
async function setImposter(roomId: string, seat: string) {
  await sql`
    update public.game_secrets s set secret = jsonb_set(s.secret, '{imposter}', to_jsonb(${seat}::text))
    from public.rooms r
    where r.id = s.room_id and s.room_id = ${roomId} and s.game_no = (r.game_state ->> 'gameNo')::int
  `;
}

async function expire(roomId: string) {
  await sql`
    update public.rooms
    set game_state = jsonb_set(game_state, '{endsAt}', to_jsonb(now() - interval '1 second'))
    where id = ${roomId}
  `;
}

// Through the clues with "Söyledi" from each speaking seat's table.
async function throughClues(t: { owner: Client; guest: Client; roomId: string }) {
  for (;;) {
    const s = await state(t.roomId);
    if (s.phase !== 'clues') return;
    const seat = (s.order as string[])[s.step as number] as string;
    expect(
      await sahtekar(tableOf(t, seat), { action: 'said', roomId: t.roomId, step: s.step }),
    ).toEqual(OK);
  }
}

describe('sahtekar rules in SQL (pure/sahtekar.ts)', () => {
  it('uses the same numbers', async () => {
    const [row] = await sql`select private.sahtekar_config() as c`;
    expect(row?.c).toEqual({ ...SAHTEKAR });
  });

  it('labels seats, orders the clues and counts the vote the same way', async () => {
    for (const [a, b] of [
      [1, 2],
      [3, 1],
      [4, 4],
      [2, 3],
    ] as const) {
      const [row] = await sql`
        select private.sahtekar_seats(${a}, ${b}) as seats,
               private.sahtekar_clue_order(private.sahtekar_seats(${a}, ${b})) as ord
      `;
      const seats = seatsOf({ owner: a, guest: b });
      expect(row?.seats).toEqual(seats);
      expect(row?.ord).toEqual(clueOrder(seats));
    }
    for (const votes of [
      { A1: 'B1', A2: 'B1', B1: 'A1' } as Record<string, string>,
      { A1: 'B1', B1: 'A1' },
      { A1: 'B2', A2: 'B2', B1: 'A1', B2: 'A1' },
      { A1: 'A2' },
      {},
    ]) {
      const [row] = await sql`select private.sahtekar_tally(${sql.json(votes)}) as accused`;
      expect(row?.accused ?? null, JSON.stringify(votes)).toBe(tally(votes));
    }
  });
});

describe('sahtekar, starting (docs/SPEC_V3.md §20.1)', () => {
  it('starts only from an accepted proposal, with the counts the tables gave', async () => {
    const r = await room(2, 3);
    expect((await sahtekar(r.owner, { action: 'view', roomId: r.roomId, seat: 'A1' })).status).toBe(
      409,
    );
    await rooms(r.guest, {
      action: 'propose-game',
      roomId: r.roomId,
      concept: 'sahtekar',
      players: 3,
    });
    const [proposal] =
      await sql`select proposer_players from public.game_proposals where room_id = ${r.roomId}`;
    expect(proposal?.proposer_players).toBe(3);
    expect(
      await rooms(r.owner, { action: 'answer-game', roomId: r.roomId, accept: true, players: 1 }),
    ).toEqual(OK);
    const s = await state(r.roomId);
    expect(s).toMatchObject({
      concept: 'sahtekar',
      phase: 'viewing',
      gameNo: 1,
      players: { owner: 1, guest: 3 },
      seats: ['A1', 'B1', 'B2', 'B3'],
      viewed: [],
      votesCast: 0,
    });
    const ends = Date.parse(String(s.endsAt));
    expect(ends - Date.now()).toBeGreaterThan((SAHTEKAR.viewSeconds - 5) * 1000);
    // The word is one of the deck's, in the category the room shows.
    const sec = await secret(r.roomId);
    const [card] = await sql`
      select prompt from public.cards where deck = 'sahtekar' and word = ${sec.word}
    `;
    expect(card?.prompt).toBe(s.category);
    expect((s.seats as string[]).includes(sec.imposter)).toBe(true);
    expect(sec.options).toHaveLength(SAHTEKAR.options);
    expect(sec.options).toContain(sec.word);
  });

  it('takes each table’s check-in headcount when no count is given', async () => {
    const { roomId, answered } = await started(3, 2);
    expect(answered).toEqual(OK);
    expect((await state(roomId)).players).toEqual({ owner: 3, guest: 2 });
  });

  it('refuses fewer than 3 players and drops the proposal', async () => {
    const { owner, roomId, answered } = await started(1, 1);
    expect(answered).toEqual({ status: 409, body: errorBody('not_enough_players') });
    expect(await state(roomId)).toMatchObject({ concept: null });
    expect(await sql`select 1 from public.game_proposals where room_id = ${roomId}`).toHaveLength(
      0,
    );
    expect(await sql`select 1 from public.game_secrets where room_id = ${roomId}`).toHaveLength(0);
    // Another count is a new proposal; 4 and 4 is the most.
    expect(
      (await rooms(owner, { action: 'propose-game', roomId, concept: 'sahtekar', players: 5 }))
        .status,
    ).toBe(400);
  });
});

describe('sahtekar, seeing the word', () => {
  it('shows the word to every seat but the impostor, who gets the category only', async () => {
    const t = await started(2, 2);
    const sec = await secret(t.roomId);
    const s = await state(t.roomId);
    for (const seat of ['A1', 'A2', 'B1', 'B2']) {
      const res = await sahtekar(tableOf(t, seat), { action: 'view', roomId: t.roomId, seat });
      expect(res).toEqual({
        status: 200,
        body:
          seat === sec.imposter
            ? { seat, category: s.category, word: null, imposter: true }
            : { seat, category: s.category, word: sec.word, imposter: false },
      });
      if ((await state(t.roomId)).phase !== 'viewing') break;
      // The same seat may look again before the clues start.
      const again = await sahtekar(tableOf(t, seat), { action: 'view', roomId: t.roomId, seat });
      expect(again).toEqual(res);
    }
  });

  it('lets a table ask only for its own seats', async () => {
    const t = await started(2, 2);
    for (const [client, seat] of [
      [t.owner, 'B1'],
      [t.guest, 'A2'],
      [t.owner, 'A3'],
    ] as const) {
      expect(await sahtekar(client, { action: 'view', roomId: t.roomId, seat })).toEqual({
        status: 403,
        body: errorBody('not_your_seat'),
      });
    }
    expect((await sahtekar(t.third, { action: 'view', roomId: t.roomId, seat: 'A1' })).status).toBe(
      403,
    );
    expect((await sahtekar(t.owner, { action: 'view', roomId: t.roomId, seat: 'C1' })).status).toBe(
      400,
    );
  });

  it('starts the clues when the last seat has looked, in alternating order', async () => {
    const t = await started(3, 1);
    await viewAll(t, ['A1', 'A2', 'A3']);
    expect(await state(t.roomId)).toMatchObject({ phase: 'viewing', viewed: ['A1', 'A2', 'A3'] });
    await viewAll(t, ['B1']);
    expect(await state(t.roomId)).toMatchObject({
      phase: 'clues',
      step: 0,
      order: clueOrder(['A1', 'A2', 'A3', 'B1']),
    });
    // Too late to look now.
    expect(await sahtekar(t.owner, { action: 'view', roomId: t.roomId, seat: 'A1' })).toEqual({
      status: 409,
      body: errorBody('turn_over'),
    });
  });

  it('drops a seat that did not look in 2 minutes, and its table counts one less', async () => {
    const t = await started(2, 2);
    await setImposter(t.roomId, 'B1');
    await viewAll(t, ['A1', 'B1', 'B2']);
    expect(await sahtekar(t.guest, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    expect((await state(t.roomId)).phase).toBe('viewing');
    await expire(t.roomId);
    expect(await sahtekar(t.guest, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    // Sent twice (the app retries after a 5xx): the clock has not run out again.
    expect(await sahtekar(t.owner, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    expect(await state(t.roomId)).toMatchObject({
      phase: 'clues',
      step: 0,
      dealNo: 1,
      seats: ['A1', 'B1', 'B2'],
      players: { owner: 1, guest: 2 },
      viewed: ['A1', 'B1', 'B2'],
      order: clueOrder(['A1', 'B1', 'B2']),
    });
    await throughClues(t);
    expect(await state(t.roomId)).toMatchObject({ phase: 'voting', voters: ['A1', 'B1', 'B2'] });
    // A2 is out of the game: no vote from it, none for it.
    expect(
      await sahtekar(t.owner, { action: 'vote', roomId: t.roomId, voter: 'A2', target: 'B1' }),
    ).toEqual({ status: 403, body: errorBody('not_your_seat') });
    expect(
      await sahtekar(t.guest, { action: 'vote', roomId: t.roomId, voter: 'B1', target: 'A2' }),
    ).toEqual({ status: 400, body: errorBody('bad_request') });
  });

  it('deals a new impostor and a new word to the seats left when the impostor did not look', async () => {
    const t = await started(2, 2);
    await setImposter(t.roomId, 'A2');
    const first = await secret(t.roomId);
    await viewAll(t, ['A1', 'B1', 'B2']);
    await expire(t.roomId);
    const before = Date.now();
    expect(await sahtekar(t.owner, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    const s = await state(t.roomId);
    expect(s).toMatchObject({
      phase: 'viewing',
      dealNo: 2,
      seats: ['A1', 'B1', 'B2'],
      players: { owner: 1, guest: 2 },
      viewed: [],
    });
    expect(Date.parse(String(s.endsAt)) - before).toBeGreaterThan(
      (SAHTEKAR.viewSeconds - 2) * 1000,
    );
    const second = await secret(t.roomId);
    expect(['A1', 'B1', 'B2']).toContain(second.imposter);
    expect(second.word).not.toBe(first.word);
    expect(second.options).toContain(second.word);
    expect(second.votes).toEqual({});
    // Both words count as shown.
    const used = await sql`
      select c.word from public.room_used_cards u join public.cards c on c.id = u.card_id
      where u.room_id = ${t.roomId}
    `;
    expect(used.map((r) => r.word).sort()).toEqual([first.word, second.word].sort());
    // Everyone looks again; the seat that left may not.
    expect(await sahtekar(t.owner, { action: 'view', roomId: t.roomId, seat: 'A2' })).toEqual({
      status: 403,
      body: errorBody('not_your_seat'),
    });
    const card = await sahtekar(tableOf(t, 'B1'), { action: 'view', roomId: t.roomId, seat: 'B1' });
    expect(card.body).toMatchObject({ category: s.category });
    await viewAll(t, ['A1', 'B2']);
    expect(await state(t.roomId)).toMatchObject({
      phase: 'clues',
      order: clueOrder(['A1', 'B1', 'B2']),
    });
  });

  it('ends the game without results when fewer than 3 seats looked', async () => {
    const t = await started(2, 1);
    await viewAll(t, ['A1', 'A2']);
    await expire(t.roomId);
    expect(await sahtekar(t.guest, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    expect(await state(t.roomId)).toEqual({
      concept: null,
      gameNo: 1,
      lastGame: {
        concept: 'sahtekar',
        players: { owner: 2, guest: 1 },
        endedBy: 'not_enough_players',
      },
    });
    expect(await sql`select 1 from public.game_results where room_id = ${t.roomId}`).toHaveLength(
      0,
    );
    // Nothing left to move on.
    expect(await sahtekar(t.owner, { action: 'advance', roomId: t.roomId })).toEqual(OK);
  });
});

describe('sahtekar, clues', () => {
  it('moves on with Söyledi from the speaking seat’s table or when 15 seconds are up', async () => {
    const t = await started(2, 2);
    await viewAll(t, ['A1', 'A2', 'B1', 'B2']);
    // Step 0 is A1: the guest's table may not say it, a stale step is ignored.
    expect(await sahtekar(t.guest, { action: 'said', roomId: t.roomId, step: 0 })).toEqual({
      status: 403,
      body: errorBody('not_your_seat'),
    });
    expect(await sahtekar(t.owner, { action: 'said', roomId: t.roomId, step: 0 })).toEqual(OK);
    expect(await sahtekar(t.owner, { action: 'said', roomId: t.roomId, step: 0 })).toEqual(OK);
    expect((await state(t.roomId)).step).toBe(1);
    // B1's time runs out.
    await expire(t.roomId);
    expect(await sahtekar(t.owner, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    expect((await state(t.roomId)).step).toBe(2);
    await throughClues(t);
    const s = await state(t.roomId);
    expect(s).toMatchObject({ phase: 'voting', votesCast: 0 });
    expect(Date.parse(String(s.endsAt)) - Date.now()).toBeGreaterThan(
      (SAHTEKAR.voteSeconds - 5) * 1000,
    );
  });
});

describe('sahtekar, the vote and the end', () => {
  async function voting(owner = 2, guest = 2) {
    const t = await started(owner, guest);
    await viewAll(t, (await state(t.roomId)).seats as string[]);
    await throughClues(t);
    return { ...t, sec: await secret(t.roomId) };
  }
  const vote = (
    t: { owner: Client; guest: Client; roomId: string },
    voter: string,
    target: string,
  ) => sahtekar(tableOf(t, voter), { action: 'vote', roomId: t.roomId, voter, target });

  it('takes one secret vote per seat, never for itself, and shows only how many voted', async () => {
    const t = await voting();
    expect(await vote(t, 'A1', 'A1')).toEqual({ status: 400, body: errorBody('bad_request') });
    expect(await vote(t, 'A1', 'B2')).toEqual(OK);
    // A second vote of the same seat is ignored.
    expect(await vote(t, 'A1', 'B1')).toEqual(OK);
    expect((await secret(t.roomId)).votes).toEqual({ A1: 'B2' });
    const s = await state(t.roomId);
    expect(s.votesCast).toBe(1);
    expect(JSON.stringify(s)).not.toContain('B2"}');
  });

  it('lets the impostor escape on a tie and opens everything at the end', async () => {
    const t = await voting(2, 2);
    // Two and two: a tie.
    const others = ['A1', 'A2', 'B1', 'B2'];
    await vote(t, 'A1', 'B1');
    await vote(t, 'B1', 'A1');
    await vote(t, 'A2', 'B2');
    expect(await vote(t, 'B2', 'A2')).toEqual(OK);
    const s = await state(t.roomId);
    expect(s.concept).toBeNull();
    expect(s.lastGame).toEqual({
      concept: 'sahtekar',
      players: { owner: 2, guest: 2 },
      reveal: {
        imposter: t.sec.imposter,
        word: t.sec.word,
        category: expect.any(String),
        votes: { A1: 'B1', B1: 'A1', A2: 'B2', B2: 'A2' },
        // Nobody named, no guess: lastGame leaves empty fields out (between_games).
        winner: 'imposter',
      },
    });
    expect(others).toContain(t.sec.imposter);
    const results = await sql`
      select concept, mode, score, won from public.game_results where room_id = ${t.roomId}
    `;
    expect(results).toEqual([
      { concept: 'sahtekar', mode: 'sahtekar', score: null, won: null },
      { concept: 'sahtekar', mode: 'sahtekar', score: null, won: null },
    ]);
    // The game counts for the game badges.
    const [stats] = await sql`select * from public.user_stats(${await userIdOf(t.owner)})`;
    expect(stats?.games).toBe(1);
  });

  it('gives the caught impostor’s table the 6 options; a wrong guess gives the game to the tables', async () => {
    const t = await voting(2, 2);
    const imp = t.sec.imposter;
    const voters = ['A1', 'A2', 'B1', 'B2'];
    for (const voter of voters) {
      const target = voter === imp ? voters.find((s) => s !== imp) : imp;
      await vote(t, voter, target as string);
    }
    expect(await state(t.roomId)).toMatchObject({ phase: 'guess', accused: imp });
    const theirs = tableOf(t, imp);
    const other = theirs === t.owner ? t.guest : t.owner;
    expect(await sahtekar(other, { action: 'options', roomId: t.roomId })).toEqual({
      status: 403,
      body: errorBody('not_your_seat'),
    });
    const options = await sahtekar(theirs, { action: 'options', roomId: t.roomId });
    expect(options).toEqual({ status: 200, body: { options: t.sec.options } });
    expect(await sahtekar(theirs, { action: 'guess', roomId: t.roomId, option: 'Yok' })).toEqual({
      status: 400,
      body: errorBody('bad_request'),
    });
    const wrong = t.sec.options.find((o) => o !== t.sec.word) as string;
    expect(await sahtekar(theirs, { action: 'guess', roomId: t.roomId, option: wrong })).toEqual(
      OK,
    );
    expect((await state(t.roomId)).lastGame).toMatchObject({
      reveal: { accused: imp, guess: wrong, winner: 'tables' },
    });
  });

  it('lets a right guess win for the impostor, and a guess that runs out count as wrong', async () => {
    let t = await voting(1, 2);
    const catchImpostor = async (x: typeof t) => {
      for (const voter of ['A1', 'B1', 'B2']) {
        const target =
          voter === x.sec.imposter ? ['A1', 'B1', 'B2'].find((s) => s !== voter) : x.sec.imposter;
        await vote(x, voter, target as string);
      }
    };
    await catchImpostor(t);
    await sahtekar(tableOf(t, t.sec.imposter), {
      action: 'guess',
      roomId: t.roomId,
      option: t.sec.word,
    });
    expect((await state(t.roomId)).lastGame).toMatchObject({ reveal: { winner: 'imposter' } });

    for (const phone of PHONES) await deleteUserByPhone(phone);
    t = await voting(1, 2);
    await catchImpostor(t);
    await expire(t.roomId);
    expect(await sahtekar(t.owner, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    const last = (await state(t.roomId)).lastGame as { reveal: Record<string, unknown> };
    expect(last.reveal).toMatchObject({ accused: t.sec.imposter, winner: 'tables' });
    expect(last.reveal).not.toHaveProperty('guess');
  });

  it('counts the votes in when the 90 seconds are up', async () => {
    const t = await voting(2, 1);
    const seats = ['A1', 'A2', 'B1'];
    // A vote for a seat that is not the impostor, from a seat other than that one.
    const target = seats.find((s) => s !== t.sec.imposter) as string;
    const voter = seats.find((s) => s !== target) as string;
    expect(await vote(t, voter, target)).toEqual(OK);
    await expire(t.roomId);
    expect(await sahtekar(t.guest, { action: 'advance', roomId: t.roomId })).toEqual(OK);
    // One vote for a seat that is not the impostor: the impostor escapes.
    expect((await state(t.roomId)).lastGame).toMatchObject({
      reveal: { accused: target, winner: 'imposter' },
    });
  });

  it('keeps the counts for the rematch when the game is ended early', async () => {
    const t = await started(3, 2);
    expect(await rooms(t.guest, { action: 'end-game', roomId: t.roomId })).toEqual(OK);
    expect(await state(t.roomId)).toMatchObject({
      concept: null,
      lastGame: { concept: 'sahtekar', abandoned: true, players: { owner: 3, guest: 2 } },
    });
    expect(await sql`select 1 from public.game_results`).toHaveLength(0);
  });
});

describe('sahtekar, secrets (rules 4 and 9)', () => {
  // Everything a table's client reads about the room outside its own answers, as one string.
  async function readable(client: Client, roomId: string) {
    const reads = await Promise.all([
      client.from('rooms').select('game_state, concept').eq('id', roomId),
      client.from('game_events').select('type, payload').eq('room_id', roomId),
      client.from('game_secrets').select('*'),
      client.from('cards').select('word').eq('deck', 'sahtekar'),
    ]);
    return normalize(JSON.stringify(reads.map((r) => r.data ?? [])));
  }

  it('keeps the impostor’s seat, the word and the options off the room, the events and the deck', async () => {
    const t = await started(2, 2);
    const sec = await secret(t.roomId);
    const check = async () => {
      for (const client of [t.owner, t.guest]) {
        const text = ` ${await readable(client, t.roomId)} `;
        for (const word of sec.options) {
          expect(text.includes(` ${normalize(word)} `), word).toBe(false);
        }
        expect(text).not.toContain('imposter');
      }
    };
    await check();
    await viewAll(t, ['A1', 'A2', 'B1', 'B2']);
    await check();
    await throughClues(t);
    await sahtekar(tableOf(t, 'A1'), {
      action: 'vote',
      roomId: t.roomId,
      voter: 'A1',
      target: 'B1',
    });
    await check();
    expect((await t.owner.from('game_secrets').select('*')).data ?? []).toEqual([]);
  });

  it('keeps every Sahtekar function server-side only', async () => {
    const t = await started(2, 2);
    const id = await userIdOf(t.owner);
    for (const fn of [
      'sahtekar_view',
      'sahtekar_said',
      'sahtekar_vote',
      'sahtekar_options',
      'sahtekar_guess',
      'sahtekar_advance',
      'sahtekar_local_deck',
    ]) {
      const { error } = await t.owner.rpc(
        fn as never,
        {
          target_user_id: id,
          target_room_id: t.roomId,
        } as never,
      );
      expect(error, fn).not.toBeNull();
    }
  });
});

describe('sahtekar, one table', () => {
  it('hands the deck to a one-table room: a word, its category and 6 options of it', async () => {
    const client = await onboarded(PHONES[0]);
    await checkInAt(client, venue, V, 3);
    const created = await rooms(client, { action: 'create-solo' });
    const roomId = (created.body as { roomId: string }).roomId;
    const res = await sahtekar(client, { action: 'start', roomId });
    expect(res.status).toBe(200);
    const deck = res.body as { category: string; word: string; options: string[] };
    expect(deck.options).toHaveLength(SAHTEKAR.options);
    expect(deck.options).toContain(deck.word);
    const rows = await sql`
      select distinct prompt from public.cards where deck = 'sahtekar' and word = any(${deck.options})
    `;
    expect(rows.map((r) => r.prompt)).toEqual([deck.category]);
    expect(await state(roomId)).toMatchObject({ concept: 'sahtekar' });
    // The word counts as used in the room.
    expect(
      await sql`
        select 1 from public.room_used_cards u join public.cards c on c.id = u.card_id
        where u.room_id = ${roomId} and c.deck = 'sahtekar' and c.word = ${deck.word}
      `,
    ).toHaveLength(1);
  });

  it('starts a two-table game only from a proposal', async () => {
    const t = await room(2, 2);
    expect(await sahtekar(t.owner, { action: 'start', roomId: t.roomId })).toEqual({
      status: 409,
      body: errorBody('no_proposal'),
    });
  });
});
