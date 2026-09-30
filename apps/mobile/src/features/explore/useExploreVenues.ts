import { EVENT_WINDOW_DAYS, isActivityBucket } from '@shared/explore.ts';
import type { LngLat } from '@shared/geo.ts';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ExploreEvent = { title: string; startsAt: string; endsAt: string };

export type ExploreVenue = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  bucket: 'calm' | 'lively' | 'buzzing';
  // Every running or upcoming event within the window, earliest first; the list and the map show
  // the first (docs/SPEC_V3.md §4.4).
  events: ExploreEvent[];
  event: ExploreEvent | null;
  // The campus boundary's outer ring, [lng, lat]; null for a venue checked by its point.
  boundary: LngLat[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toEvents(value: unknown): ExploreEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((e: unknown) =>
    isRecord(e) &&
    typeof e.title === 'string' &&
    typeof e.startsAt === 'string' &&
    typeof e.endsAt === 'string'
      ? [{ title: e.title, startsAt: e.startsAt, endsAt: e.endsAt }]
      : [],
  );
}

function toRing(value: unknown): LngLat[] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const ring = value.filter(
    (p: unknown): p is LngLat =>
      Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number',
  );
  return ring.length === value.length ? ring.map((p) => [p[0], p[1]] as LngLat) : null;
}

// Keşfet data: buckets refresh every 5 minutes on the server, so a minute of staleness is fine.
export function useExploreVenues() {
  return useQuery({
    queryKey: ['exploreVenues'],
    staleTime: 60_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<ExploreVenue[]> => {
      const { data, error } = await supabase.rpc('explore_venues', {
        event_days: EVENT_WINDOW_DAYS,
      });
      if (error) throw error;
      return data.map((v) => {
        const events = toEvents(v.events);
        return {
          id: v.venue_id,
          name: v.name,
          district: v.district,
          lat: v.lat,
          lng: v.lng,
          bucket: isActivityBucket(v.bucket) ? v.bucket : 'calm',
          events,
          event: events[0] ?? null,
          boundary: toRing(v.boundary),
        };
      });
    },
  });
}

export function useExploreVenue(id: string) {
  const venues = useExploreVenues();
  return { ...venues, venue: venues.data?.find((v) => v.id === id) ?? null };
}
