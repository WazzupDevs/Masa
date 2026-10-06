// The handler Harf Kapmaca and Şarkıda Geçsin share (docs/SPEC_V3.md §20.3–20.4): the same SQL
// functions (public.say_*) with the game's kind. Harf claims a letter (`claim`), Şarkı sings a line
// (`said`); everything else is the same.
import { requireUser, serviceClient } from './auth.ts';
import { dbError } from './db.ts';
import { z } from './deps.ts';
import { handle } from './http.ts';
import type { GameOkResponse, SayStartResponse } from './pure/api/games.ts';
import type { SayKind } from './pure/sayChallenge.ts';
import { HARF_LETTERS } from './pure/sayChallenge.ts';

const Round = z.number().int().min(1).max(20);
const Step = z.number().int().min(0).max(40);

const Start = z.object({ action: z.literal('start'), roomId: z.uuid() });
const Begin = z.object({ action: z.literal('begin'), roomId: z.uuid() });
const Claim = z.object({
  action: z.literal('claim'),
  roomId: z.uuid(),
  round: Round,
  step: Step,
  letter: z.enum(HARF_LETTERS),
});
const Said = z.object({ action: z.literal('said'), roomId: z.uuid(), round: Round, step: Step });
const Objection = z.object({
  action: z.literal('object'),
  roomId: z.uuid(),
  round: Round,
  step: Step,
});
const Advance = z.object({ action: z.literal('advance'), roomId: z.uuid() });

// Harf claims letters; Şarkı sings lines.
const BODIES = {
  harf: z.discriminatedUnion('action', [Start, Begin, Claim, Objection, Advance]),
  sarki: z.discriminatedUnion('action', [Start, Begin, Said, Objection, Advance]),
} as const;

export function serveSay(kind: SayKind) {
  const db = serviceClient();
  Deno.serve(
    handle(async (req, raw): Promise<SayStartResponse | GameOkResponse> => {
      const body = BODIES[kind].parse(raw);
      const user = await requireUser(req, db);
      const target = { target_user_id: user.id, target_room_id: body.roomId, kind };

      switch (body.action) {
        case 'start': {
          const { data, error } = await db.rpc('say_local_deck', target);
          if (error) throw dbError('say_local_deck', error);
          return { prompts: data as string[] };
        }
        case 'begin': {
          const { error } = await db.rpc('say_begin', target);
          if (error) throw dbError('say_begin', error);
          return { ok: true };
        }
        case 'claim':
        case 'said': {
          const { error } = await db.rpc('say_claim', {
            ...target,
            round: body.round,
            step: body.step,
            // Şarkı has no letter; the SQL reads it for Harf only.
            letter: body.action === 'claim' ? body.letter : '',
          });
          if (error) throw dbError('say_claim', error);
          return { ok: true };
        }
        case 'object': {
          const { error } = await db.rpc('say_object', {
            ...target,
            round: body.round,
            step: body.step,
          });
          if (error) throw dbError('say_object', error);
          return { ok: true };
        }
        case 'advance': {
          const { error } = await db.rpc('say_advance', target);
          if (error) throw dbError('say_advance', error);
          return { ok: true };
        }
      }
    }),
  );
}
