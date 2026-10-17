// Rooms, lobby, join requests and game proposals (MVP_SPEC §4.3, §4.4; docs/SPEC_V3.md §5). The SQL
// functions do the locked state transitions; this handler validates, maps errors, and sends
// data-free broadcasts and pushes. Nothing sent to a requester depends on a decline: no broadcast,
// no push, no response field. A room starts as a chat; a game starts only from an accepted proposal
// (a one-table room starts its games directly through tabu/start and sohbet/next-card).
// Teams (docs/SPEC_V3.md §22.C–§22.E): "Bu masadayım" asks a side's current leader; any phone
// leaves with rooms/leave; only a leader ends the room. A proposal is its side's: any phone proposes,
// any phone on the other side answers, any phone ends the game.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { inBackground } from '../_shared/background.ts';
import { broadcast } from '../_shared/broadcast.ts';
import { reachablePhotoUrl } from '../_shared/photos.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { lobbyChanged } from '../_shared/lobby.ts';
import { sendPush } from '../_shared/push.ts';
import type {
  CreateRoomResponse,
  ProposeGameResponse,
  RequestJoinResponse,
  RequestProfileResponse,
  RoomsOkResponse,
  RoomsRequest,
} from '../_shared/pure/api/rooms.ts';
import { ageOn, istanbulToday, parseIsoDate } from '../_shared/pure/age.ts';
import { type Gender, participationError } from '../_shared/pure/gender.ts';
import { PHOTO_BUCKET, PHOTO_URL_SECONDS } from '../_shared/pure/profile.ts';
import { joinAcceptedPush, joinRequestPush } from '../_shared/pure/push.ts';
import {
  BROADCAST,
  CONCEPTS,
  GAME_PROPOSAL_TTL_SECONDS,
  INTENTS,
  JOIN_REQUEST_TTL_SECONDS,
  MAX_JOIN_REQUESTS_PER_HOUR,
  PROPOSABLE_CONCEPTS,
  sessionChannel,
} from '../_shared/pure/rooms.ts';
import { SAHTEKAR } from '../_shared/pure/sahtekar.ts';
import { SOHBET_NEXT_COOLDOWN_MS } from '../_shared/pure/sohbet.ts';
import { TABU } from '../_shared/pure/tabu.ts';
import { SIDES } from '../_shared/pure/teams.ts';

// A side's player count for Sahtekar (docs/SPEC_V3.md §20.1); without it, the side's headcount when
// the game starts (§22.E).
const Players = z.number().int().min(1).max(SAHTEKAR.maxPerTable);

const Body: z.ZodType<RoomsRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    intent: z.enum(INTENTS).optional(),
    gameTag: z.enum(CONCEPTS).optional(),
    profiled: z.boolean(),
  }),
  z.object({ action: z.literal('create-solo') }),
  z.object({
    action: z.literal('request-join'),
    roomId: z.uuid(),
    profiled: z.boolean(),
    side: z.enum(SIDES).optional(),
  }),
  z.object({ action: z.literal('respond'), requestId: z.uuid(), accept: z.boolean() }),
  z.object({
    action: z.literal('propose-game'),
    roomId: z.uuid(),
    concept: z.enum(PROPOSABLE_CONCEPTS),
    players: Players.optional(),
  }),
  z.object({
    action: z.literal('answer-game'),
    roomId: z.uuid(),
    accept: z.boolean(),
    players: Players.optional(),
  }),
  z.object({ action: z.literal('end-game'), roomId: z.uuid() }),
  z.object({ action: z.literal('end') }),
  z.object({ action: z.literal('leave'), roomId: z.uuid() }),
  z.object({ action: z.literal('request-profile'), requestId: z.uuid() }),
]);

const db = serviceClient();

// The game flow ("Masanı lobiye aç", "Katıl", "Bu masadayım"; not "Masanla oyna"): an empty gender
// answers the one-time question first; a man and "Belirtmek istemiyorum" join only with the profile
// (docs/SPEC_V3.md §23.D, pure/gender.ts), never turned into a profiled entry behind their back. Then "Profilimle" needs a profile photo others can
// see (§22.G, decision 8); only its presence, at the moment of the choice.
async function requireParticipation(userId: string, profiled: boolean): Promise<void> {
  const profile = await db.from('profiles').select('gender').eq('id', userId).maybeSingle();
  if (profile.error) throw dbError('profiles', profile.error);
  const refused = participationError((profile.data?.gender ?? null) as Gender | null, profiled);
  if (refused === 'gender_required') throw new AppError(refused, 'The gender is not set yet.');
  if (refused) throw new AppError(refused, 'This account joins with its profile.');
  if (!profiled) return;
  const { data, error } = await db.rpc('has_profile_photo', { target_user_id: userId });
  if (error) throw dbError('has_profile_photo', error);
  if (!data) throw new AppError('photo_required', 'A profile photo is required to join profiled.');
}

// The request card's profile (docs/SPEC_V3.md §23.E): the name, the age and the photo of a
// requester who asked with its profile, for the leader who can answer while the request waits.
// Everything else answers not_found alike; nothing in the answer names the account (rule 4).
async function requestProfile(userId: string, requestId: string): Promise<RequestProfileResponse> {
  const owner = await db.rpc('rooms_request_profile_owner', {
    target_user_id: userId,
    target_request_id: requestId,
  });
  if (owner.error) throw dbError('rooms_request_profile_owner', owner.error);
  if (!owner.data) throw new AppError('not_found', 'Request not found.');
  const { data, error } = await db
    .from('profiles')
    .select('display_name, birth_date, photo_path, photo_hidden_at')
    .eq('id', owner.data)
    .single();
  if (error) throw dbError('profiles', error);
  const born = data.birth_date ? parseIsoDate(data.birth_date) : null;
  let photoUrl: string | null = null;
  if (data.photo_path && !data.photo_hidden_at) {
    const signed = await db.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(data.photo_path, PHOTO_URL_SECONDS);
    if (signed.error) throw new Error(`storage sign failed (${signed.error.message})`);
    photoUrl = reachablePhotoUrl(signed.data.signedUrl);
  }
  return {
    displayName: data.display_name,
    age: born ? ageOn(born, istanbulToday(new Date())) : null,
    photoUrl,
  };
}

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
      | CreateRoomResponse
      | RequestJoinResponse
      | RequestProfileResponse
      | ProposeGameResponse
      | RoomsOkResponse
    > => {
      const body = Body.parse(raw);
      const user = await requireUser(req, db);

      switch (body.action) {
        // "Oda kur" ("Masanı lobiye aç"): always open (S4), with an optional game tag (§23.C).
        case 'create': {
          await requireParticipation(user.id, body.profiled);
          const { data, error } = await db.rpc('rooms_create', {
            target_user_id: user.id,
            profiled: body.profiled,
            ...(body.intent ? { new_intent: body.intent } : {}),
            ...(body.gameTag ? { new_game_tag: body.gameTag } : {}),
          });
          if (error) throw dbError('rooms_create', error);
          lobbyChanged(data);
          return { roomId: data.id };
        }

        // "Masanla oyna": private, never in the lobby.
        case 'create-solo': {
          const { data, error } = await db.rpc('rooms_create_solo', { target_user_id: user.id });
          if (error) throw dbError('rooms_create_solo', error);
          return { roomId: data.id };
        }

        case 'request-join': {
          await requireParticipation(user.id, body.profiled);
          const { data, error } = await db.rpc('rooms_request_join', {
            target_user_id: user.id,
            target_room_id: body.roomId,
            ttl_seconds: JOIN_REQUEST_TTL_SECONDS,
            max_per_hour: MAX_JOIN_REQUESTS_PER_HOUR,
            profiled: body.profiled,
            ...(body.side ? { target_side: body.side } : {}),
          });
          if (error) throw dbError('rooms_request_join', error);

          // "Katıl" goes to the owner, "Bu masadayım" to the side's current leader.
          const room = await db
            .from('rooms')
            .select('owner_session_id, guest_session_id')
            .eq('id', data.room_id)
            .single();
          if (room.error) throw dbError('rooms', room.error);
          const leaderSessionId =
            data.as_member && data.side === 'guest'
              ? (room.data.guest_session_id ?? room.data.owner_session_id)
              : room.data.owner_session_id;
          inBackground(broadcast(sessionChannel(leaderSessionId), BROADCAST.joinRequest));
          inBackground(
            pushTokenOfSession(leaderSessionId).then((token) =>
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
            lobbyChanged(room.data);
            inBackground(
              broadcast(sessionChannel(data.requester_session_id), BROADCAST.joinAccepted),
            );
            inBackground(
              pushTokenOfSession(data.requester_session_id).then((token) =>
                sendPush(token, joinAcceptedPush()),
              ),
            );
            // §23.C: an accepted "Katıl" closed the requester's own waiting room and moved its
            // phones to the guest side, in the same transaction (both stamped with its now():
            // closed_at and joined_at equal responded_at). The lobby hears of that room too, and
            // each moved phone hears of the accept as its leader does.
            if (!data.as_member) {
              const [closed, moved] = await Promise.all([
                db
                  .from('rooms')
                  .select('id, venue_id')
                  .eq('owner_session_id', data.requester_session_id)
                  .eq('closed_at', data.responded_at ?? '')
                  .maybeSingle(),
                db
                  .from('room_members')
                  .select('session_id')
                  .eq('room_id', data.room_id)
                  .eq('side', 'guest')
                  .eq('joined_at', data.responded_at ?? '')
                  .neq('session_id', data.requester_session_id),
              ]);
              if (closed.error) throw dbError('rooms', closed.error);
              if (moved.error) throw dbError('room_members', moved.error);
              if (closed.data) lobbyChanged(closed.data);
              for (const m of moved.data) {
                inBackground(broadcast(sessionChannel(m.session_id), BROADCAST.joinAccepted));
              }
            }
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
            proposer_players: body.players,
          });
          if (error) throw dbError('rooms_propose_game', error);
          return { expiresAt: data.expires_at };
        }

        case 'answer-game': {
          const answer = (accept: boolean) =>
            db.rpc('rooms_answer_game', {
              target_user_id: user.id,
              target_room_id: body.roomId,
              accept,
              turn_seconds: TABU.turnSeconds,
              total_turns: TABU.totalTurns,
              max_passes: TABU.maxPasses,
              cards_per_turn: TABU.cardsPerTurn,
              cooldown_ms: SOHBET_NEXT_COOLDOWN_MS,
              acceptor_players: body.players,
            });
          const { error } = await answer(body.accept);
          if (error) {
            const failed = dbError('rooms_answer_game', error);
            // Sahtekar with fewer than 3 players: the acceptance is refused and the proposal goes
            // (docs/SPEC_V3.md §20.1); the raise rolled the delete back, so decline it now.
            if (failed instanceof AppError && failed.code === 'not_enough_players') {
              await answer(false);
            }
            throw failed;
          }
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

        // "Odayı bitir" (§5.5), a leader only (§22.D: a member is not_leader): the room closes and a
        // two-sided one writes its pairs' records (§23.G).
        case 'end': {
          const { data, error } = await db.rpc('rooms_end', { target_user_id: user.id });
          if (error) throw dbError('rooms_end', error);
          if (data?.id && data.visibility === 'open') lobbyChanged(data);
          return { ok: true };
        }

        // "Odadan çık" (§22.D): the phone leaves; a leader hands its side over; the side's last
        // phone ends the room as leaving the venue does, and the lobby hears of it.
        case 'leave': {
          const { data, error } = await db.rpc('rooms_leave', {
            target_user_id: user.id,
            target_room_id: body.roomId,
          });
          if (error) throw dbError('rooms_leave', error);
          if (data.visibility === 'open') lobbyChanged(data);
          return { ok: true };
        }

        case 'request-profile':
          return await requestProfile(user.id, body.requestId);
      }
    },
  ),
);
