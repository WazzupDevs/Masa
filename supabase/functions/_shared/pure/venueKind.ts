// What a venue is (docs/SPEC_V3.md §18.1): Keşfet's map pins and the list show it. A cafe is a point
// with the 300 m radius; a campus has a boundary. Content sets it per file (venues-pilot and
// venues-test: cafe, venues-campus: campus) and the seed validates it.
export const VENUE_KINDS = ['cafe', 'campus'] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export function isVenueKind(value: unknown): value is VenueKind {
  return (VENUE_KINDS as readonly unknown[]).includes(value);
}
