// Tabu (MVP_SPEC §5.1, docs/SPEC_V2.md §8.2, docs/SPEC_V3.md §6). One table: the deck, then the
// phone runs the game. Two tables: face to face, server-authoritative, started by
// rooms/answer-game, in the mode the server sets from the headcounts. Refereed: both tables get the
// turn's card list. Cooperative: only the describing table does (`not_describer` for the other).
// Every press names its card index, the server checks it and publishes the room row, and a second
// press on the same card is ignored. Each turn opens ready; begin-turn starts its clock.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type {
  GameOkResponse,
  TabuRequest,
  TabuStartResponse,
  TabuTurnCardsResponse,
} from '../_shared/pure/api/games.ts';
import { MARK_RESULTS, TABU } from '../_shared/pure/tabu.ts';

const Body: z.ZodType<TabuRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), roomId: z.uuid() }),
  z.object({ action: z.literal('turn-cards'), roomId: z.uuid() }),
  z.object({
    action: z.literal('mark'),
    roomId: z.uuid(),
    turnNo: z.number().int().min(1).max(100),
    cardIndex: z.number().int().min(0).max(1000),
    result: z.enum(MARK_RESULTS),
  }),
  z.object({ action: z.literal('end-turn'), roomId: z.uuid() }),
  z.object({ action: z.literal('begin-turn'), roomId: z.uuid() }),
]);

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<TabuStartResponse | TabuTurnCardsResponse | GameOkResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);
    const target = { target_user_id: user.id, target_room_id: body.roomId };

    switch (body.action) {
      // One table only: the deck, and the room's activity becomes Tabu (docs/SPEC_V3.md §5.3). A
      // two-table game starts from an accepted proposal (rooms/answer-game); here it is
      // no_proposal.
      case 'start': {
        const deck = await db.rpc('tabu_local_deck', { ...target, deck_size: TABU.localDeckSize });
        if (deck.error) throw dbError('tabu_local_deck', deck.error);
        return { mode: 'local', deck: deck.data };
      }

      case 'turn-cards': {
        const { data, error } = await db.rpc('tabu_turn_cards', target);
        if (error) throw dbError('tabu_turn_cards', error);
        return {
          turnNo: data[0]?.turn_no ?? 0,
          cards: data.map((c) => ({ word: c.word, forbidden: c.forbidden })),
        };
      }

      case 'mark': {
        const { error } = await db.rpc('tabu_mark', {
          ...target,
          turn_number: body.turnNo,
          index: body.cardIndex,
          result: body.result,
        });
        if (error) throw dbError('tabu_mark', error);
        return { ok: true };
      }

      // After the last turn the game is finished; the room stays open (MVP_SPEC §4.6). Otherwise
      // the next turn opens ready (docs/SPEC_V3.md §19.1).
      case 'end-turn': {
        const { error } = await db.rpc('tabu_end_turn', target);
        if (error) throw dbError('tabu_end_turn', error);
        return { ok: true };
      }

      // The ready turn's clock starts: the describing table at any time, either table after
      // readyEndsAt. Anything else leaves the room as it is.
      case 'begin-turn': {
        const { error } = await db.rpc('tabu_begin_turn', target);
        if (error) throw dbError('tabu_begin_turn', error);
        return { ok: true };
      }
    }
  }),
);
