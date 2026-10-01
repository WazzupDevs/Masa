// Check-in, the spot and "Mekandan ayrıl". The coordinates in a check-in request are used for the
// boundary or distance check only: they are never stored, logged or echoed back (MVP_SPEC §4.2,
// docs/SPEC_V3.md §4.2). Database errors are rethrown with their code only, so no request value can
// reach the logs.
import { type Db, requireUser, serviceClient } from '../_shared/auth.ts';
import { dbError as domainError } from '../_shared/db.ts';
import { z } from '../_shared/deps.ts';
import { handle } from '../_shared/http.ts';
import { type AliasWords, pickAlias } from '../_shared/pure/alias.ts';
import type {
  ChangeSpotResponse,
  CheckInRequest,
  CheckInResponse,
  CheckinRequest,
  LeaveResponse,
  LocationModeResponse,
  RerollAliasResponse,
} from '../_shared/pure/api/checkin.ts';
import {
  BOUNDARY_TOLERANCE_M,
  CHECKIN_RADIUS_M,
  MAX_HEADCOUNT,
  MIN_HEADCOUNT,
} from '../_shared/pure/checkin.ts';
import {
  CURRENT_LOCATION_CONSENT_VERSION,
  needsConsent,
  needsProfile,
} from '../_shared/pure/consent.ts';
import { locationCheck } from '../_shared/pure/devProject.ts';
import { AppError } from '../_shared/pure/errors.ts';
import { ALIAS_REROLLS_PER_CHECKIN } from '../_shared/pure/rooms.ts';

const Body: z.ZodType<CheckinRequest> = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('check-in'),
    venueId: z.uuid(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().nonnegative().max(100_000).nullable(),
    headcount: z.number().int().min(MIN_HEADCOUNT).max(MAX_HEADCOUNT),
    locationConsentVersion: z.string(),
    spotId: z.uuid().optional(),
  }),
  z.object({ action: z.literal('change-spot'), spotId: z.uuid() }),
  z.object({ action: z.literal('reroll-alias') }),
  z.object({ action: z.literal('leave') }),
  z.object({ action: z.literal('location-mode') }),
]);

// A taken alias (a concurrent check-in at the same venue) is retried with another one.
const MAX_ALIAS_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

const db = serviceClient();

// CHECKIN_SKIP_LOCATION=1 on the dev project only (pure/devProject.ts): no boundary or 300 m check.
function currentLocationCheck() {
  return locationCheck(Deno.env.get('CHECKIN_SKIP_LOCATION'), Deno.env.get('SUPABASE_URL'));
}
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
    nouns: data.filter((w) => w.kind === 'noun').map((w) => w.word),
  };
  return aliasWords;
}

// Consents and the v3 profile (name and birth date) before a table opens. Anonymous or with the
// profile is chosen per room from v3 on (docs/SPEC_V3.md §5.4), not here.
async function requireOnboarded(db: Db, userId: string): Promise<void> {
  const { data, error } = await db
    .from('profiles')
    .select('terms_version, kvkk_version, display_name, has_birth_date')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw dbError('profiles', error);
  if (!data || needsConsent(data)) {
    throw new AppError('onboarding_required', 'Complete onboarding first.');
  }
  // Sign-up = profile (docs/SPEC_V3.md §3): accounts from before v3 finish their profile first.
  if (needsProfile(data)) throw new AppError('profile_required', 'Complete your profile first.');
}

// Aliases of the venue's active tables, taken by nobody else.
async function usedAliases(venueId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('table_sessions')
    .select('alias')
    .eq('venue_id', venueId)
    .eq('status', 'active');
  if (error) throw dbError('table_sessions', error);
  return new Set(data.map((s) => s.alias));
}

async function checkIn(userId: string, body: CheckInRequest): Promise<CheckInResponse> {
  await requireOnboarded(db, userId);
  if (body.locationConsentVersion !== CURRENT_LOCATION_CONSENT_VERSION) {
    throw new AppError('consent_outdated', 'Location consent is not the current version.');
  }

  // Inside the boundary (with its tolerance), or near the point of a venue without one.
  const inside = await db.rpc('venue_contains', {
    target_venue_id: body.venueId,
    lat: body.lat,
    lng: body.lng,
    tolerance_m: BOUNDARY_TOLERANCE_M,
    radius_m: CHECKIN_RADIUS_M,
  });
  if (inside.error) throw dbError('venue_contains', inside.error);
  if (inside.data === null) throw new AppError('venue_not_found', 'Venue not found.');
  // The log line never carries the position or the venue.
  const check = currentLocationCheck();
  if (check === 'skipped') {
    console.warn('checkin: CHECKIN_SKIP_LOCATION=1, location check skipped (dev only)');
  } else if (check === 'ignored') {
    console.error('checkin: CHECKIN_SKIP_LOCATION is set outside the dev project; ignored');
  }
  if (!inside.data && check !== 'skipped') {
    throw new AppError('too_far', 'You are too far from this venue.');
  }

  const [words, used] = await Promise.all([loadAliasWords(), usedAliases(body.venueId)]);

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
      new_spot_id: body.spotId,
    });
    if (!error) return { sessionId: data.id, alias: data.alias, expiresAt: data.expires_at };
    // spot_required and spot_invalid come from the database as domain errors.
    if (error.code !== UNIQUE_VIOLATION) throw domainError('start_table_session', error);
    used.add(alias);
  }
  throw new AppError('alias_exhausted', 'No table alias is available at this venue.');
}

// "Masa adını değiştir" (docs/SPEC_V3.md §5.6): a new alias unique at the venue; not in a room or
// with a request out (in_room), at most ALIAS_REROLLS_PER_CHECKIN times (reroll_limit).
async function rerollAlias(userId: string): Promise<RerollAliasResponse> {
  const { data: table, error } = await db
    .from('table_sessions')
    .select('venue_id, alias')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw dbError('table_sessions', error);
  if (!table) throw new AppError('no_active_table', 'No active table.');

  const [words, used] = await Promise.all([loadAliasWords(), usedAliases(table.venue_id)]);
  used.add(table.alias);
  for (let attempt = 0; attempt < MAX_ALIAS_ATTEMPTS; attempt++) {
    const alias = pickAlias(words, used, Math.random);
    if (alias === null) break;
    const { data, error } = await db.rpc('reroll_table_alias', {
      target_user_id: userId,
      new_alias: alias,
      max_rerolls: ALIAS_REROLLS_PER_CHECKIN,
    });
    if (!error) {
      return { alias: data.alias, rerollsLeft: ALIAS_REROLLS_PER_CHECKIN - data.alias_rerolls };
    }
    if (error.code !== UNIQUE_VIOLATION) throw domainError('reroll_table_alias', error);
    used.add(alias);
  }
  throw new AppError('alias_exhausted', 'No table alias is available at this venue.');
}

Deno.serve(
  handle(
    async (
      req,
      raw,
    ): Promise<
      | CheckInResponse
      | ChangeSpotResponse
      | RerollAliasResponse
      | LeaveResponse
      | LocationModeResponse
    > => {
      const body = Body.parse(raw);
      const user = await requireUser(req, db);

      switch (body.action) {
        case 'check-in':
          return await checkIn(user.id, body);

        case 'change-spot': {
          const { error } = await db.rpc('change_table_spot', {
            target_user_id: user.id,
            target_spot_id: body.spotId,
          });
          if (error) throw domainError('change_table_spot', error);
          return { spotId: body.spotId };
        }

        case 'reroll-alias':
          return await rerollAlias(user.id);

        // The check-in screen asks before locating: on the dev project with the switch on, a
        // position outside the venue or no position at all does not stop the flow.
        case 'location-mode':
          return { skipLocation: currentLocationCheck() === 'skipped' };

        case 'leave': {
          const { error } = await db.rpc('end_table_session', { target_user_id: user.id });
          if (error) throw dbError('end_table_session', error);
          return { ok: true };
        }
      }
    },
  ),
);
