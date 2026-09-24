// Overpass API → content/venues-pilot.json. Pure: the network call lives in fetch-venues.ts.
import type { VenueRecord, VenuesFile } from '../seed/content.ts';

export const PILOT = { city: 'İstanbul', district: 'Beylikdüzü' } as const;
export const AMENITIES = ['cafe', 'hookah_lounge'] as const;
export const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';
export const SOURCE = 'OpenStreetMap Overpass API';

export function buildQuery(district: string = PILOT.district): string {
  return [
    '[out:json][timeout:90];',
    `area["boundary"="administrative"]["admin_level"="6"]["name"="${district}"]->.district;`,
    `nwr["amenity"~"^(${AMENITIES.join('|')})$"](area.district);`,
    'out center tags;',
  ].join('\n');
}

type OverpassElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

function isElement(value: unknown): value is OverpassElement {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    (e.type === 'node' || e.type === 'way' || e.type === 'relation') && typeof e.id === 'number'
  );
}

// Keeps named cafes and hookah lounges with a position; ways/relations use their center.
// `previous` carries manual edits (isActive: false) over from the last reviewed file.
export function toVenuesFile(
  overpass: unknown,
  fetchedAt: string,
  previous: VenuesFile | null,
): VenuesFile {
  const elements =
    typeof overpass === 'object' && overpass !== null && 'elements' in overpass
      ? (overpass as { elements: unknown }).elements
      : null;
  if (!Array.isArray(elements)) throw new Error('Unexpected Overpass response: no elements');

  const inactive = new Set(
    (previous?.venues ?? []).filter((v) => !v.isActive).map((v) => v.sourceRef),
  );

  const venues: VenueRecord[] = [];
  for (const element of elements.filter(isElement)) {
    const name = element.tags?.name?.trim();
    const amenity = element.tags?.amenity;
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || !amenity || lat === undefined || lng === undefined) continue;
    if (!(AMENITIES as readonly string[]).includes(amenity)) continue;

    const sourceRef = `${element.type}/${element.id}`;
    venues.push({
      name,
      city: PILOT.city,
      district: PILOT.district,
      lat,
      lng,
      source: 'osm',
      sourceRef,
      amenity,
      isActive: !inactive.has(sourceRef),
    });
  }

  venues.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef, 'en'));
  return { attribution: ATTRIBUTION, source: SOURCE, fetchedAt, venues };
}
