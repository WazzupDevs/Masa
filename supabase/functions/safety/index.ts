// Report (a room, or a profile: docs/SPEC_V2.md §5.3), block and unblock (MVP_SPEC §8).
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type { SafetyRequest, SafetyResponse } from '../_shared/pure/api/chat.ts';
import { REPORT_REASONS, type ReportReason } from '../_shared/pure/chat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { PHOTO_BUCKET } from '../_shared/pure/profile.ts';
import { BROADCAST, venueChannel } from '../_shared/pure/rooms.ts';

const Body: z.ZodType<SafetyRequest> = z.discriminatedUnion('action', [
  z.discriminatedUnion('target', [
    z.object({
      action: z.literal('report'),
      target: z.literal('room').optional(),
      roomId: z.uuid(),
      reason: z.enum(REPORT_REASONS),
    }),
    z.object({
      action: z.literal('report'),
      target: z.literal('profile'),
      publicId: z.uuid(),
      reason: z.enum(REPORT_REASONS),
    }),
  ]),
  z.object({ action: z.literal('block'), roomId: z.uuid() }),
  z.object({ action: z.literal('unblock'), blockId: z.uuid() }),
]);

const db = serviceClient();

// A copy of the reported photo goes into the report row (hex bytea), so the 30-day report cleanup
// removes it with the report (docs/SPEC_V2.md §5.3).
async function reportProfile(userId: string, publicId: string, reason: ReportReason) {
  const view = await db.rpc('profile_view', { viewer: userId, target_public_id: publicId });
  if (view.error) throw dbError('profile_view', view.error);
  const row = view.data[0];
  if (!row || row.is_self) throw new AppError('not_found', 'Profile not found.');

  let photo: string | undefined;
  if (row.photo_path) {
    const file = await db.storage.from(PHOTO_BUCKET).download(row.photo_path);
    if (!file.error) photo = toHexBytea(new Uint8Array(await file.data.arrayBuffer()));
  }
  const { data, error } = await db.rpc('safety_report_profile', {
    target_user_id: userId,
    target_public_id: publicId,
    new_reason: reason,
    reported_photo_path: row.photo_path ?? undefined,
    photo,
  });
  if (error) throw dbError('safety_report_profile', error);
  if (!data) throw new AppError('not_found', 'Profile not found.');
}

function toHexBytea(bytes: Uint8Array): string {
  let hex = '\\x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

Deno.serve(
  handle(async (req, raw): Promise<SafetyResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'report': {
        if (body.target === 'profile') {
          await reportProfile(user.id, body.publicId, body.reason);
          return { ok: true };
        }
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
