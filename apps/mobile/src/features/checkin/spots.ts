import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export type VenueSpot = { id: string; ref: string; name: string };

export const venueSpotsQueryKey = (venueId: string | undefined) => ['venueSpots', venueId] as const;

// The venue's active spots in their order; empty for a venue without spots (docs/SPEC_V3.md §4.3).
// Public like the venue itself; no count of tables per spot exists anywhere.
export function useVenueSpots(venueId: string | undefined) {
  return useQuery({
    queryKey: venueSpotsQueryKey(venueId),
    enabled: venueId !== undefined,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VenueSpot[]> => {
      const { data, error } = await supabase
        .from('venue_spots')
        .select('id, ref, name')
        .eq('venue_id', venueId ?? '')
        .eq('is_active', true)
        .order('sort')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}
