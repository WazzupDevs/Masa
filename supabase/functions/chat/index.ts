// Room chat (MVP_SPEC §7): length and profanity checked here, membership and the one message per
// second limit in chat_send. Messages reach the other table through Postgres Changes (RLS).
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import type { ChatRequest, ChatResponse } from '../_shared/pure/api/chat.ts';
import { MIN_MESSAGE_INTERVAL_MS, prepareMessage } from '../_shared/pure/chat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { containsProfanity } from '../_shared/pure/profanity.ts';

const Body: z.ZodType<ChatRequest> = z.object({
  action: z.literal('send'),
  roomId: z.uuid(),
  body: z.string().max(1000),
});

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<ChatResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

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
    });
    if (error) throw dbError('chat_send', error);
    return { messageId: data.id };
  }),
);
