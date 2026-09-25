// Report and block (MVP_SPEC §8, docs/SPEC_V2.md §5.3, §6.2, §6.4). Reports: a room, a profile
// visible now, a DM thread, or an encounter of the caller's own history (also after the room has
// ended). Blocks: the other table of a room, a friend, or the account behind a history row.
// History actions answer { ok: true } whatever they find, so they reveal nothing.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { photoCopyHex } from '../_shared/photos.ts';
import type { SafetyRequest, SafetyResponse } from '../_shared/pure/api/chat.ts';
import { REPORT_REASONS, type ReportReason } from '../_shared/pure/chat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { BROADCAST, venueChannel } from '../_shared/pure/rooms.ts';

const reason = z.enum(REPORT_REASONS);

const Report = z.discriminatedUnion('target', [
  z.object({
    action: z.literal('report'),
    target: z.literal('room').optional(),
    roomId: z.uuid(),
    reason,
  }),
  z.object({
    action: z.literal('report'),
    target: z.literal('profile'),
    publicId: z.uuid(),
    reason,
  }),
  z.object({ action: z.literal('report'), target: z.literal('dm'), threadId: z.uuid(), reason }),
  z.object({
    action: z.literal('report'),
    target: z.literal('history'),
    historyId: z.uuid(),
    reason,
  }),
]);

const Body: z.ZodType<SafetyRequest> = z.union([
  Report,
  z.strictObject({ action: z.literal('block'), roomId: z.uuid() }),
  z.strictObject({ action: z.literal('block'), publicId: z.uuid(), report: reason.optional() }),
  z.strictObject({ action: z.literal('block'), historyId: z.uuid(), report: reason.optional() }),
  z.strictObject({ action: z.literal('unblock'), blockId: z.uuid() }),
]);

const db = serviceClient();

async function reportProfile(userId: string, publicId: string, why: ReportReason) {
  const view = await db.rpc('profile_view', { viewer: userId, target_public_id: publicId });
  if (view.error) throw dbError('profile_view', view.error);
  const row = view.data[0];
  if (!row || row.is_self) throw new AppError('not_found', 'Profile not found.');

  const { data, error } = await db.rpc('safety_report_profile', {
    target_user_id: userId,
    target_public_id: publicId,
    new_reason: why,
    reported_photo_path: row.photo_path ?? undefined,
    photo: await photoCopyHex(db, row.photo_path),
  });
  if (error) throw dbError('safety_report_profile', error);
  if (!data) throw new AppError('not_found', 'Profile not found.');
}

// The other table's current photo, only if it joined that encounter with its profile.
async function historyPhoto(userId: string, historyId: string) {
  const { data, error } = await db.rpc('history_report_photo', {
    target_user_id: userId,
    target_history_id: historyId,
  });
  if (error) throw dbError('history_report_photo', error);
  const path = data ? data : null;
  return { reported_photo_path: path ?? undefined, photo: await photoCopyHex(db, path) };
}

Deno.serve(
  handle(async (req, raw): Promise<SafetyResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    if (body.action === 'report') {
      if (body.target === 'profile') {
        await reportProfile(user.id, body.publicId, body.reason);
      } else if (body.target === 'dm') {
        const { error } = await db.rpc('safety_report_dm', {
          target_user_id: user.id,
          target_thread_id: body.threadId,
          new_reason: body.reason,
        });
        if (error) throw dbError('safety_report_dm', error);
      } else if (body.target === 'history') {
        const { error } = await db.rpc('safety_report_history', {
          target_user_id: user.id,
          target_history_id: body.historyId,
          new_reason: body.reason,
          ...(await historyPhoto(user.id, body.historyId)),
        });
        if (error) throw dbError('safety_report_history', error);
      } else {
        const { error } = await db.rpc('safety_report', {
          target_user_id: user.id,
          target_room_id: body.roomId,
          new_reason: body.reason,
        });
        if (error) throw dbError('safety_report', error);
      }
      return { ok: true };
    }

    if (body.action === 'unblock') {
      const { error } = await db.rpc('safety_unblock', {
        target_user_id: user.id,
        target_block_id: body.blockId,
      });
      if (error) throw dbError('safety_unblock', error);
      return { ok: true };
    }

    if ('publicId' in body) {
      // Silent for the friend: no broadcast, no push (the same as friends/remove).
      const { error } = await db.rpc('safety_block_friend', {
        target_user_id: user.id,
        target_public_id: body.publicId,
        report_reason: body.report,
      });
      if (error) throw dbError('safety_block_friend', error);
      return { ok: true };
    }

    if ('historyId' in body) {
      const { error } = await db.rpc('safety_block_history', {
        target_user_id: user.id,
        target_history_id: body.historyId,
        report_reason: body.report,
        ...(body.report ? await historyPhoto(user.id, body.historyId) : {}),
      });
      if (error) throw dbError('safety_block_history', error);
      return { ok: true };
    }

    const { data, error } = await db.rpc('safety_block', {
      target_user_id: user.id,
      target_room_id: body.roomId,
    });
    if (error) throw dbError('safety_block', error);
    if (data.visibility === 'open') {
      inBackground(broadcast(venueChannel(data.venue_id), BROADCAST.lobbyChanged));
    }
    return { ok: true };
  }),
);
