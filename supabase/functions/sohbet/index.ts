// Sohbet cards (MVP_SPEC §5.3): either table deals the next card, 5 seconds apart per room. The
// card lands in rooms.game_state, which both tables receive through Postgres Changes.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type { GameOkResponse, SohbetRequest } from '../_shared/pure/api/games.ts';
import { SOHBET_NEXT_COOLDOWN_MS } from '../_shared/pure/sohbet.ts';

const Body: z.ZodType<SohbetRequest> = z.object({
  action: z.literal('next-card'),
  roomId: z.uuid(),
});

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<GameOkResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);
    const { error } = await db.rpc('sohbet_next', {
      target_user_id: user.id,
      target_room_id: body.roomId,
      cooldown_ms: SOHBET_NEXT_COOLDOWN_MS,
    });
    if (error) throw dbError('sohbet_next', error);
    return { ok: true };
  }),
);
