import { useQuery } from '@tanstack/react-query';

import { callLocationMode } from '@/lib/api';

// Whether the server skips the location check (CHECKIN_SKIP_LOCATION, dev project only). On the
// pilot, or when the question fails, false: the app warns and the server refuses as before.
export function useSkipLocation(): boolean {
  const query = useQuery({
    queryKey: ['checkinLocationMode'],
    staleTime: 5 * 60_000,
    queryFn: async () => (await callLocationMode()).skipLocation,
  });
  return query.data === true;
}
