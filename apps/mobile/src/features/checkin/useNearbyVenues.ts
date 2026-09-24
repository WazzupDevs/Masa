import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { Position } from './draft';

export function useNearbyVenues(position: Position | null) {
  return useQuery({
    // The position stays out of the cache key and is dropped when the screen unmounts.
    queryKey: ['nearbyVenues'],
    enabled: position !== null,
    gcTime: 0,
    queryFn: async () => {
      if (!position) return [];
      const { data, error } = await supabase.rpc('nearby_venues', {
        lat: position.lat,
        lng: position.lng,
      });
      if (error) throw error;
      return data;
    },
  });
}
