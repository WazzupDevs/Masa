// Venue chat room (docs/SPEC_V3.md §7): one group chat per venue for the accounts with a live table
// there. Length and profanity are checked here; the table, the rate limit and the write in
// venue_chat_send. Others learn of a new message from a data-free broadcast on
// venue_chat:{venue_id} and read it with `page`, which signs the photos of profiled messages
// (§7.2; venue_chat_page_for). No push. §21: a reply names a visible message of the same venue; a
// reaction is the account's one per message (10 per 10 seconds), announced as venue_chat_reaction;
// the page says how many per emoji, never who.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { signPhotos } from '../_shared/photos.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import type { ReactResponse } from '../_shared/pure/api/chat.ts';
import type {
  VenueChatPageResponse,
  VenueChatRequest,
  VenueChatResponse,
} from '../_shared/pure/api/venueChat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { parseQuote, parseReactionCounts } from '../_shared/pure/messageExtras.ts';
import { containsProfanity } from '../_shared/pure/profanity.ts';
import { isReaction, type Reaction } from '../_shared/pure/reactions.ts';
import {
  prepareVenueMessage,
  VENUE_CHAT,
  VENUE_CHAT_BROADCAST,
  VENUE_CHAT_REACTION_BROADCAST,
  venueChatChannel,
} from '../_shared/pure/venueChat.ts';

const Body: z.ZodType<VenueChatRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    venueId: z.uuid(),
    body: z.string().max(1000),
    profiled: z.boolean(),
    replyTo: z.uuid().optional(),
  }),
  z.object({
    action: z.literal('react'),
    messageId: z.uuid(),
    emoji: z.custom<Reaction>(isReaction).nullable(),
  }),
  z.object({
    action: z.literal('page'),
    venueId: z.uuid(),
    before: z.iso.datetime({ offset: true }).optional(),
  }),
]);

const db = serviceClient();

// Empty without a live table at the venue. Only profiled messages have a path (never an anonymous
// one, never a hidden photo); each distinct path is signed once.
async function page(
  userId: string,
  venueId: string,
  before?: string,
): Promise<VenueChatPageResponse> {
  const { data, error } = await db.rpc('venue_chat_page_for', {
    target_user_id: userId,
    target_venue_id: venueId,
    ...(before ? { before } : {}),
    page_size: VENUE_CHAT.pageSize,
  });
  if (error) throw dbError('venue_chat_page_for', error);
  const urls = await signPhotos(db, [
    ...new Set(data.map((m) => m.photo_path).filter((p): p is string => !!p)),
  ]);
  return {
    messages: data.map((m) => ({
      id: m.id,
      profiled: m.profiled,
      senderAlias: m.sender_alias,
      displayName: m.display_name,
      photoUrl: m.photo_path ? (urls.get(m.photo_path) ?? null) : null,
      body: m.body,
      createdAt: m.created_at,
      fromMe: m.from_me,
      replyTo: parseQuote(m.reply_to),
      reactions: parseReactionCounts(m.reactions),
    })),
  };
}

Deno.serve(
  handle(async (req, raw): Promise<VenueChatResponse | VenueChatPageResponse | ReactResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);
    if (body.action === 'page') return page(user.id, body.venueId, body.before);
    if (body.action === 'react') {
      const { data, error } = await db.rpc('venue_chat_react', {
        target_user_id: user.id,
        target_message_id: body.messageId,
        // null removes it; the generated argument type leaves out null.
        new_emoji: body.emoji as string,
        window_seconds: VENUE_CHAT.reactionWindowSeconds,
        window_max: VENUE_CHAT.reactionWindowMax,
      });
      if (error) throw dbError('venue_chat_react', error);
      const row = data[0];
      if (row?.changed) {
        inBackground(broadcast(venueChatChannel(row.venue_id), VENUE_CHAT_REACTION_BROADCAST));
      }
      return { ok: true };
    }

    const text = prepareVenueMessage(body.body);
    if (text === null) {
      throw new AppError('message_invalid', 'Message must be 1 to 200 characters.');
    }
    // Rejected, not masked (rule 7).
    if (containsProfanity(text, await loadProfanity(db))) {
      throw new AppError('profanity_rejected', 'Message contains inappropriate language.');
    }

    const { data, error } = await db.rpc('venue_chat_send', {
      target_user_id: user.id,
      target_venue_id: body.venueId,
      new_body: text,
      profiled: body.profiled,
      min_interval_ms: VENUE_CHAT.minIntervalMs,
      window_seconds: VENUE_CHAT.windowSeconds,
      window_max: VENUE_CHAT.windowMax,
      ...(body.replyTo ? { reply_to: body.replyTo } : {}),
    });
    if (error) throw dbError('venue_chat_send', error);
    inBackground(broadcast(venueChatChannel(body.venueId), VENUE_CHAT_BROADCAST));
    return { messageId: data.id };
  }),
);
