// Tabu (MVP_SPEC §5.1, §5.2). One table: the deck, then the phone runs the game. Two tables:
// server-authoritative. The card goes only to the describer, in the current-card response; the
// word becomes public only in the card_closed event.
import type { Db } from '../_shared/auth.ts';
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import type {
  GameOkResponse,
  TabuCardResponse,
  TabuGuessResponse,
  TabuRequest,
  TabuStartResponse,
} from '../_shared/pure/api/games.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { containsProfanity } from '../_shared/pure/profanity.ts';
import { REVEAL } from '../_shared/pure/reveal.ts';
import { checkClue, MAX_CLUE_LENGTH, TABU } from '../_shared/pure/tabu.ts';
import { isCorrectGuess } from '../_shared/pure/trText.ts';

const Body: z.ZodType<TabuRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), roomId: z.uuid() }),
  z.object({ action: z.literal('current-card'), roomId: z.uuid() }),
  z.object({ action: z.literal('clue'), roomId: z.uuid(), text: z.string().max(1000) }),
  z.object({ action: z.literal('guess'), roomId: z.uuid(), text: z.string().max(1000) }),
  z.object({ action: z.literal('pass'), roomId: z.uuid() }),
  z.object({ action: z.literal('end-turn'), roomId: z.uuid() }),
]);

const db = serviceClient();

// The current card of a room's turn, read with the service role. Only used server-side.
async function turnCard(db: Db, roomId: string): Promise<{ id: string; word: string }> {
  const room = await db.from('rooms').select('game_state').eq('id', roomId).single();
  if (room.error) throw dbError('rooms', room.error);
  const state = room.data.game_state as { gameNo?: number; turnNo?: number; phase?: string };
  if (state.phase !== 'playing' || !state.gameNo || !state.turnNo) {
    throw new AppError('no_game', 'No game in play.');
  }
  const turn = await db
    .from('tabu_turns')
    .select('card_id, cards(word)')
    .eq('room_id', roomId)
    .eq('game_no', state.gameNo)
    .eq('turn_no', state.turnNo)
    .single();
  if (turn.error) throw dbError('tabu_turns', turn.error);
  const word = turn.data.cards?.word;
  if (!word) throw new Error('turn card missing');
  return { id: turn.data.card_id, word };
}

Deno.serve(
  handle(
    async (
      req,
      raw,
    ): Promise<TabuStartResponse | TabuCardResponse | TabuGuessResponse | GameOkResponse> => {
      const body = Body.parse(raw);
      const user = await requireUser(req, db);
      const target = { target_user_id: user.id, target_room_id: body.roomId };

      switch (body.action) {
        case 'start': {
          const room = await db
            .from('rooms')
            .select('guest_session_id')
            .eq('id', body.roomId)
            .maybeSingle();
          if (room.error) throw dbError('rooms', room.error);
          if (!room.data?.guest_session_id) {
            const deck = await db.rpc('tabu_local_deck', {
              ...target,
              deck_size: TABU.localDeckSize,
            });
            if (deck.error) throw dbError('tabu_local_deck', deck.error);
            return { mode: 'local', deck: deck.data };
          }
          const started = await db.rpc('tabu_start', {
            ...target,
            turn_seconds: TABU.turnSeconds,
            total_turns: TABU.totalTurns,
            max_passes: TABU.maxPasses,
          });
          if (started.error) throw dbError('tabu_start', started.error);
          return { mode: 'server' };
        }

        case 'current-card': {
          const { data, error } = await db.rpc('tabu_current_card', target).single();
          if (error) throw dbError('tabu_current_card', error);
          return { word: data.word, forbidden: data.forbidden };
        }

        case 'clue': {
          // Validates against the card this describer sees; the SQL function rejects the clue if
          // the card changed meanwhile.
          const { data: card, error } = await db.rpc('tabu_current_card', target).single();
          if (error) throw dbError('tabu_current_card', error);
          const check = checkClue(body.text, card, await loadProfanity(db));
          if (!check.ok) throw new AppError(check.reason, 'Clue rejected.');
          const added = await db.rpc('tabu_add_clue', {
            ...target,
            checked_card_id: card.card_id,
            clue: check.clue,
          });
          if (added.error) throw dbError('tabu_add_clue', added.error);
          return { ok: true };
        }

        case 'guess': {
          const guess = body.text.trim();
          if (!guess || [...guess].length > MAX_CLUE_LENGTH) {
            throw new AppError('clue_invalid', 'Guess must be 1 to 100 characters.');
          }
          if (containsProfanity(guess, await loadProfanity(db))) {
            throw new AppError('profanity_rejected', 'Guess contains inappropriate language.');
          }
          const card = await turnCard(db, body.roomId);
          const correct = isCorrectGuess(guess, card.word);
          const { error } = await db.rpc('tabu_guess', {
            ...target,
            checked_card_id: card.id,
            guess,
            correct,
          });
          if (error) throw dbError('tabu_guess', error);
          return { correct };
        }

        case 'pass': {
          const { error } = await db.rpc('tabu_pass', target);
          if (error) throw dbError('tabu_pass', error);
          return { ok: true };
        }

        // The last turn ends the room into the reveal window (M6).
        case 'end-turn': {
          const { error } = await db.rpc('tabu_end_turn', {
            ...target,
            decision_seconds: REVEAL.decisionSeconds,
          });
          if (error) throw dbError('tabu_end_turn', error);
          return { ok: true };
        }
      }
    },
  ),
);
