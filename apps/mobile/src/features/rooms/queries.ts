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
import { gameTag } from '@shared/tableCard.ts';
import type { Side } from '@shared/teams.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { roomsApi } from '@/lib/api';
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
  phones: (roomId: string) => ['roomPhones', roomId] as const,
  requestProfile: (requestId: string) => ['requestProfile', requestId] as const,
};

// What decides the room's people: a phone joining or leaving a side, a new leader.
function peopleChanged(a: RoomRow | null | undefined, b: RoomRow): boolean {
  return (
    !a ||
    a.owner_session_id !== b.owner_session_id ||
    a.guest_session_id !== b.guest_session_id ||
    a.owner_phones !== b.owner_phones ||
    a.guest_phones !== b.guest_phones
  );
}

// What the table card shows of the table's room (docs/SPEC_V3.md §23.C).
export const TABLE_ROOM_COLUMNS =
  'id, status, visibility, owner_session_id, guest_session_id, owner_alias, guest_alias, owner_headcount, guest_headcount, owner_phones, guest_phones, intent, game_tag';
export type TableRoomRow = Pick<
  RoomRow,
  | 'id'
  | 'status'
  | 'visibility'
  | 'owner_session_id'
  | 'guest_session_id'
  | 'owner_alias'
  | 'guest_alias'
  | 'owner_headcount'
  | 'guest_headcount'
  | 'owner_phones'
  | 'guest_phones'
  | 'intent'
  | 'game_tag'
>;

// The table's latest room, as a leader or a member of a side: RLS lets a phone read only the rooms
// it leads or is in (docs/SPEC_V3.md §22.I), so no filter on the session is needed. A closed room does
// not hold the table (since step 23.3 a two-sided room closes at once, §23.G).
export function useCurrentRoom(sessionId: string | undefined) {
  return useQuery({
    queryKey: roomKeys.current,
    enabled: sessionId !== undefined,
    queryFn: async (): Promise<TableRoomRow | null> => {
      const { data, error } = await supabase
        .from('rooms')
        .select(TABLE_ROOM_COLUMNS)
        .in('status', ['waiting', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
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
    void queryClient.invalidateQueries({ queryKey: roomKeys.phones(roomId) });
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
        const cached = queryClient.getQueryData<RoomRow | null>(roomKeys.room(roomId));
        queryClient.setQueryData(roomKeys.room(roomId), row);
        void queryClient.invalidateQueries({ queryKey: roomKeys.current });
        // The phones are read again only when the room's people changed, not on every move.
        if (peopleChanged(cached, row)) {
          void queryClient.invalidateQueries({ queryKey: roomKeys.phones(roomId) });
        }
      } else reread();
    },
  );

  // Status check (@shared/rooms.ts): every few seconds and when the app comes to the foreground,
  // the few columns that decide what the screen shows; the full row is read again only when they
  // differ, so a check never overwrites a newer row from the channel.
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
        .select('proposer_session_id, proposer_side, concept, expires_at')
        .eq('room_id', roomId)
        .maybeSingle();
      if (error) throw error;
      if (!data || !isConcept(data.concept)) return null;
      const side = data.proposer_side;
      return {
        ...data,
        proposer_side: side === 'owner' || side === 'guest' ? side : null,
        concept: data.concept,
      };
    },
  });
}

// The phones in the room, both sides (docs/SPEC_V3.md §22.I): only for a phone in the room. Read
// again when the room's people change (useRoom).
export type RoomPhone = {
  sessionId: string;
  side: Side;
  alias: string;
  profiled: boolean;
  leader: boolean;
  joinedAt: string;
};

export function useRoomPhones(roomId: string, enabled = true) {
  return useQuery({
    queryKey: roomKeys.phones(roomId),
    enabled,
    queryFn: async (): Promise<RoomPhone[]> => {
      const { data, error } = await supabase.rpc('room_phones', { target_room_id: roomId });
      if (error) throw error;
      return data.flatMap((p) =>
        p.side === 'owner' || p.side === 'guest'
          ? [
              {
                sessionId: p.session_id,
                side: p.side,
                alias: p.alias,
                profiled: p.profiled,
                leader: p.is_leader,
                joinedAt: p.joined_at,
              },
            ]
          : [],
      );
    },
  });
}

// The venue's lobby (docs/SPEC_V3.md §22.C, §23.C): open rooms ("Açık masalar") with the owner's
// phones, whether a phone can still join its side ("Bu masadayım") and the optional game tag, and
// the running rooms ("Süren masalar") with only the two leaders' aliases and each side's phones and
// people. One query, one refetch on lobby_changed.
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
      const args = { target_venue_id: venueId ?? '' };
      const [open, phones, tags, running] = await Promise.all([
        supabase.rpc('venue_lobby', args),
        supabase.rpc('venue_lobby_phones', args),
        supabase.rpc('venue_lobby_tags', args),
        supabase.rpc('venue_running_rooms', args),
      ]);
      if (open.error) throw open.error;
      if (phones.error) throw phones.error;
      if (tags.error) throw tags.error;
      if (running.error) throw running.error;
      const byRoom = new Map(phones.data.map((p) => [p.room_id, p]));
      const tagOf = new Map(tags.data.map((t) => [t.room_id, gameTag(t.game_tag)]));
      return {
        open: open.data.map((room) => ({
          ...room,
          phones: byRoom.get(room.room_id)?.phones ?? 1,
          memberOpen: byRoom.get(room.room_id)?.member_open ?? false,
          gameTag: tagOf.get(room.room_id) ?? null,
        })),
        running: running.data,
      };
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

// Pending requests this leader answers (RLS: "Katıl" to the owner, "Bu masadayım" to the side's
// current leader; docs/SPEC_V3.md §22.I). Null: this phone leads no side.
export function useIncomingRequests(roomId: string, leaderSessionId: string | null) {
  const queryClient = useQueryClient();
  const refetch = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: roomKeys.incoming(roomId) }),
    [queryClient, roomId],
  );
  useBroadcast(
    leaderSessionId ? sessionChannel(leaderSessionId) : null,
    BROADCAST.joinRequest,
    refetch,
  );

  return useQuery({
    queryKey: roomKeys.incoming(roomId),
    enabled: leaderSessionId !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('join_requests')
        .select(
          'id, requester_alias, requester_headcount, requester_profiled, expires_at, as_member',
        )
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

// The request card's profile (docs/SPEC_V3.md §23.E): name, age and photo of a requester who asked
// with its profile, for the leader who can answer, while the request waits (rule 4). Not kept after
// the card closes; the card waits for nothing (the countdown and the buttons are there at once).
export function useRequestProfile(requestId: string | undefined, profiled: boolean) {
  return useQuery({
    queryKey: roomKeys.requestProfile(requestId ?? ''),
    enabled: !!requestId && profiled,
    staleTime: Infinity,
    gcTime: 0,
    retry: 1,
    queryFn: () => roomsApi.requestProfile(requestId ?? ''),
  });
}
