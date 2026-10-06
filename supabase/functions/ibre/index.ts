// İbre (docs/SPEC_V3.md §20.5). One table: the scales, then the phone runs the game. Two tables:
// started by rooms/answer-game, server-authoritative. The target stays in game_secrets; before the
// reveal it leaves only as the answer to the describing table's ibre/target.
import { requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import type {
  GameOkResponse,
  IbreRequest,
  IbreStartResponse,
  IbreTargetResponse,
} from '../_shared/pure/api/games.ts';
import { IBRE_MAX, IBRE_MIN } from '../_shared/pure/ibre.ts';

const Round = z.number().int().min(1).max(20);

const Body: z.ZodType<IbreRequest> = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), roomId: z.uuid() }),
  z.object({ action: z.literal('begin'), roomId: z.uuid() }),
  z.object({ action: z.literal('target'), roomId: z.uuid(), round: Round }),
  z.object({
    action: z.literal('lock'),
    roomId: z.uuid(),
    round: Round,
    value: z.number().int().min(IBRE_MIN).max(IBRE_MAX),
  }),
  z.object({
    action: z.literal('side'),
    roomId: z.uuid(),
    round: Round,
    side: z.enum(['left', 'right']),
  }),
  z.object({ action: z.literal('advance'), roomId: z.uuid() }),
]);

const db = serviceClient();

type Response = IbreStartResponse | IbreTargetResponse | GameOkResponse;

Deno.serve(
  handle(async (req, raw): Promise<Response> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);
    const target = { target_user_id: user.id, target_room_id: body.roomId };

    switch (body.action) {
      case 'start': {
        const { data, error } = await db.rpc('ibre_local_deck', target);
        if (error) throw dbError('ibre_local_deck', error);
        return { scales: data as IbreStartResponse['scales'] };
      }

      case 'begin': {
        const { error } = await db.rpc('ibre_begin', target);
        if (error) throw dbError('ibre_begin', error);
        return { ok: true };
      }

      case 'target': {
        const { data, error } = await db.rpc('ibre_target', { ...target, round: body.round });
        if (error) throw dbError('ibre_target', error);
        return data as IbreTargetResponse;
      }

      case 'lock': {
        const { error } = await db.rpc('ibre_lock', {
          ...target,
          round: body.round,
          value: body.value,
        });
        if (error) throw dbError('ibre_lock', error);
        return { ok: true };
      }

      case 'side': {
        const { error } = await db.rpc('ibre_side', {
          ...target,
          round: body.round,
          side: body.side,
        });
        if (error) throw dbError('ibre_side', error);
        return { ok: true };
      }

      case 'advance': {
        const { error } = await db.rpc('ibre_advance', target);
        if (error) throw dbError('ibre_advance', error);
        return { ok: true };
      }
    }
  }),
);
