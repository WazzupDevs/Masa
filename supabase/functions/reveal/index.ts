// "Tanışalım mı?" (MVP_SPEC §4.6). Answers are private; both tables see only the shared result in
// rooms.reveal_result / reveal_token, the same for both, and never who said no.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type { RevealRequest, RevealResponse } from '../_shared/pure/api/reveal.ts';
import { pickRevealToken } from '../_shared/pure/reveal.ts';

const Body: z.ZodType<RevealRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('decide'), roomId: z.uuid(), wantsMeet: z.boolean() }),
  z.object({ action: z.literal('finalize'), roomId: z.uuid() }),
]);

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<RevealResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'decide': {
        // The token is used only if this answer completes a mutual yes.
        const { error } = await db.rpc('reveal_decide', {
          target_user_id: user.id,
          target_room_id: body.roomId,
          wants: body.wantsMeet,
          token: pickRevealToken(Math.random),
        });
        if (error) throw dbError('reveal_decide', error);
        return { ok: true };
      }

      case 'finalize': {
        const { error } = await db.rpc('reveal_finalize', {
          target_user_id: user.id,
          target_room_id: body.roomId,
        });
        if (error) throw dbError('reveal_finalize', error);
        return { ok: true };
      }
    }
  }),
);
