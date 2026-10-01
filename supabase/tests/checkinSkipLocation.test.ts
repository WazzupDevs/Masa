// CHECKIN_SKIP_LOCATION (dev project only, pure/devProject.ts). The normal suite runs without the
// secret. The skipped case needs a function server started with it (CI does this after the normal
// suite, .github/workflows/ci.yml):
//   echo CHECKIN_SKIP_LOCATION=1 > /tmp/skip.env && pnpm supabase functions serve --env-file /tmp/skip.env
//   CHECKIN_SKIP_LOCATION_TEST=1 pnpm vitest run -c vitest.integration.config.ts supabase/tests/checkinSkipLocation.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CheckInRequest } from '../functions/_shared/pure/api/checkin.ts';
import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../functions/_shared/pure/consent.ts';
import { ANCHOR, deleteFixtureVenues, insertFixtureVenues, offset } from './fixtures/venues.ts';
import { type Client, deleteUserByPhone, invoke, signIn, sql, userIdOf } from './local.ts';

const PHONE = '+905550000001';
const skipping = process.env.CHECKIN_SKIP_LOCATION_TEST === '1';

let venue: Record<string, string> = {};

beforeAll(async () => {
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  await deleteUserByPhone(PHONE);
});

afterAll(async () => {
  await deleteFixtureVenues(sql);
  await sql.end();
});

async function onboarded(): Promise<Client> {
  const client = await signIn(PHONE);
  const res = await invoke(client, 'account', {
    action: 'complete-onboarding',
    termsVersion: CURRENT_TERMS_VERSION,
    kvkkVersion: CURRENT_KVKK_VERSION,
    displayName: 'Test Masa',
    birthDate: '2000-01-15',
  });
  expect(res.status).toBe(200);
  return client;
}

// 5 km from the anchor: outside every fixture venue's 300 m.
const FAR = offset(ANCHOR, 5000, 90);

function checkInFar(client: Client, venueKey: string): ReturnType<typeof invoke> {
  const body: CheckInRequest = {
    action: 'check-in',
    venueId: venue[venueKey] ?? '',
    lat: FAR.lat,
    lng: FAR.lng,
    accuracyM: null,
    headcount: 2,
    locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
  };
  return invoke(client, 'checkin', body);
}

const errorBody = (code: string) => ({ error: { code, message: expect.any(String) } });

describe.runIf(!skipping)('check-in without CHECKIN_SKIP_LOCATION', () => {
  it('refuses a position far from the venue with too_far and says the check is on', async () => {
    const client = await onboarded();
    expect(await invoke(client, 'checkin', { action: 'location-mode' })).toEqual({
      status: 200,
      body: { skipLocation: false },
    });
    expect(await checkInFar(client, 'at-anchor')).toEqual({
      status: 403,
      body: errorBody('too_far'),
    });
  });
});

describe.runIf(skipping)('check-in with CHECKIN_SKIP_LOCATION=1 (local stack)', () => {
  it('accepts a position far from the venue and says the check is off', async () => {
    const client = await onboarded();
    expect(await invoke(client, 'checkin', { action: 'location-mode' })).toEqual({
      status: 200,
      body: { skipLocation: true },
    });
    const res = await checkInFar(client, 'at-anchor');
    expect(res.status).toBe(200);

    // Rule 6: still only the venue is stored, never the position.
    const id = await userIdOf(client);
    const [session] = await sql`
      select venue_id, gps_accuracy_m, row_to_json(t)::text as row
      from public.table_sessions t where user_id = ${id} and status = 'active'
    `;
    expect(session?.venue_id).toBe(venue['at-anchor']);
    expect(session?.gps_accuracy_m).toBeNull();
    for (const n of [FAR.lat, FAR.lng]) {
      expect(String(session?.row)).not.toContain(n.toFixed(4));
    }
  });

  it('still refuses an inactive or unknown venue', async () => {
    const client = await onboarded();
    expect(await checkInFar(client, 'inactive')).toEqual({
      status: 404,
      body: errorBody('venue_not_found'),
    });
  });
});
