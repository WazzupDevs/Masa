// Rooms, lobby, join requests and game proposals (MVP_SPEC §4.3, §4.4; docs/SPEC_V3.md §5). The SQL
// functions do the locked state transitions; this handler validates, maps errors, and sends
// data-free broadcasts and pushes. Nothing sent to a requester depends on a decline: no broadcast,
// no push, no response field. A room starts as a chat; a game starts only from an accepted proposal
// (a one-table room starts its games directly through tabu/start and sohbet/next-card).
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { lobbyChanged } from '../_shared/lobby.ts';
import { sendPush } from '../_shared/push.ts';
import type {
  CreateRoomResponse,
  ProposeGameResponse,
  RequestJoinResponse,
  RoomsOkResponse,
  RoomsRequest,
} from '../_shared/pure/api/rooms.ts';
import { joinAcceptedPush, joinRequestPush } from '../_shared/pure/push.ts';
import { REVEAL } from '../_shared/pure/reveal.ts';
import {
  BROADCAST,
  CONCEPTS,
  GAME_PROPOSAL_TTL_SECONDS,
  INTENTS,
  JOIN_REQUEST_TTL_SECONDS,
  MAX_JOIN_REQUESTS_PER_HOUR,
  sessionChannel,
} from '../_shared/pure/rooms.ts';
import { SOHBET_NEXT_COOLDOWN_MS } from '../_shared/pure/sohbet.ts';
import { TABU } from '../_shared/pure/tabu.ts';

const Body: z.ZodType<RoomsRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    intent: z.enum(INTENTS).optional(),
    profiled: z.boolean(),
  }),
  z.object({ action: z.literal('create-solo') }),
  z.object({ action: z.literal('request-join'), roomId: z.uuid(), profiled: z.boolean() }),
  z.object({ action: z.literal('respond'), requestId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('propose-game'), roomId: z.uuid(), concept: z.enum(CONCEPTS) }),
  z.object({ action: z.literal('answer-game'), roomId: z.uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('end-game'), roomId: z.uuid() }),
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

Deno.serve(
  handle(
    async (
      req,
      raw,
    ): Promise<
      CreateRoomResponse | RequestJoinResponse | ProposeGameResponse | RoomsOkResponse
    > => {
      const body = Body.parse(raw);
      const user = await requireUser(req, db);

      switch (body.action) {
        // "Oda kur": always open (S4).
        case 'create': {
          const { data, error } = await db.rpc('rooms_create', {
            target_user_id: user.id,
            profiled: body.profiled,
            ...(body.intent ? { new_intent: body.intent } : {}),
          });
          if (error) throw dbError('rooms_create', error);
          lobbyChanged(db, data);
          return { roomId: data.id };
        }

        // "Masanla oyna": private, never in the lobby.
        case 'create-solo': {
          const { data, error } = await db.rpc('rooms_create_solo', { target_user_id: user.id });
          if (error) throw dbError('rooms_create_solo', error);
          return { roomId: data.id };
        }

        case 'request-join': {
          const { data, error } = await db.rpc('rooms_request_join', {
            target_user_id: user.id,
            target_room_id: body.roomId,
            ttl_seconds: JOIN_REQUEST_TTL_SECONDS,
            max_per_hour: MAX_JOIN_REQUESTS_PER_HOUR,
            profiled: body.profiled,
          });
          if (error) throw dbError('rooms_request_join', error);

          const room = await db
            .from('rooms')
            .select('owner_session_id')
            .eq('id', data.room_id)
            .single();
          if (room.error) throw dbError('rooms', room.error);
          const ownerSessionId = room.data.owner_session_id;
          inBackground(broadcast(sessionChannel(ownerSessionId), BROADCAST.joinRequest));
          inBackground(
            pushTokenOfSession(ownerSessionId).then((token) =>
              sendPush(token, joinRequestPush(data.requester_alias, data.requester_headcount)),
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
            const room = await db
              .from('rooms')
              .select('id, venue_id')
              .eq('id', data.room_id)
              .single();
            if (room.error) throw dbError('rooms', room.error);
            lobbyChanged(db, room.data);
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

        // The other table sees the proposal through the room channel's Postgres Changes.
        case 'propose-game': {
          const { data, error } = await db.rpc('rooms_propose_game', {
            target_user_id: user.id,
            target_room_id: body.roomId,
            new_concept: body.concept,
            ttl_seconds: GAME_PROPOSAL_TTL_SECONDS,
          });
          if (error) throw dbError('rooms_propose_game', error);
          return { expiresAt: data.expires_at };
        }

        case 'answer-game': {
          const { error } = await db.rpc('rooms_answer_game', {
            target_user_id: user.id,
            target_room_id: body.roomId,
            accept: body.accept,
            turn_seconds: TABU.turnSeconds,
            total_turns: TABU.totalTurns,
            max_passes: TABU.maxPasses,
            cards_per_turn: TABU.cardsPerTurn,
            cooldown_ms: SOHBET_NEXT_COOLDOWN_MS,
          });
          if (error) throw dbError('rooms_answer_game', error);
          return { ok: true };
        }

        case 'end-game': {
          const { error } = await db.rpc('rooms_end_game', {
            target_user_id: user.id,
            target_room_id: body.roomId,
          });
          if (error) throw dbError('rooms_end_game', error);
          return { ok: true };
        }

        // "Odayı bitir", the only way out (§5.5): a two-table room opens the "Tanışalım mı?"
        // window; a one-table room closes.
        case 'end': {
          const { data, error } = await db.rpc('rooms_end', {
            target_user_id: user.id,
            decision_seconds: REVEAL.decisionSeconds,
          });
          if (error) throw dbError('rooms_end', error);
          if (data?.id && data.visibility === 'open') lobbyChanged(db, data);
          return { ok: true };
        }
      }
    },
  ),
);
