// DMs between friends (docs/SPEC_V2.md §6.4). The thread exists only while the friendship does.
// Broadcasts carry no data (clients reread through dm_messages_page); the push says only
// "Yeni bir mesajın var". v3 step 6 (docs/SPEC_V3.md §18.2): the Mesajlar list and the ticks; a
// status that really moves (delivered, read) is announced on dm:{thread_id} as dm_status.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { notifyInbox, pushIfAllowed } from '../_shared/inbox.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import { signPhotos } from '../_shared/photos.ts';
import type {
  DmInboxResponse,
  DmOkResponse,
  DmRequest,
  DmStatus,
} from '../_shared/pure/api/friends.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { DM_MIN_INTERVAL_MS, prepareDm } from '../_shared/pure/friends.ts';
import { containsProfanity } from '../_shared/pure/profanity.ts';
import { dmPush } from '../_shared/pure/push.ts';
import { BROADCAST, dmChannel } from '../_shared/pure/rooms.ts';

const Body: z.ZodType<DmRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send'), threadId: z.uuid(), body: z.string().max(2000) }),
  z.object({ action: z.literal('read'), threadId: z.uuid() }),
  z.object({ action: z.literal('inbox') }),
  z.object({ action: z.literal('delivered') }),
]);

const db = serviceClient();

const isStatus = (value: string | null): value is DmStatus =>
  value === 'sent' || value === 'delivered' || value === 'read';

async function inbox(userId: string): Promise<DmInboxResponse> {
  const { data, error } = await db.rpc('dm_inbox', { viewer: userId });
  if (error) throw dbError('dm_inbox', error);
  const urls = await signPhotos(
    db,
    data.map((t) => t.photo_path).filter((p): p is string => !!p),
  );
  return {
    threads: data.map((t) => ({
      threadId: t.thread_id,
      publicId: t.public_id,
      displayName: t.display_name,
      photoUrl: t.photo_path ? (urls.get(t.photo_path) ?? null) : null,
      lastBody: t.last_body,
      lastFromMe: t.last_from_me === true,
      lastMessageAt: t.last_message_at,
      unreadCount: t.unread_count,
      lastStatus: isStatus(t.last_status) ? t.last_status : null,
    })),
  };
}

Deno.serve(
  handle(async (req, raw): Promise<DmOkResponse | DmInboxResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'send': {
        const text = prepareDm(body.body);
        if (text === null)
          throw new AppError('message_invalid', 'Message must be 1–500 characters.');
        if (containsProfanity(text, await loadProfanity(db))) {
          throw new AppError('profanity_rejected', 'Message rejected.');
        }
        const { data: other, error } = await db.rpc('dm_send', {
          target_user_id: user.id,
          target_thread_id: body.threadId,
          new_body: text,
          min_interval_ms: DM_MIN_INTERVAL_MS,
        });
        if (error) throw dbError('dm_send', error);
        inBackground(broadcast(dmChannel(body.threadId), BROADCAST.dmMessage));
        notifyInbox([other], BROADCAST.dm);
        pushIfAllowed(db, other, 'notify_dm', dmPush());
        return { ok: true };
      }

      case 'read': {
        const { data: advanced, error } = await db.rpc('dm_mark_read', {
          target_user_id: user.id,
          target_thread_id: body.threadId,
        });
        if (error) throw dbError('dm_mark_read', error);
        if (advanced) inBackground(broadcast(dmChannel(body.threadId), BROADCAST.dmStatus));
        return { ok: true };
      }

      case 'inbox':
        return await inbox(user.id);

      case 'delivered': {
        const { data: threads, error } = await db.rpc('dm_mark_delivered', {
          target_user_id: user.id,
        });
        if (error) throw dbError('dm_mark_delivered', error);
        for (const threadId of threads) {
          inBackground(broadcast(dmChannel(threadId), BROADCAST.dmStatus));
        }
        return { ok: true };
      }
    }
  }),
);
