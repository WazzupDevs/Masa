// Room chat (MVP_SPEC §7): length and profanity checked here, membership and the one message per
// second limit in chat_send. Messages reach the other table through Postgres Changes (RLS).
// docs/SPEC_V3.md §21: a reply names a message of the same room; a reaction is the table's one per
// message, announced by a data-free `reaction` broadcast on messages:{room_id}.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import type { ChatRequest, ChatResponse, ReactResponse } from '../_shared/pure/api/chat.ts';
import { MIN_MESSAGE_INTERVAL_MS, prepareMessage } from '../_shared/pure/chat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { containsProfanity } from '../_shared/pure/profanity.ts';
import { isReaction, type Reaction } from '../_shared/pure/reactions.ts';
import { BROADCAST, messagesChannel } from '../_shared/pure/rooms.ts';

const Emoji = z.custom<Reaction>(isReaction).nullable();

const Body: z.ZodType<ChatRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    roomId: z.uuid(),
    body: z.string().max(1000),
    replyTo: z.uuid().optional(),
  }),
  z.object({ action: z.literal('react'), messageId: z.uuid(), emoji: Emoji }),
]);

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<ChatResponse | ReactResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    if (body.action === 'react') {
      const { data, error } = await db.rpc('chat_react', {
        target_user_id: user.id,
        target_message_id: body.messageId,
        // null removes it; the generated argument type leaves out null.
        new_emoji: body.emoji as string,
      });
      if (error) throw dbError('chat_react', error);
      const row = data[0];
      if (row?.changed) inBackground(broadcast(messagesChannel(row.room_id), BROADCAST.reaction));
      return { ok: true };
    }

    const text = prepareMessage(body.body);
    if (text === null)
      throw new AppError('message_invalid', 'Message must be 1 to 200 characters.');
    if (containsProfanity(text, await loadProfanity(db))) {
      throw new AppError('profanity_rejected', 'Message contains inappropriate language.');
    }

    const { data, error } = await db.rpc('chat_send', {
      target_user_id: user.id,
      target_room_id: body.roomId,
      new_body: text,
      min_interval_ms: MIN_MESSAGE_INTERVAL_MS,
      ...(body.replyTo ? { reply_to: body.replyTo } : {}),
    });
    if (error) throw dbError('chat_send', error);
    return { messageId: data.id };
  }),
);
