import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { CheckInRequest } from '../functions/_shared/pure/api/checkin.ts';
import {
  CURRENT_KVKK_VERSION,
  CURRENT_LOCATION_CONSENT_VERSION,
  CURRENT_TERMS_VERSION,
} from '../functions/_shared/pure/consent.ts';
import { ANCHOR, deleteFixtureVenues, insertFixtureVenues, offset } from './fixtures/venues.ts';
import { type Client, deleteUserByPhone, invoke, signIn, sql, userIdOf } from './local.ts';

const PHONE_A = '+905550000001';
const PHONE_B = '+905550000002';

let venue: Record<string, string> = {};

beforeAll(async () => {
  await deleteFixtureVenues(sql);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  await deleteUserByPhone(PHONE_A);
  await deleteUserByPhone(PHONE_B);
});

afterAll(async () => {
  await deleteFixtureVenues(sql);
  await sql.end();
});

async function onboarded(phone: string): Promise<Client> {
  const client = await signIn(phone);
  const res = await invoke(client, 'account', {
    action: 'complete-onboarding',
    ageConfirmed: true,
    termsVersion: CURRENT_TERMS_VERSION,
    kvkkVersion: CURRENT_KVKK_VERSION,
  });
  expect(res.status).toBe(200);
  return client;
}

function checkIn(
  client: Client,
  overrides: Partial<CheckInRequest> & { venueKey?: string } = {},
): ReturnType<typeof invoke> {
  const { venueKey = 'at-anchor', ...rest } = overrides;
  const body: CheckInRequest = {
    action: 'check-in',
    venueId: venue[venueKey] ?? '',
    lat: ANCHOR.lat,
    lng: ANCHOR.lng,
    accuracyM: 12.5,
    headcount: 3,
    locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
    ...rest,
  };
  return invoke(client, 'checkin', body);
}

function venueId(key: string): string {
  const id = venue[key];
  if (!id) throw new Error(`unknown fixture venue ${key}`);
  return id;
}

function errorBody(code: string) {
  return { error: { code, message: expect.any(String) } };
}

describe('nearby_venues', () => {
  it('lists active venues within 300 m, nearest first', async () => {
    const client = await signIn(PHONE_A);
    const { data, error } = await client.rpc('nearby_venues', ANCHOR);
    expect(error).toBeNull();

    const fixtureIds = new Set(Object.values(venue));
    const rows = (data ?? []).filter((r) => fixtureIds.has(r.id));
    expect(rows.map((r) => r.id)).toEqual([
      venue['at-anchor'],
      venue.near,
      venue.mid,
      venue['edge-in'],
    ]);
    expect(rows.map((r) => Math.round(r.distance_m / 10) * 10)).toEqual([0, 120, 250, 290]);
  });

  it('measures the fixture distances as intended', async () => {
    const rows = await sql<{ source_ref: string; d: number }[]>`
      select source_ref,
        extensions.st_distance(
          location,
          extensions.st_setsrid(extensions.st_makepoint(${ANCHOR.lng}, ${ANCHOR.lat}), 4326)::extensions.geography
        ) as d
      from public.venues where source = 'test-fixture'
    `;
    const byKey = Object.fromEntries(rows.map((r) => [r.source_ref, r.d]));
    expect(byKey['edge-in']).toBeGreaterThan(285);
    expect(byKey['edge-in']).toBeLessThan(295);
    expect(byKey['edge-out']).toBeGreaterThan(305);
    expect(byKey['edge-out']).toBeLessThan(315);
  });
});

describe('checkin/check-in', () => {
  it('opens a 4 hour table with a unique alias and records location consent', async () => {
    const client = await onboarded(PHONE_A);
    const res = await checkIn(client);
    expect(res).toEqual({
      status: 200,
      body: {
        sessionId: expect.any(String),
        alias: expect.stringMatching(/^\S+ \S+$/),
        expiresAt: expect.any(String),
      },
    });

    const id = await userIdOf(client);
    const [session] = await sql`
      select *, extract(epoch from expires_at - created_at) as seconds
      from public.table_sessions where user_id = ${id}
    `;
    expect(session).toMatchObject({ status: 'active', headcount: 3, gps_accuracy_m: 12.5 });
    expect(Number(session?.seconds)).toBe(4 * 3600);

    const [profile] =
      await sql`select location_consent_at, location_consent_version from public.profiles where id = ${id}`;
    expect(profile?.location_consent_version).toBe(CURRENT_LOCATION_CONSENT_VERSION);
    expect(profile?.location_consent_at).toBeInstanceOf(Date);

    // The own table is readable through RLS.
    const { data } = await client.from('table_sessions').select('alias, status');
    expect(data).toEqual([{ alias: (res.body as { alias: string }).alias, status: 'active' }]);
  });

  it('accepts a venue 290 m away and rejects one 310 m away', async () => {
    const client = await onboarded(PHONE_A);
    expect((await checkIn(client, { venueKey: 'edge-in' })).status).toBe(200);

    const res = await checkIn(client, { venueKey: 'edge-out' });
    expect(res).toEqual({ status: 403, body: errorBody('too_far') });
  });

  it('rejects inactive and unknown venues', async () => {
    const client = await onboarded(PHONE_A);
    expect(await checkIn(client, { venueKey: 'inactive' })).toEqual({
      status: 404,
      body: errorBody('venue_not_found'),
    });
    expect(await checkIn(client, { venueId: '00000000-0000-4000-8000-000000000000' })).toEqual({
      status: 404,
      body: errorBody('venue_not_found'),
    });
  });

  it('requires completed onboarding and the current location consent', async () => {
    const fresh = await signIn(PHONE_A);
    expect(await checkIn(fresh)).toEqual({ status: 403, body: errorBody('onboarding_required') });

    const client = await onboarded(PHONE_B);
    expect(await checkIn(client, { locationConsentVersion: 'old' })).toEqual({
      status: 409,
      body: errorBody('consent_outdated'),
    });
  });

  it('validates headcount and coordinates', async () => {
    const client = await onboarded(PHONE_A);
    for (const bad of [
      { headcount: 0 },
      { headcount: 5 },
      { lat: 91 },
      { accuracyM: -1 },
      { participation: 'public' as never },
    ]) {
      expect((await checkIn(client, bad)).status, JSON.stringify(bad)).toBe(400);
    }
  });

  it('ends the previous table when checking in again', async () => {
    const client = await onboarded(PHONE_A);
    await checkIn(client);
    await checkIn(client, { venueKey: 'near' });

    const rows = await sql`
      select status, ended_at is not null as ended from public.table_sessions
      where user_id = ${await userIdOf(client)} order by created_at
    `;
    expect(rows.map((r) => [r.status, r.ended])).toEqual([
      ['ended', true],
      ['active', false],
    ]);
  });

  it('gives tables at the same venue different aliases', async () => {
    const a = await onboarded(PHONE_A);
    const b = await onboarded(PHONE_B);
    const aliasA = ((await checkIn(a)).body as { alias: string }).alias;
    const aliasB = ((await checkIn(b)).body as { alias: string }).alias;
    expect(aliasA).not.toBe(aliasB);

    // Other tables are invisible through RLS.
    const { data } = await a.from('table_sessions').select('alias');
    expect(data).toEqual([{ alias: aliasA }]);
  });

  it('rejects a duplicate active alias at the database level', async () => {
    const a = await onboarded(PHONE_A);
    const b = await onboarded(PHONE_B);
    const alias = ((await checkIn(a)).body as { alias: string }).alias;
    await expect(sql`
      insert into public.table_sessions (user_id, venue_id, alias, headcount, expires_at)
      values (${await userIdOf(b)}, ${venueId('at-anchor')}, ${alias}, 2, now() + interval '1 hour')
    `).rejects.toMatchObject({ code: '23505' });
  });
});

describe('checkin/leave and expiry', () => {
  it('ends the active table and is idempotent', async () => {
    const client = await onboarded(PHONE_A);
    await checkIn(client);
    expect(await invoke(client, 'checkin', { action: 'leave' })).toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(await invoke(client, 'checkin', { action: 'leave' })).toEqual({
      status: 200,
      body: { ok: true },
    });
    const rows =
      await sql`select status from public.table_sessions where user_id = ${await userIdOf(client)}`;
    expect(rows.map((r) => r.status)).toEqual(['ended']);
  });

  it('ends tables past their 4 hours, scheduled every minute', async () => {
    const client = await onboarded(PHONE_A);
    await checkIn(client);
    const id = await userIdOf(client);
    await sql`update public.table_sessions set expires_at = now() - interval '1 minute' where user_id = ${id}`;

    const [result] = await sql`select private.end_expired_table_sessions() as ended`;
    expect(result?.ended).toBeGreaterThanOrEqual(1);
    const [row] =
      await sql`select status, ended_at = expires_at as at_expiry from public.table_sessions where user_id = ${id}`;
    expect(row).toMatchObject({ status: 'ended', at_expiry: true });

    const jobs =
      await sql`select schedule from cron.job where jobname = 'end-expired-table-sessions'`;
    expect(jobs.map((j) => j.schedule)).toEqual(['* * * * *']);
  });
});

describe('privacy', () => {
  it('stores no coordinates anywhere and never echoes them', async () => {
    const client = await onboarded(PHONE_A);
    // Distinctive coordinates 20 m from the anchor venue.
    const here = offset(ANCHOR, 20, 10);
    const lat = Number(here.lat.toFixed(7));
    const lng = Number(here.lng.toFixed(7));
    // Full decimal forms (with the integer part), also rounded, so a UUID cannot match by chance.
    const needles = [lat, lng].flatMap((n) => [n.toFixed(7), n.toFixed(5)]);

    const ok = await checkIn(client, { lat, lng });
    expect(ok.status).toBe(200);
    const tooFar = await checkIn(client, { lat, lng, venueKey: 'far' });
    expect(tooFar.status).toBe(403);
    for (const res of [ok, tooFar]) {
      for (const needle of needles) expect(JSON.stringify(res.body)).not.toContain(needle);
    }

    // Every row of every public table, as text.
    const tables = await sql<{ name: string }[]>`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    `;
    for (const { name } of tables) {
      const rows = await sql`select t::text as row from ${sql('public.' + name)} t`;
      for (const { row } of rows) {
        for (const needle of needles) expect(row, `public.${name}`).not.toContain(needle);
      }
    }

    // The only spatial column is the venue location.
    const spatial = await sql`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' and udt_name in ('geography', 'geometry')
    `;
    expect(spatial.map((c) => `${c.table_name}.${c.column_name}`)).toEqual(['venues.location']);
  });

  it('keeps the server-side helpers closed to clients', async () => {
    const client = await onboarded(PHONE_A);
    const id = await userIdOf(client);
    const distance = await client.rpc('venue_distance_m', {
      target_venue_id: venueId('at-anchor'),
      ...ANCHOR,
    });
    expect(distance.error?.code).toBe('42501');
    const start = await client.rpc('start_table_session', {
      target_user_id: id,
      target_venue_id: venueId('at-anchor'),
      new_alias: 'Mor Baykuş',
      new_headcount: 2,
      consent_version: CURRENT_LOCATION_CONSENT_VERSION,
    });
    expect(start.error?.code).toBe('42501');
    const end = await client.rpc('end_table_session', { target_user_id: id });
    expect(end.error?.code).toBe('42501');
  });
});
