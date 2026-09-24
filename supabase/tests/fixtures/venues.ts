// Fake venues for tests, at computed distances from a fixed anchor in Beylikdüzü. Not real
// places; real venue data comes from content/venues-pilot.json.
import type { Sql } from 'postgres';

export const ANCHOR = { lat: 41.0, lng: 28.64 } as const;

const EARTH_RADIUS_M = 6_371_008.8;

// Spherical "destination point". PostGIS measures on the WGS84 spheroid, so distances differ by
// up to ~0.3 % (about 1 m at 300 m); fixtures keep at least 10 m away from the 300 m limit.
export function offset(
  from: { lat: number; lng: number },
  distanceM: number,
  bearingDeg: number,
): { lat: number; lng: number } {
  const rad = Math.PI / 180;
  const d = distanceM / EARTH_RADIUS_M;
  const b = bearingDeg * rad;
  const lat1 = from.lat * rad;
  const lng1 = from.lng * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return { lat: lat2 / rad, lng: lng2 / rad };
}

type FixtureVenue = {
  key: string;
  name: string;
  distanceM: number;
  bearingDeg: number;
  isActive: boolean;
};

export const FIXTURE_VENUES: readonly FixtureVenue[] = [
  { key: 'at-anchor', name: 'Test Kafe Çapa', distanceM: 0, bearingDeg: 0, isActive: true },
  { key: 'near', name: 'Test Kafe Yakın', distanceM: 120, bearingDeg: 45, isActive: true },
  { key: 'mid', name: 'Test Nargile Orta', distanceM: 250, bearingDeg: 180, isActive: true },
  { key: 'edge-in', name: 'Test Kafe Sınır İçi', distanceM: 290, bearingDeg: 270, isActive: true },
  { key: 'edge-out', name: 'Test Kafe Sınır Dışı', distanceM: 310, bearingDeg: 90, isActive: true },
  { key: 'far', name: 'Test Kafe Uzak', distanceM: 600, bearingDeg: 0, isActive: true },
  { key: 'very-far', name: 'Test Kafe Çok Uzak', distanceM: 2000, bearingDeg: 135, isActive: true },
  { key: 'inactive', name: 'Test Kafe Kapalı', distanceM: 50, bearingDeg: 300, isActive: false },
];

export const FIXTURE_SOURCE = 'test-fixture';

// Inserts the fixture venues and returns their ids by key.
export async function insertFixtureVenues(sql: Sql): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const v of FIXTURE_VENUES) {
    const p = offset(ANCHOR, v.distanceM, v.bearingDeg);
    const [row] = await sql<{ id: string }[]>`
      insert into public.venues (name, city, district, location, source, source_ref, is_active)
      values (
        ${v.name}, 'İstanbul', 'Beylikdüzü',
        extensions.st_setsrid(extensions.st_makepoint(${p.lng}, ${p.lat}), 4326)::extensions.geography,
        ${FIXTURE_SOURCE}, ${v.key}, ${v.isActive}
      )
      returning id
    `;
    if (!row) throw new Error(`fixture ${v.key} not inserted`);
    ids[v.key] = row.id;
  }
  return ids;
}

export async function deleteFixtureVenues(sql: Sql): Promise<void> {
  await sql`delete from public.venues where source = ${FIXTURE_SOURCE}`;
}
