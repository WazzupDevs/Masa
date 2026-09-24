// Rooms, lobby and join requests (MVP_SPEC §4.3, §4.4). The SQL functions do the locked state
// transitions; this handler validates, maps errors, and sends data-free broadcasts and pushes.
// Nothing sent to a requester depends on a decline: no broadcast, no push, no response field.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { sendPush } from '../_shared/push.ts';
import type {
  CreateRoomResponse,
  RequestJoinResponse,
  RoomsOkResponse,
  RoomsRequest,
} from '../_shared/pure/api/rooms.ts';
import { joinAcceptedPush, joinRequestPush } from '../_shared/pure/push.ts';
import { REVEAL } from '../_shared/pure/reveal.ts';
import {
  BROADCAST,
  CONCEPTS,
  type Concept,
  JOIN_REQUEST_TTL_SECONDS,
  MAX_JOIN_REQUESTS_PER_HOUR,
  sessionChannel,
  venueChannel,
  VISIBILITIES,
} from '../_shared/pure/rooms.ts';

const Body: z.ZodType<RoomsRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    concept: z.enum(CONCEPTS),
    visibility: z.enum(VISIBILITIES),
  }),
  z.object({ action: z.literal('request-join'), roomId: z.uuid() }),
  z.object({ action: z.literal('respond'), requestId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('end') }),
]);

const db = serviceClient();

async function pushTokenOfSession(sessionId: string): Promise<string | null> {
  const session = await db.from('table_sessions').select('user_id').eq('id', sessionId).single();
  if (session.error) throw dbError('table_sessions', session.error);
  const profile = await db
    .from('profiles')
    .select('push_token')
    .eq('id', session.data.user_id)
    .maybeSingle();
  if (profile.error) throw dbError('profiles', profile.error);
  return profile.data?.push_token ?? null;
}

function lobbyChanged(venueId: string): void {
  inBackground(broadcast(venueChannel(venueId), BROADCAST.lobbyChanged));
}

Deno.serve(
  handle(async (req, raw): Promise<CreateRoomResponse | RequestJoinResponse | RoomsOkResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'create': {
        const { data, error } = await db.rpc('rooms_create', {
          target_user_id: user.id,
          new_concept: body.concept,
          new_visibility: body.visibility,
        });
        if (error) throw dbError('rooms_create', error);
        if (data.visibility === 'open') lobbyChanged(data.venue_id);
        return { roomId: data.id };
      }

      case 'request-join': {
        const { data, error } = await db.rpc('rooms_request_join', {
          target_user_id: user.id,
          target_room_id: body.roomId,
          ttl_seconds: JOIN_REQUEST_TTL_SECONDS,
          max_per_hour: MAX_JOIN_REQUESTS_PER_HOUR,
        });
        if (error) throw dbError('rooms_request_join', error);

        const room = await db
          .from('rooms')
          .select('owner_session_id, concept')
          .eq('id', data.room_id)
          .single();
        if (room.error) throw dbError('rooms', room.error);
        const ownerSessionId = room.data.owner_session_id;
        const concept = room.data.concept as Concept;
        inBackground(broadcast(sessionChannel(ownerSessionId), BROADCAST.joinRequest));
        inBackground(
          pushTokenOfSession(ownerSessionId).then((token) =>
            sendPush(
              token,
              joinRequestPush(data.requester_alias, data.requester_headcount, concept),
            ),
          ),
        );
        return { requestId: data.id, expiresAt: data.expires_at };
      }

      case 'respond': {
        const { data, error } = await db.rpc('rooms_respond', {
          target_user_id: user.id,
          target_request_id: body.requestId,
          accept: body.accept,
        });
        if (error) throw dbError('rooms_respond', error);

        // A decline sends nothing anywhere (rule 5): the requester learns at expires_at.
        if (data.status === 'accepted') {
          const room = await db.from('rooms').select('venue_id').eq('id', data.room_id).single();
          if (room.error) throw dbError('rooms', room.error);
          lobbyChanged(room.data.venue_id);
          inBackground(
            broadcast(sessionChannel(data.requester_session_id), BROADCAST.joinAccepted),
          );
          inBackground(
            pushTokenOfSession(data.requester_session_id).then((token) =>
              sendPush(token, joinAcceptedPush()),
            ),
          );
        }
        return { ok: true };
      }

      case 'leave': {
        const { data, error } = await db.rpc('rooms_leave', { target_user_id: user.id });
        if (error) throw dbError('rooms_leave', error);
        if (data?.id && data.visibility === 'open') lobbyChanged(data.venue_id);
        return { ok: true };
      }

      // A two-table room opens the "Tanışalım mı?" window (M6); a one-table room closes.
      case 'end': {
        const { data, error } = await db.rpc('rooms_end', {
          target_user_id: user.id,
          decision_seconds: REVEAL.decisionSeconds,
        });
        if (error) throw dbError('rooms_end', error);
        if (data?.id && data.visibility === 'open') lobbyChanged(data.venue_id);
        return { ok: true };
      }
    }
  }),
);
