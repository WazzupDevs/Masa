// Sahtekar (docs/SPEC_V3.md §20.2). Every player sees the same secret word except one: the
// impostor sees only the category. Two rounds of one spoken word each, a secret vote, and when the
// impostor is caught, a guess among 6 words of the category. No score: the impostor or the tables
// win. The SQL functions take the numbers from private.sahtekar_config() and apply the same rules
// (clue order, tally, outcome); integration tests check that they agree with this file.

export const SAHTEKAR = {
  viewSeconds: 120,
  clueSeconds: 15,
  clueRounds: 2,
  voteSeconds: 90,
  guessSeconds: 30,
  // The word and 5 others of its category.
  options: 6,
  minPlayers: 3,
  maxPerTable: 4,
} as const;

export type TableSide = 'owner' | 'guest';
// A seat is a label inside one game ("A1", "B2"); it is never tied to an account (rule 4).
export type Seat = string;
export type Players = Record<TableSide, number>;

const PREFIX: Record<TableSide, string> = { owner: 'A', guest: 'B' };

export function isPlayerCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= SAHTEKAR.maxPerTable
  );
}

// A1…An for the owner's table, B1…Bm for the guest's; a one-table game has only A.
export function seatsOf(players: Players): Seat[] {
  return (['owner', 'guest'] as const).flatMap((side) =>
    Array.from({ length: players[side] }, (_, i) => `${PREFIX[side]}${i + 1}`),
  );
}

export function tableOfSeat(seat: Seat): TableSide {
  return seat.startsWith('B') ? 'guest' : 'owner';
}

// Clue order: the tables take turns (A1, B1, A2, B2…); the longer table's extra seats follow in
// order. The round is repeated `clueRounds` times. Only seats that saw their card are in it.
export function clueOrder(seats: readonly Seat[]): Seat[] {
  const a = seats.filter((s) => tableOfSeat(s) === 'owner');
  const b = seats.filter((s) => tableOfSeat(s) === 'guest');
  const round: Seat[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) round.push(a[i] as Seat);
    if (b[i]) round.push(b[i] as Seat);
  }
  return Array.from({ length: SAHTEKAR.clueRounds }, () => round).flat();
}

// The seat with the most votes, or null on a tie (or no vote): then the impostor escapes.
export function tally(votes: Readonly<Record<Seat, Seat>>): Seat | null {
  const counts = new Map<Seat, number>();
  for (const target of Object.values(votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  let best: Seat | null = null;
  let bestCount = 0;
  let tied = false;
  for (const [seat, n] of counts) {
    if (n > bestCount) {
      best = seat;
      bestCount = n;
      tied = false;
    } else if (n === bestCount) {
      tied = true;
    }
  }
  return tied ? null : best;
}

export type Winner = 'imposter' | 'tables';

// Caught and wrong (or no) guess: the tables win. Not caught, or caught and right: the impostor.
export function winnerOf(imposter: Seat, accused: Seat | null, guessedRight: boolean): Winner {
  return accused === imposter && !guessedRight ? 'tables' : 'imposter';
}

// May `voter` vote for `target`? Only a seat that saw its card votes, once, and never for itself.
export function mayVote(
  voters: readonly Seat[],
  seats: readonly Seat[],
  votes: Readonly<Record<Seat, Seat>>,
  voter: Seat,
  target: Seat,
): boolean {
  return voters.includes(voter) && seats.includes(target) && voter !== target && !(voter in votes);
}

// When the viewing ends (every seat looked, or the 2 minutes are up). A seat that did not look
// leaves the game and its table's count drops. If the impostor left, the remaining seats get a new
// impostor and a new word and look again; fewer than 3 left ends the game (not_enough_players).
export type AfterViewing =
  | { next: 'clues'; seats: Seat[] }
  | { next: 'redeal'; seats: Seat[] }
  | { next: 'not_enough_players'; seats: Seat[] };

export function afterViewing(
  seats: readonly Seat[],
  viewed: readonly Seat[],
  imposter: Seat,
): AfterViewing {
  const kept = seats.filter((s) => viewed.includes(s));
  if (kept.length < SAHTEKAR.minPlayers) return { next: 'not_enough_players', seats: kept };
  return { next: kept.includes(imposter) ? 'clues' : 'redeal', seats: kept };
}

// The tables' counts for a list of seats.
export function playersOf(seats: readonly Seat[]): Players {
  return {
    owner: seats.filter((s) => tableOfSeat(s) === 'owner').length,
    guest: seats.filter((s) => tableOfSeat(s) === 'guest').length,
  };
}

// ---------------------------------------------------------------------------------------------
// One-table game (§20.2): the phone runs the same rules for the seats of one table (A1…An, at
// least 3). The deck comes from sahtekar/start.

export type SahtekarDeck = { category: string; word: string; options: string[] };

// 'redeal': the impostor did not look in time; the screen asks sahtekar/start for a new deck and
// calls redealLocal.
export type LocalPhase = 'viewing' | 'redeal' | 'clues' | 'voting' | 'guess' | 'done';

export type LocalSahtekar = {
  phase: LocalPhase;
  seats: Seat[];
  imposter: Seat;
  category: string;
  word: string;
  options: string[];
  viewed: Seat[];
  order: Seat[];
  step: number;
  endsAt: number;
  votes: Record<Seat, Seat>;
  accused: Seat | null;
  guess: string | null;
  winner: Winner | null;
  // Set when fewer than 3 seats looked: the game ended without a winner.
  endedBy: 'not_enough_players' | null;
};

export type LocalAction =
  | { type: 'view'; seat: Seat }
  | { type: 'said'; step: number }
  | { type: 'vote'; voter: Seat; target: Seat }
  | { type: 'guess'; option: string }
  // The clock: moves the game on when the phase's time is up.
  | { type: 'tick' };

export function newLocalGame(
  deck: SahtekarDeck,
  players: number,
  now: number,
  random: () => number = Math.random,
): LocalSahtekar {
  if (players < SAHTEKAR.minPlayers || !Number.isInteger(players)) {
    throw new Error('not_enough_players');
  }
  const seats = seatsOf({ owner: players, guest: 0 });
  return {
    phase: 'viewing',
    seats,
    imposter: seats[Math.floor(random() * seats.length)] as Seat,
    category: deck.category,
    word: deck.word,
    options: deck.options,
    viewed: [],
    order: [],
    step: 0,
    endsAt: now + SAHTEKAR.viewSeconds * 1000,
    votes: {},
    accused: null,
    guess: null,
    winner: null,
    endedBy: null,
  };
}

// A new deck for the seats that are left (phase 'redeal'): a new impostor among them, and every
// seat looks again.
export function redealLocal(
  game: LocalSahtekar,
  deck: SahtekarDeck,
  now: number,
  random: () => number = Math.random,
): LocalSahtekar {
  if (game.phase !== 'redeal') return game;
  return {
    ...game,
    phase: 'viewing',
    imposter: game.seats[Math.floor(random() * game.seats.length)] as Seat,
    category: deck.category,
    word: deck.word,
    options: deck.options,
    viewed: [],
    endsAt: now + SAHTEKAR.viewSeconds * 1000,
  };
}

// What a seat sees when it holds its card.
export function cardOf(
  game: Pick<LocalSahtekar, 'imposter' | 'category' | 'word'>,
  seat: Seat,
): { category: string; word: string | null; imposter: boolean } {
  return seat === game.imposter
    ? { category: game.category, word: null, imposter: true }
    : { category: game.category, word: game.word, imposter: false };
}

function endViewing(game: LocalSahtekar, now: number): LocalSahtekar {
  const after = afterViewing(game.seats, game.viewed, game.imposter);
  if (after.next === 'not_enough_players') {
    return { ...game, phase: 'done', seats: after.seats, endedBy: 'not_enough_players' };
  }
  if (after.next === 'redeal') return { ...game, phase: 'redeal', seats: after.seats, viewed: [] };
  const order = clueOrder(after.seats);
  return {
    ...game,
    phase: 'clues',
    seats: after.seats,
    order,
    step: 0,
    endsAt: now + SAHTEKAR.clueSeconds * 1000,
  };
}

function toVoting(game: LocalSahtekar, now: number): LocalSahtekar {
  return { ...game, phase: 'voting', endsAt: now + SAHTEKAR.voteSeconds * 1000 };
}

function count(game: LocalSahtekar, now: number): LocalSahtekar {
  const accused = tally(game.votes);
  if (accused === game.imposter) {
    return { ...game, phase: 'guess', accused, endsAt: now + SAHTEKAR.guessSeconds * 1000 };
  }
  return { ...game, phase: 'done', accused, winner: winnerOf(game.imposter, accused, false) };
}

function voters(game: LocalSahtekar): Seat[] {
  return game.seats.filter((s) => game.viewed.includes(s));
}

export function reduceLocal(game: LocalSahtekar, action: LocalAction, now: number): LocalSahtekar {
  switch (action.type) {
    case 'view': {
      // A seat may look again until the clues start.
      if (game.phase !== 'viewing' || !game.seats.includes(action.seat)) return game;
      const viewed = game.viewed.includes(action.seat)
        ? game.viewed
        : [...game.viewed, action.seat];
      // The last seat to see its card starts the clues, as on the server.
      const next = { ...game, viewed };
      return allViewed(next) ? endViewing(next, now) : next;
    }
    case 'said': {
      if (game.phase !== 'clues' || action.step !== game.step) return game;
      const step = game.step + 1;
      if (step >= game.order.length) return toVoting({ ...game, step }, now);
      return { ...game, step, endsAt: now + SAHTEKAR.clueSeconds * 1000 };
    }
    case 'vote': {
      if (game.phase !== 'voting') return game;
      if (!mayVote(voters(game), game.seats, game.votes, action.voter, action.target)) return game;
      const next = { ...game, votes: { ...game.votes, [action.voter]: action.target } };
      return Object.keys(next.votes).length >= voters(next).length ? count(next, now) : next;
    }
    case 'guess': {
      if (game.phase !== 'guess' || !game.options.includes(action.option)) return game;
      const right = action.option === game.word;
      return {
        ...game,
        phase: 'done',
        guess: action.option,
        winner: winnerOf(game.imposter, game.accused, right),
      };
    }
    case 'tick': {
      if (game.phase === 'done' || game.phase === 'redeal' || now < game.endsAt) return game;
      if (game.phase === 'viewing') return endViewing(game, now);
      if (game.phase === 'clues') return reduceLocal(game, { type: 'said', step: game.step }, now);
      if (game.phase === 'voting') return count(game, now);
      return { ...game, phase: 'done', winner: winnerOf(game.imposter, game.accused, false) };
    }
  }
}

// Every seat has seen its card: the clues may start without waiting for the clock.
export function allViewed(game: Pick<LocalSahtekar, 'seats' | 'viewed'>): boolean {
  return game.seats.every((s) => game.viewed.includes(s));
}

// ---------------------------------------------------------------------------------------------
// The two-table game as the app reads it from rooms.game_state (§20.2). The impostor's seat and
// the word are never in it before the reveal (rule 4).

export type SahtekarPhase = 'viewing' | 'clues' | 'voting' | 'guess';

export type SahtekarState = {
  concept: 'sahtekar';
  phase: SahtekarPhase;
  gameNo: number;
  // Goes up when the seats left get a new impostor and word (a seat that did not look left).
  dealNo: number;
  players: Players;
  seats: Seat[];
  category: string;
  viewed: Seat[];
  order: Seat[];
  step: number;
  voters: Seat[];
  votesCast: number;
  endsAt: string;
  accused: Seat | null;
};

export type SahtekarReveal = {
  imposter: Seat;
  word: string;
  category: string;
  votes: Record<Seat, Seat>;
  accused: Seat | null;
  guess: string | null;
  winner: Winner;
};

// lastGame of a Sahtekar game: the counts for the rematch, and the reveal; or, when fewer than 3
// seats looked, endedBy and no reveal.
export type SahtekarLastGame = {
  players: Players | null;
  reveal: SahtekarReveal | null;
  endedBy: 'not_enough_players' | null;
};

const PHASES: readonly SahtekarPhase[] = ['viewing', 'clues', 'voting', 'guess'];

function isObj(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function parsePlayers(v: unknown): Players | null {
  return isObj(v) && isInt(v.owner) && isInt(v.guest) ? { owner: v.owner, guest: v.guest } : null;
}

export function parseSahtekarState(value: unknown): SahtekarState | null {
  if (!isObj(value) || value.concept !== 'sahtekar') return null;
  const v = value;
  const players = parsePlayers(v.players);
  if (
    !(PHASES as readonly unknown[]).includes(v.phase) ||
    !isInt(v.gameNo) ||
    !players ||
    !strs(v.seats) ||
    !isStr(v.category) ||
    !strs(v.viewed) ||
    !strs(v.order) ||
    !isInt(v.step) ||
    !strs(v.voters) ||
    !isInt(v.votesCast) ||
    !isStr(v.endsAt)
  ) {
    return null;
  }
  return {
    concept: 'sahtekar',
    phase: v.phase as SahtekarPhase,
    gameNo: v.gameNo,
    dealNo: isInt(v.dealNo) ? v.dealNo : 1,
    players,
    seats: v.seats,
    category: v.category,
    viewed: v.viewed,
    order: v.order,
    step: v.step,
    voters: v.voters,
    votesCast: v.votesCast,
    endsAt: v.endsAt,
    accused: isStr(v.accused) ? v.accused : null,
  };
}

export function parseSahtekarLastGame(last: unknown): SahtekarLastGame | null {
  if (!isObj(last) || last.concept !== 'sahtekar') return null;
  const r = last.reveal;
  const reveal: SahtekarReveal | null =
    isObj(r) &&
    isStr(r.imposter) &&
    isStr(r.word) &&
    isStr(r.category) &&
    (r.winner === 'imposter' || r.winner === 'tables')
      ? {
          imposter: r.imposter,
          word: r.word,
          category: r.category,
          votes: isObj(r.votes)
            ? (Object.fromEntries(Object.entries(r.votes).filter(([, t]) => isStr(t))) as Record<
                Seat,
                Seat
              >)
            : {},
          accused: isStr(r.accused) ? r.accused : null,
          guess: isStr(r.guess) ? r.guess : null,
          winner: r.winner as Winner,
        }
      : null;
  return {
    players: parsePlayers(last.players),
    reveal,
    endedBy: last.endedBy === 'not_enough_players' ? 'not_enough_players' : null,
  };
}

// Which seats belong to this phone's table.
export function ownSeats(seats: readonly Seat[], side: TableSide): Seat[] {
  return seats.filter((s) => tableOfSeat(s) === side);
}

// The clue round (1-based) of a step: the order is the same round repeated clueRounds times.
export function clueRoundOf(step: number, orderLength: number): number {
  const perRound = Math.max(1, orderLength / SAHTEKAR.clueRounds);
  return Math.min(SAHTEKAR.clueRounds, Math.floor(step / perRound) + 1);
}
