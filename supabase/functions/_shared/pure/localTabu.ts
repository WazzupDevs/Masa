// One-table Tabu (MVP_SPEC §5.1), played entirely on the phone: teams A and B take turns,
// 60 second turns, 3 rounds per team. Correct +1, Tabu −1, Pass 0.
import { TABU, type TabuCard } from './tabu.ts';

export type Team = 'A' | 'B';

export type LocalTabuState = {
  phase: 'ready' | 'playing' | 'between' | 'finished';
  deck: readonly TabuCard[];
  cardIndex: number;
  team: Team;
  round: number;
  scores: Record<Team, number>;
  turnEndsAt: number | null;
};

export type LocalTabuAction =
  | { type: 'reset'; deck: readonly TabuCard[] }
  | { type: 'start'; now: number }
  | { type: 'correct' }
  | { type: 'taboo' }
  | { type: 'pass' }
  | { type: 'timeUp' };

export function initialLocalTabu(deck: readonly TabuCard[]): LocalTabuState {
  return {
    phase: 'ready',
    deck,
    cardIndex: 0,
    team: 'A',
    round: 1,
    scores: { A: 0, B: 0 },
    turnEndsAt: null,
  };
}

function nextCard(state: LocalTabuState): number {
  return state.deck.length === 0 ? 0 : (state.cardIndex + 1) % state.deck.length;
}

export function localTabuReducer(state: LocalTabuState, action: LocalTabuAction): LocalTabuState {
  switch (action.type) {
    case 'reset':
      return initialLocalTabu(action.deck);

    case 'start':
      if (state.phase !== 'ready' && state.phase !== 'between') return state;
      return { ...state, phase: 'playing', turnEndsAt: action.now + TABU.turnSeconds * 1000 };

    case 'correct':
    case 'taboo':
    case 'pass': {
      if (state.phase !== 'playing') return state;
      const delta = action.type === 'correct' ? 1 : action.type === 'taboo' ? -1 : 0;
      return {
        ...state,
        cardIndex: nextCard(state),
        scores: { ...state.scores, [state.team]: state.scores[state.team] + delta },
      };
    }

    case 'timeUp': {
      if (state.phase !== 'playing') return state;
      const lastTurn = state.team === 'B' && state.round >= TABU.localRoundsPerTeam;
      if (lastTurn) return { ...state, phase: 'finished', turnEndsAt: null };
      return {
        ...state,
        phase: 'between',
        cardIndex: nextCard(state),
        team: state.team === 'A' ? 'B' : 'A',
        round: state.team === 'B' ? state.round + 1 : state.round,
        turnEndsAt: null,
      };
    }
  }
}
