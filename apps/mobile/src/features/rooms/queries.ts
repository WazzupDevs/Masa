import type { Database } from '@shared/database.ts';
import {
  BROADCAST,
  CONCEPTS,
  type Concept,
  type GameProposal,
  type RequesterStatus,
  ROOM_CHECK_COLUMNS,
  ROOM_CHECK_SECONDS,
  roomCheckDiffers,
  sessionChannel,
  venueChannel,
} from '@shared/rooms.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { privateChannel, useChannel } from '@/lib/realtime';
import { supabase } from '@/lib/supabase';

import { useBroadcast } from './useBroadcast';

type RoomRow = Database['public']['Tables']['rooms']['Row'];

function isConcept(value: unknown): value is Concept {
  return (CONCEPTS as readonly unknown[]).includes(value);
}

export const roomKeys = {
  current: ['currentRoom'] as const,
  lobby: (venueId: string) => ['lobby', venueId] as const,
  myRequest: ['myRequest'] as const,
  incoming: (roomId: string) => ['incomingRequests', roomId] as const,
  room: (roomId: string) => ['room', roomId] as const,
  proposal: (roomId: string) => ['gameProposal', roomId] as const,
  roomCheck: (roomId: string) => ['roomCheck', roomId] as const,
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

  const reread = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
    void queryClient.invalidateQueries({ queryKey: roomKeys.current });
    void queryClient.invalidateQueries({ queryKey: roomKeys.proposal(roomId) });
  }, [queryClient, roomId]);

  // Postgres Changes on this room (RLS applies). The new row is used as it arrives, without a
  // second round trip (the other table's Tabu press shows up at once); a delete or an empty
  // payload refetches. The table's current room is refetched too: a room that left
  // 'waiting'/'active' must not send the home screen back into it from cache.
  // Realtime delivers a change only while the channel is subscribed and never replays it, so every
  // (re)subscribe (first join, reconnect after the background or a network drop) re-reads the room.
  useChannel<RoomRow | null>(
    `room:${roomId}`,
    (emit) => ({
      channel: privateChannel(`room:${roomId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
          (payload: { new?: Partial<RoomRow> }) =>
            emit(payload.new && payload.new.id === roomId ? (payload.new as RoomRow) : null),
        )
        // A game proposal made, answered or expired (docs/SPEC_V3.md §5.3): re-read it.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'game_proposals', filter: `room_id=eq.${roomId}` },
          () => emit(null),
        ),
      onStatus: (status) => {
        if (status === 'SUBSCRIBED') emit(null);
      },
    }),
    (row) => {
      if (row) {
        queryClient.setQueryData(roomKeys.room(roomId), row);
        void queryClient.invalidateQueries({ queryKey: roomKeys.current });
      } else reread();
    },
  );

  // Status check (@shared/rooms.ts): every few seconds and when the app comes to the foreground,
  // the few columns that decide what the screen shows; the full row is read again only when they
  // differ, so a check never overwrites a newer row from the channel. During the reveal window the
  // row does not change until reveal_ends_at (rule 5), so the check shows nothing early either.
  useQuery({
    queryKey: roomKeys.roomCheck(roomId),
    enabled: query.isSuccess,
    refetchInterval: ROOM_CHECK_SECONDS * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select(ROOM_CHECK_COLUMNS)
        .eq('id', roomId)
        .maybeSingle();
      if (error) throw error;
      if (roomCheckDiffers(queryClient.getQueryData<RoomRow | null>(roomKeys.room(roomId)), data)) {
        reread();
      }
      return data;
    },
  });

  return query;
}

// The room's open game proposal, if any (both tables read it; RLS). The room channel re-reads it
// on every change; the screen treats one past expires_at as gone.
export function useGameProposal(roomId: string) {
  return useQuery({
    queryKey: roomKeys.proposal(roomId),
    refetchInterval: ROOM_CHECK_SECONDS * 1000,
    queryFn: async (): Promise<GameProposal | null> => {
      const { data, error } = await supabase
        .from('game_proposals')
        .select('proposer_session_id, concept, expires_at')
        .eq('room_id', roomId)
        .maybeSingle();
      if (error) throw error;
      if (!data || !isConcept(data.concept)) return null;
      return { ...data, concept: data.concept };
    },
  });
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
