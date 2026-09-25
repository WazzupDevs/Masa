// Friends (docs/SPEC_V2.md §6.2–§6.5). Requests and "Arkadaş ekle" start from the caller's own
// history row (historyId), never from a profile id; they answer { ok: true } whatever happens on
// the other side (swallowed, blocked, declined earlier), except `already_friends`. A decline
// sends nothing anywhere. Removal is silent for the other side.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { notifyInbox, pushIfAllowed, requireDisplayName } from '../_shared/inbox.ts';
import type {
  Friend,
  FriendsListResponse,
  FriendsOkResponse,
  FriendsRequest,
} from '../_shared/pure/api/friends.ts';
import { REPORT_REASONS } from '../_shared/pure/chat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { PHOTO_BUCKET, PHOTO_URL_SECONDS } from '../_shared/pure/profile.ts';
import { friendRequestPush } from '../_shared/pure/push.ts';
import { BROADCAST } from '../_shared/pure/rooms.ts';

const Body: z.ZodType<FriendsRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }),
  z.object({ action: z.literal('request'), historyId: z.uuid() }),
  z.object({ action: z.literal('respond'), requestId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('add-from-room'), historyId: z.uuid() }),
  z.object({
    action: z.literal('remove'),
    publicId: z.uuid(),
    report: z.enum(REPORT_REASONS).optional(),
  }),
]);

const db = serviceClient();

type Outcome = { outcome: string; other_user_id: string | null };

// A new friendship tells both inboxes; nothing else is broadcast from here but a new request.
function announce(userId: string, result: Outcome | undefined): void {
  if (!result?.other_user_id) return;
  if (result.outcome === 'friendship_created') {
    notifyInbox([userId, result.other_user_id], BROADCAST.friendshipChanged);
  } else if (result.outcome === 'request_created') {
    notifyInbox([result.other_user_id], BROADCAST.friendRequest);
    pushIfAllowed(db, result.other_user_id, 'notify_friend_requests', friendRequestPush());
  }
}

async function list(userId: string): Promise<FriendsListResponse> {
  const { data, error } = await db.rpc('friends_of', { viewer: userId });
  if (error) throw dbError('friends_of', error);
  const paths = data.map((f) => f.photo_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const signed = await db.storage.from(PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_SECONDS);
    if (signed.error) throw new Error(`storage sign failed (${signed.error.message})`);
    for (const s of signed.data) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const friends: Friend[] = data.map((f) => ({
    publicId: f.public_id,
    displayName: f.display_name,
    photoUrl: f.photo_path ? (urls.get(f.photo_path) ?? null) : null,
    since: f.since,
    threadId: f.thread_id,
    lastMessageAt: f.last_message_at,
    unread: f.unread,
  }));
  return { friends };
}

Deno.serve(
  handle(async (req, raw): Promise<FriendsListResponse | FriendsOkResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'list':
        return await list(user.id);

      case 'request': {
        await requireDisplayName(db, user.id);
        const { data, error } = await db.rpc('friends_request', {
          target_user_id: user.id,
          target_history_id: body.historyId,
        });
        if (error) throw dbError('friends_request', error);
        const result = data[0];
        if (result?.outcome === 'already_friends') {
          throw new AppError('already_friends', 'Already friends.');
        }
        announce(user.id, result);
        return { ok: true };
      }

      case 'respond': {
        if (body.accept) await requireDisplayName(db, user.id);
        const { data, error } = await db.rpc('friends_respond', {
          target_user_id: user.id,
          target_request_id: body.requestId,
          accept: body.accept,
        });
        if (error) throw dbError('friends_respond', error);
        announce(user.id, data[0]);
        return { ok: true };
      }

      case 'add-from-room': {
        await requireDisplayName(db, user.id);
        const { data, error } = await db.rpc('friends_add_from_room', {
          target_user_id: user.id,
          target_history_id: body.historyId,
        });
        if (error) throw dbError('friends_add_from_room', error);
        announce(user.id, data[0]);
        return { ok: true };
      }

      case 'remove': {
        const { error } = await db.rpc('friends_remove', {
          target_user_id: user.id,
          target_public_id: body.publicId,
          report_reason: body.report,
        });
        if (error) throw dbError('friends_remove', error);
        return { ok: true };
      }
    }
  }),
);
