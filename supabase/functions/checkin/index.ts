// Check-in and "Mekandan ayrıl". The coordinates in a check-in request are used for the distance
// check only: they are never stored, logged or echoed back (MVP_SPEC §4.2). Database errors are
// rethrown with their code only, so no request value can reach the logs.
import { type Db, requireUser, serviceClient } from '../_shared/auth.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { type AliasWords, pickAlias } from '../_shared/pure/alias.ts';
import type {
  CheckInRequest,
  CheckInResponse,
  CheckinRequest,
  LeaveResponse,
} from '../_shared/pure/api/checkin.ts';
import { isWithinCheckinRadius, MAX_HEADCOUNT, MIN_HEADCOUNT } from '../_shared/pure/checkin.ts';
import { CURRENT_LOCATION_CONSENT_VERSION, needsConsent } from '../_shared/pure/consent.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { type Participation, PARTICIPATIONS } from '../_shared/pure/profile.ts';

const Body: z.ZodType<CheckinRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check-in'),
    venueId: z.uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().max(100_000).nullable(),
    headcount: z.number().int().min(MIN_HEADCOUNT).max(MAX_HEADCOUNT),
    locationConsentVersion: z.string(),
    participation: z.enum(PARTICIPATIONS).optional(),
  }),
  z.object({ action: z.literal('leave') }),
]);

// A taken alias (a concurrent check-in at the same venue) is retried with another one.
const MAX_ALIAS_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

const db = serviceClient();
let aliasWords: AliasWords | null = null;

function dbError(step: string, error: { code: string }): Error {
  return new Error(`${step} failed (${error.code})`);
}

async function loadAliasWords(): Promise<AliasWords> {
  if (aliasWords) return aliasWords;
  const { data, error } = await db.from('alias_words').select('kind, word');
  if (error) throw dbError('alias_words', error);
  aliasWords = {
    adjectives: data.filter((w) => w.kind === 'adjective').map((w) => w.word),
    animals: data.filter((w) => w.kind === 'animal').map((w) => w.word),
  };
  return aliasWords;
}

// The table's participation (docs/SPEC_V2.md §5.4): the request's choice, else the profile's
// default. Joining with the profile needs a display name.
async function requireOnboarded(
  db: Db,
  userId: string,
  requested: Participation | undefined,
): Promise<Participation> {
  const { data, error } = await db
    .from('profiles')
    .select('terms_version, kvkk_version, display_name, default_participation')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw dbError('profiles', error);
  if (!data || needsConsent(data)) {
    throw new AppError('onboarding_required', 'Complete onboarding first.');
  }
  const participation =
    requested ?? (data.default_participation === 'profile' ? 'profile' : 'anonymous');
  if (participation === 'profile' && !data.display_name) {
    throw new AppError('display_name_required', 'Choose a display name first.');
  }
  return participation;
}

async function checkIn(userId: string, body: CheckInRequest): Promise<CheckInResponse> {
  const participation = await requireOnboarded(db, userId, body.participation);
  if (body.locationConsentVersion !== CURRENT_LOCATION_CONSENT_VERSION) {
    throw new AppError('consent_outdated', 'Location consent is not the current version.');
  }

  const distance = await db.rpc('venue_distance_m', {
    target_venue_id: body.venueId,
    lat: body.lat,
    lng: body.lng,
  });
  if (distance.error) throw dbError('venue_distance_m', distance.error);
  if (distance.data === null) throw new AppError('venue_not_found', 'Venue not found.');
  if (!isWithinCheckinRadius(distance.data)) {
    throw new AppError('too_far', 'You are too far from this venue.');
  }

  const [words, active] = await Promise.all([
    loadAliasWords(),
    db.from('table_sessions').select('alias').eq('venue_id', body.venueId).eq('status', 'active'),
  ]);
  if (active.error) throw dbError('table_sessions', active.error);
  const used = new Set(active.data.map((s) => s.alias));

  for (let attempt = 0; attempt < MAX_ALIAS_ATTEMPTS; attempt++) {
    const alias = pickAlias(words, used, Math.random);
    if (alias === null) break;

    const { data, error } = await db.rpc('start_table_session', {
      target_user_id: userId,
      target_venue_id: body.venueId,
      new_alias: alias,
      new_headcount: body.headcount,
      consent_version: body.locationConsentVersion,
      accuracy_m: body.accuracyM ?? undefined,
      new_participation: participation,
    });
    if (!error) return { sessionId: data.id, alias: data.alias, expiresAt: data.expires_at };
    if (error.code !== UNIQUE_VIOLATION) throw dbError('start_table_session', error);
    used.add(alias);
  }
  throw new AppError('alias_exhausted', 'No table alias is available at this venue.');
}

Deno.serve(
  handle(async (req, raw): Promise<CheckInResponse | LeaveResponse> => {
    const body = Body.parse(raw);
    const user = await requireUser(req, db);

    switch (body.action) {
      case 'check-in':
        return await checkIn(user.id, body);

      case 'leave': {
        const { error } = await db.rpc('end_table_session', { target_user_id: user.id });
        if (error) throw dbError('end_table_session', error);
        return { ok: true };
      }
    }
  }),
);
