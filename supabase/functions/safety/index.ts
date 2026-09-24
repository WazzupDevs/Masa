// Report, block and unblock (MVP_SPEC §8).
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type { SafetyRequest, SafetyResponse } from '../_shared/pure/api/chat.ts';
import { REPORT_REASONS } from '../_shared/pure/chat.ts';
import { BROADCAST, venueChannel } from '../_shared/pure/rooms.ts';

const Body: z.ZodType<SafetyRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('report'), roomId: z.uuid(), reason: z.enum(REPORT_REASONS) }),
  z.object({ action: z.literal('block'), roomId: z.uuid() }),
  z.object({ action: z.literal('unblock'), blockId: z.uuid() }),
]);

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<SafetyResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'report': {
        const { error } = await db.rpc('safety_report', {
          target_user_id: user.id,
          target_room_id: body.roomId,
          new_reason: body.reason,
        });
        if (error) throw dbError('safety_report', error);
        return { ok: true };
      }

      case 'block': {
        const { data, error } = await db.rpc('safety_block', {
          target_user_id: user.id,
          target_room_id: body.roomId,
        });
        if (error) throw dbError('safety_block', error);
        if (data.visibility === 'open') {
          inBackground(broadcast(venueChannel(data.venue_id), BROADCAST.lobbyChanged));
        }
        return { ok: true };
      }

      case 'unblock': {
        const { error } = await db.rpc('safety_unblock', {
          target_user_id: user.id,
          target_block_id: body.blockId,
        });
        if (error) throw dbError('safety_unblock', error);
        return { ok: true };
      }
    }
  }),
);
