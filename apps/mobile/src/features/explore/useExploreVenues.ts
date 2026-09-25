import { EVENT_WINDOW_DAYS, isActivityBucket } from '@shared/explore.ts';
import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type ExploreVenue = {
  id: string;
  name: string;
  district: string;
  lat: number;
  lng: number;
  bucket: 'calm' | 'lively' | 'buzzing';
  event: { title: string; startsAt: string; endsAt: string } | null;
};

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
      return data.map((v) => ({
        id: v.venue_id,
        name: v.name,
        district: v.district,
        lat: v.lat,
        lng: v.lng,
        bucket: isActivityBucket(v.bucket) ? v.bucket : 'calm',
        event:
          v.event_title && v.event_starts_at && v.event_ends_at
            ? { title: v.event_title, startsAt: v.event_starts_at, endsAt: v.event_ends_at }
            : null,
      }));
    },
  });
}

export function useExploreVenue(id: string) {
  const venues = useExploreVenues();
  return { ...venues, venue: venues.data?.find((v) => v.id === id) ?? null };
}
