// Venue chat room (docs/SPEC_V3.md §7): one group chat per venue for the accounts with a live table
// there. Length and profanity are checked here; the table, the rate limit and the write in
// venue_chat_send. Others learn of a new message from a data-free broadcast on
// venue_chat:{venue_id} and read it with venue_chat_page. No push.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { loadProfanity } from '../_shared/profanity.ts';
import type { VenueChatRequest, VenueChatResponse } from '../_shared/pure/api/venueChat.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { containsProfanity } from '../_shared/pure/profanity.ts';
import {
  prepareVenueMessage,
  VENUE_CHAT,
  VENUE_CHAT_BROADCAST,
  venueChatChannel,
} from '../_shared/pure/venueChat.ts';

const Body: z.ZodType<VenueChatRequest> = z.object({
  action: z.literal('send'),
  venueId: z.uuid(),
  body: z.string().max(1000),
  profiled: z.boolean(),
});

const db = serviceClient();

Deno.serve(
  handle(async (req, raw): Promise<VenueChatResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

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
    });
    if (error) throw dbError('venue_chat_send', error);
    inBackground(broadcast(venueChatChannel(body.venueId), VENUE_CHAT_BROADCAST));
    return { messageId: data.id };
  }),
);
