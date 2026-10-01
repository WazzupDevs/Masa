// The campus pilot (docs/SPEC_V3.md §4): check-in against a boundary with a 50 m tolerance, spots
// declared by the table, the same-spot rule for join requests and spots added through the seed. A
// fixture polygon, not the real campus.
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { BOUNDARY_TOLERANCE_M } from '../functions/_shared/pure/checkin.ts';
import { CURRENT_LOCATION_CONSENT_VERSION } from '../functions/_shared/pure/consent.ts';
import {
  ANCHOR,
  CAMPUS_CENTER,
  CAMPUS_HALF_M,
  deleteFixtureCampus,
  deleteFixtureVenues,
  FIXTURE_CAMPUS,
  type FixtureCampus,
  insertFixtureCampus,
  insertFixtureVenues,
  offset,
  squareRing,
} from './fixtures/venues.ts';
import { checkInAt, errorBody, onboarded, PHONES } from './helpers.ts';
import { type Client, dbUrl, deleteUserByPhone, invoke, sql, userIdOf } from './local.ts';

let campus: FixtureCampus;
let otherCampus: FixtureCampus;
let venue: Record<string, string> = {};

const OTHER_CAMPUS = {
  ...FIXTURE_CAMPUS,
  ref: 'fixture-campus-2',
  name: 'Test Kampüsü İki',
  boundary: squareRing(offset(CAMPUS_CENTER, 3000, 90), 100),
  spots: [{ ref: 'bahce', name: 'Bahçe', isActive: true }],
};

beforeAll(async () => {
  await deleteFixtureCampus(sql);
  await deleteFixtureVenues(sql);
  campus = await insertFixtureCampus(sql);
  otherCampus = await insertFixtureCampus(sql, OTHER_CAMPUS);
  venue = await insertFixtureVenues(sql);
});

afterEach(async () => {
  for (const phone of PHONES) await deleteUserByPhone(phone);
});

afterAll(async () => {
  await deleteFixtureCampus(sql);
  await deleteFixtureVenues(sql);
  await sql.end();
});

function spot(ref: string, of: FixtureCampus = campus): string {
  const id = of.spots[ref];
  if (!id) throw new Error(`unknown fixture spot ${ref}`);
  return id;
}

function checkIn(
  client: Client,
  at: { lat: number; lng: number },
  extra: { spotId?: string; venueId?: string } = {},
) {
  return invoke(client, 'checkin', {
    action: 'check-in',
    venueId: extra.venueId ?? campus.venueId,
    lat: at.lat,
    lng: at.lng,
    accuracyM: 20,
    headcount: 2,
    locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
    ...(extra.spotId ? { spotId: extra.spotId } : {}),
  });
}

async function atSpot(phone: string, ref: string): Promise<Client> {
  const client = await onboarded(phone);
  const res = await checkIn(client, CAMPUS_CENTER, { spotId: spot(ref) });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return client;
}

const changeSpot = (client: Client, spotId: string) =>
  invoke(client, 'checkin', { action: 'change-spot', spotId });

async function createRoom(client: Client): Promise<string> {
  const res = await invoke(client, 'rooms', { action: 'create', profiled: false });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return (res.body as { roomId: string }).roomId;
}

async function lobby(client: Client) {
  const { data, error } = await client.rpc('venue_lobby', { target_venue_id: campus.venueId });
  expect(error).toBeNull();
  return data ?? [];
}

async function sessionOf(client: Client) {
  const [row] = await sql<{ id: string; spot_id: string | null; expires_at: Date }[]>`
    select id, spot_id, expires_at from public.table_sessions
    where user_id = ${await userIdOf(client)} and status = 'active'
  `;
  return row;
}

describe('check-in at a venue with a boundary', () => {
  it('accepts inside the boundary and stores the spot, not the position', async () => {
    const client = await onboarded(PHONES[0]);
    const res = await checkIn(client, CAMPUS_CENTER, { spotId: spot('kantin') });
    expect(res.status).toBe(200);
    expect((await sessionOf(client))?.spot_id).toBe(spot('kantin'));
  });

  it('accepts 40 m outside the boundary and refuses 60 m (50 m tolerance)', async () => {
    expect(BOUNDARY_TOLERANCE_M).toBe(50);
    const client = await onboarded(PHONES[0]);
    for (const bearing of [0, 90, 180, 270]) {
      const near = offset(CAMPUS_CENTER, CAMPUS_HALF_M + 40, bearing);
      const far = offset(CAMPUS_CENTER, CAMPUS_HALF_M + 60, bearing);
      expect((await checkIn(client, near, { spotId: spot('kantin') })).status, `${bearing}°`).toBe(
        200,
      );
      expect(await checkIn(client, far, { spotId: spot('kantin') })).toEqual({
        status: 403,
        body: errorBody('too_far'),
      });
    }
  });

  it('measures the fixture as intended (40 m and 60 m from the boundary)', async () => {
    const [row] = await sql<{ near: number; far: number }[]>`
      select
        extensions.st_distance(boundary, extensions.st_setsrid(extensions.st_makepoint(
          ${offset(CAMPUS_CENTER, CAMPUS_HALF_M + 40, 90).lng},
          ${offset(CAMPUS_CENTER, CAMPUS_HALF_M + 40, 90).lat}), 4326)::extensions.geography) as near,
        extensions.st_distance(boundary, extensions.st_setsrid(extensions.st_makepoint(
          ${offset(CAMPUS_CENTER, CAMPUS_HALF_M + 60, 90).lng},
          ${offset(CAMPUS_CENTER, CAMPUS_HALF_M + 60, 90).lat}), 4326)::extensions.geography) as far
      from public.venues where id = ${campus.venueId}
    `;
    expect(row?.near).toBeGreaterThan(35);
    expect(row?.near).toBeLessThan(45);
    expect(row?.far).toBeGreaterThan(55);
    expect(row?.far).toBeLessThan(65);
  });

  it('needs a spot there, and only an active spot of the same venue', async () => {
    const client = await onboarded(PHONES[0]);
    expect(await checkIn(client, CAMPUS_CENTER)).toEqual({
      status: 422,
      body: errorBody('spot_required'),
    });
    expect(await checkIn(client, CAMPUS_CENTER, { spotId: spot('bahce', otherCampus) })).toEqual({
      status: 422,
      body: errorBody('spot_invalid'),
    });
    expect(await checkIn(client, CAMPUS_CENTER, { spotId: spot('eski') })).toEqual({
      status: 422,
      body: errorBody('spot_invalid'),
    });
    expect(await sessionOf(client)).toBeUndefined();
  });

  it('keeps the 300 m rule at a venue without a boundary, where no spot is taken', async () => {
    const client = await onboarded(PHONES[0]);
    await checkInAt(client, venue, 'edge-in');
    expect((await sessionOf(client))?.spot_id).toBeNull();
    const withSpot = await invoke(client, 'checkin', {
      action: 'check-in',
      venueId: venue['at-anchor'],
      lat: ANCHOR.lat,
      lng: ANCHOR.lng,
      accuracyM: 10,
      headcount: 2,
      locationConsentVersion: CURRENT_LOCATION_CONSENT_VERSION,
      spotId: spot('kantin'),
    });
    expect(withSpot).toEqual({ status: 422, body: errorBody('spot_invalid') });
  });

  it('checks the tolerance on the server even for a point just inside the 300 m radius', async () => {
    // 290 m from the campus centre is 140 m outside the boundary: a radius rule would take it.
    const client = await onboarded(PHONES[0]);
    const res = await checkIn(client, offset(CAMPUS_CENTER, 290, 0), { spotId: spot('kantin') });
    expect(res).toEqual({ status: 403, body: errorBody('too_far') });
  });
});

describe('spots in the lobby', () => {
  it("lists every spot's rooms with the spot and no count", async () => {
    const owner = await atSpot(PHONES[0], 'kantin');
    const viewer = await atSpot(PHONES[1], 'kutuphane');
    const roomId = await createRoom(owner);
    const [room] = await sql`select spot_id from public.rooms where id = ${roomId}`;
    expect(room?.spot_id).toBe(spot('kantin'));

    const rows = await lobby(viewer);
    expect(rows).toEqual([expect.objectContaining({ room_id: roomId, spot_name: 'Kantin' })]);
    expect(rows[0]?.spot_id).toBe(spot('kantin'));
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      [
        'alias',
        'intent',
        'headcount',
        'profiled',
        'room_id',
        'spot_id',
        'spot_name',
        'waiting_since',
      ].sort(),
    );
  });

  it('refuses a request from another spot until "Bu noktadayım"', async () => {
    const owner = await atSpot(PHONES[0], 'kantin');
    const guest = await atSpot(PHONES[1], 'kutuphane');
    const roomId = await createRoom(owner);
    const before = (await sessionOf(guest))?.expires_at;

    expect(
      await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false }),
    ).toEqual({
      status: 409,
      body: errorBody('different_spot'),
    });
    expect(await changeSpot(guest, spot('kantin'))).toEqual({
      status: 200,
      body: { spotId: spot('kantin') },
    });
    // No new position and the table's time stays.
    expect((await sessionOf(guest))?.expires_at).toEqual(before);
    expect(
      (await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false })).status,
    ).toBe(200);
  });

  it('answers a blocked or closed room as unavailable, never as another spot', async () => {
    const owner = await atSpot(PHONES[0], 'kantin');
    const guest = await atSpot(PHONES[1], 'kutuphane');
    const roomId = await createRoom(owner);
    await sql`
      insert into public.blocks (blocker_id, blocked_id, blocked_alias)
      values (${await userIdOf(owner)}, ${await userIdOf(guest)}, 'Test Alias')
    `;
    expect(
      await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false }),
    ).toEqual({
      status: 409,
      body: errorBody('room_not_available'),
    });
  });

  it('refuses a spot change in a room or with a request out', async () => {
    const owner = await atSpot(PHONES[0], 'kantin');
    const guest = await atSpot(PHONES[1], 'kantin');
    const roomId = await createRoom(owner);
    // The owner's own waiting room.
    expect(await changeSpot(owner, spot('kutuphane'))).toEqual({
      status: 409,
      body: errorBody('in_room'),
    });
    // A pending request.
    expect(
      (await invoke(guest, 'rooms', { action: 'request-join', roomId, profiled: false })).status,
    ).toBe(200);
    expect(await changeSpot(guest, spot('kutuphane'))).toEqual({
      status: 409,
      body: errorBody('in_room'),
    });
    // A declined request looks pending until it expires (rule 5): still refused.
    await sql`update public.join_requests set status = 'declined' where room_id = ${roomId}`;
    expect(await changeSpot(guest, spot('kutuphane'))).toEqual({
      status: 409,
      body: errorBody('in_room'),
    });
    // In the room with both tables.
    await sql`update public.join_requests set status = 'pending' where room_id = ${roomId}`;
    const [request] = await sql`select id from public.join_requests where room_id = ${roomId}`;
    await invoke(owner, 'rooms', { action: 'respond', requestId: request?.id, accept: true });
    expect(await changeSpot(guest, spot('kutuphane'))).toEqual({
      status: 409,
      body: errorBody('in_room'),
    });
    expect((await sessionOf(guest))?.spot_id).toBe(spot('kantin'));
  });

  it('refuses an inactive or foreign spot and a table without one', async () => {
    const client = await atSpot(PHONES[0], 'kantin');
    for (const id of [spot('eski'), spot('bahce', otherCampus)]) {
      expect(await changeSpot(client, id)).toEqual({
        status: 422,
        body: errorBody('spot_invalid'),
      });
    }
    const pointTable = await onboarded(PHONES[1]);
    await checkInAt(pointTable, venue, 'at-anchor');
    expect(await changeSpot(pointTable, spot('kantin'))).toEqual({
      status: 422,
      body: errorBody('spot_invalid'),
    });
    const none = await onboarded(PHONES[2]);
    expect(await changeSpot(none, spot('kantin'))).toEqual({
      status: 409,
      body: errorBody('no_active_table'),
    });
  });

  it('lets a table without a spot from before the campus choose one', async () => {
    const owner = await atSpot(PHONES[0], 'kantin');
    const legacy = await atSpot(PHONES[1], 'kantin');
    await sql`update public.table_sessions set spot_id = null where user_id = ${await userIdOf(legacy)}`;
    const roomId = await createRoom(owner);
    expect((await lobby(legacy)).map((r) => r.room_id)).toEqual([roomId]);
    expect(
      (await invoke(legacy, 'rooms', { action: 'request-join', roomId, profiled: false })).status,
    ).toBe(409);
    expect((await changeSpot(legacy, spot('kantin'))).status).toBe(200);
    expect(
      (await invoke(legacy, 'rooms', { action: 'request-join', roomId, profiled: false })).status,
    ).toBe(200);
  });
});

describe('spots from the seed', () => {
  it('adds a spot through the JSON and the seed alone, keeping ids and retired spots', async () => {
    const added = {
      ...FIXTURE_CAMPUS,
      spots: [...FIXTURE_CAMPUS.spots, { ref: 'spor-salonu', name: 'Spor Salonu', isActive: true }],
    };
    const again = await insertFixtureCampus(sql, added);
    expect(again.venueId).toBe(campus.venueId);
    expect(again.spots.kantin).toBe(spot('kantin'));
    expect(Object.keys(again.spots).sort()).toEqual(
      ['eski', 'kantin', 'kutuphane', 'spor-salonu'].sort(),
    );
    const client = await onboarded(PHONES[0]);
    const res = await checkIn(client, CAMPUS_CENTER, { spotId: again.spots['spor-salonu'] });
    expect(res.status).toBe(200);
    // Re-applying the original JSON leaves the new spot in place.
    await insertFixtureCampus(sql);
    const [row] =
      await sql`select is_active from public.venue_spots where id = ${again.spots['spor-salonu'] ?? ''}`;
    expect(row?.is_active).toBe(true);
  });

  it('lets clients read spots and the boundary, never write them', async () => {
    const client = await onboarded(PHONES[0]);
    const { data } = await client
      .from('venue_spots')
      .select('ref, name')
      .eq('venue_id', campus.venueId);
    expect((data ?? []).map((s) => s.ref)).toContain('kantin');
    const insert = await client.from('venue_spots').insert({
      venue_id: campus.venueId,
      ref: 'sahte',
      name: 'Sahte',
    });
    expect(insert.error?.code).toBe('42501');
    const { data: explore } = await client.rpc('explore_venues', {});
    const row = (explore ?? []).find((v) => v.venue_id === campus.venueId);
    expect(row?.boundary).toEqual(
      FIXTURE_CAMPUS.boundary.map(([lng, lat]) => [expect.closeTo(lng, 6), expect.closeTo(lat, 6)]),
    );
  });
});

describe('locks', () => {
  // The pattern of rooms.test.ts → locks: the spot change holds the table's session only as
  // FOR NO KEY UPDATE, so rows can still reference it.
  it("lets rows reference a table's session while a spot change holds it", async () => {
    const client = await atSpot(PHONES[0], 'kantin');
    const userId = await userIdOf(client);
    const sessionId = (await sessionOf(client))?.id ?? '';
    const other = postgres(dbUrl, { max: 1, onnotice: () => {} });
    try {
      await sql.begin(async (tx) => {
        await tx`select id from public.change_table_spot(${userId}, ${spot('kutuphane')})`;
        const referenced = await other.begin(async (otx) => {
          await otx`set local lock_timeout = '2s'`;
          return otx`select id from public.table_sessions where id = ${sessionId} for key share`;
        });
        expect(referenced).toHaveLength(1);
      });
    } finally {
      await other.end();
    }
  });
});
