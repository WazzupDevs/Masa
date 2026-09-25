import type { Database } from '@shared/database.ts';
import { BROADCAST, type RequesterStatus, sessionChannel, venueChannel } from '@shared/rooms.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { privateChannel, useChannel } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';

import { useBroadcast } from './useBroadcast';

type RoomRow = Database['public']['Tables']['rooms']['Row'];

export const roomKeys = {
  current: ['currentRoom'] as const,
  lobby: (venueId: string) => ['lobby', venueId] as const,
  myRequest: ['myRequest'] as const,
  incoming: (roomId: string) => ['incomingRequests', roomId] as const,
  room: (roomId: string) => ['room', roomId] as const,
};

// The open room the table is in, as owner or guest (RLS: members only). An 'ending' room does
// not hold the table: a table that answered "Hayır" goes on at once (MVP_SPEC §4.6).
export function useCurrentRoom(sessionId: string | undefined) {
  return useQuery({
    queryKey: roomKeys.current,
    enabled: sessionId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('id')
        .in('status', ['waiting', 'active'])
        .or(`owner_session_id.eq.${sessionId},guest_session_id.eq.${sessionId}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRoom(roomId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: roomKeys.room(roomId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Postgres Changes on this room (RLS applies). The new row is used as it arrives, without a
  // second round trip (the other table's Tabu press shows up at once); a delete or an empty
  // payload refetches. The table's current room is refetched too: a room that left
  // 'waiting'/'active' must not send the home screen back into it from cache.
  useChannel<RoomRow | null>(
    `room:${roomId}`,
    (emit) => ({
      channel: privateChannel(`room:${roomId}`).on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload: { new?: Partial<RoomRow> }) =>
          emit(payload.new && payload.new.id === roomId ? (payload.new as RoomRow) : null),
      ),
    }),
    (row) => {
      if (row) queryClient.setQueryData(roomKeys.room(roomId), row);
      else void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
      void queryClient.invalidateQueries({ queryKey: roomKeys.current });
    },
  );

  return query;
}

export function useLobby(venueId: string | undefined) {
  const queryClient = useQueryClient();
  const refetch = useCallback(() => {
    if (venueId) void queryClient.invalidateQueries({ queryKey: roomKeys.lobby(venueId) });
  }, [queryClient, venueId]);
  useBroadcast(venueId ? venueChannel(venueId) : null, BROADCAST.lobbyChanged, refetch);

  return useQuery({
    queryKey: roomKeys.lobby(venueId ?? ''),
    enabled: venueId !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('venue_lobby', { target_venue_id: venueId ?? '' });
      if (error) throw error;
      return data;
    },
  });
}

// The table's latest join request, as the requester may see it.
export function useMyRequest(sessionId: string | undefined, since: string | undefined) {
  const queryClient = useQueryClient();
  const refetch = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: roomKeys.myRequest });
    void queryClient.invalidateQueries({ queryKey: roomKeys.current });
  }, [queryClient]);
  useBroadcast(sessionId ? sessionChannel(sessionId) : null, BROADCAST.joinAccepted, refetch);

  return useQuery({
    queryKey: roomKeys.myRequest,
    enabled: since !== undefined,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('my_join_requests')
        .select('id, room_id, status, expires_at')
        .gte('created_at', since ?? '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      // View columns are nullable in the generated types; rows always have them.
      if (!data?.id || !data.room_id || !data.status || !data.expires_at) return null;
      return {
        id: data.id,
        roomId: data.room_id,
        status: data.status as RequesterStatus,
        expiresAt: data.expires_at,
      };
    },
  });
}

// Pending requests to the owner's room.
export function useIncomingRequests(roomId: string, ownerSessionId: string | null) {
  const queryClient = useQueryClient();
  const refetch = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: roomKeys.incoming(roomId) }),
    [queryClient, roomId],
  );
  useBroadcast(
    ownerSessionId ? sessionChannel(ownerSessionId) : null,
    BROADCAST.joinRequest,
    refetch,
  );

  return useQuery({
    queryKey: roomKeys.incoming(roomId),
    enabled: ownerSessionId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('join_requests')
        .select('id, requester_alias, requester_headcount, requester_profiled, expires_at')
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}
