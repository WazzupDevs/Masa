import type { Concept } from '@shared/rooms.ts';
import { parseGameState } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { RoomSafety } from '@/features/chat/RoomSafety';
import { useOtherTableOnline } from '@/features/chat/usePresence';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ConceptArea } from '@/features/games/ConceptArea';
import { RevealPrompt } from '@/features/reveal/RevealPrompt';
import { RevealResult } from '@/features/reveal/RevealResult';
import { IncomingRequest } from '@/features/rooms/IncomingRequest';
import { roomKeys, useRoom } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { trackOnce } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const room = useRoom(id);

  const exit = useMutation({
    mutationFn: (kind: 'leave' | 'end') => (kind === 'leave' ? roomsApi.leave() : roomsApi.end()),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.current });
      void queryClient.invalidateQueries({ queryKey: roomKeys.room(id) });
    },
  });

  if (room.isPending || table.isPending) {
    return (
      <Screen>
        <ActivityIndicator className="mt-16" />
      </Screen>
    );
  }

  const sessionId = table.data?.id;
  const r = room.data;
  const member =
    r && sessionId && (r.owner_session_id === sessionId || r.guest_session_id === sessionId);
  if (!r || !member) return <Redirect href="/" />;
  if (r.status === 'closed') {
    // A two-table room shows its shared result once; otherwise back to the venue.
    return r.reveal_result === 'mutual' || r.reveal_result === 'none' ? (
      <RevealResult
        roomId={r.id}
        isOwner={r.owner_session_id === sessionId}
        result={r.reveal_result}
        token={r.reveal_token}
      />
    ) : (
      <Redirect href="/" />
    );
  }

  const isOwner = r.owner_session_id === sessionId;
  const concept = r.concept as Concept;
  const hasOtherTable = r.guest_session_id !== null;
  const tabuState = parseGameState(r.game_state);

  // Room-level events come from one table only, so each room counts once.
  if (!isOwner) trackOnce(`join_accepted:${r.id}`, 'join_accepted', {});
  if (isOwner && tabuState?.concept === 'tabu' && tabuState.phase === 'finished') {
    trackOnce(`game_completed:${r.id}:${tabuState.gameNo}`, 'game_completed', {
      concept: 'tabu',
      score: tabuState.score,
    });
  }

  if (r.status === 'ending' && r.reveal_ends_at) {
    return (
      <Screen>
        <Text className="text-sm text-neutral-500">{tr.rooms.roomTitle(tr.concepts[concept])}</Text>
        <RevealPrompt
          roomId={r.id}
          revealEndsAt={r.reveal_ends_at}
          score={tabuState?.concept === 'tabu' ? tabuState.score : null}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text className="text-sm text-neutral-500">{tr.rooms.roomTitle(tr.concepts[concept])}</Text>
      <Text className="mt-1 text-2xl font-bold text-black">
        {r.guest_alias ? tr.rooms.withGuest(r.owner_alias, r.guest_alias) : r.owner_alias}
      </Text>

      <ConceptArea
        roomId={r.id}
        concept={concept}
        gameState={r.game_state}
        hasGuest={hasOtherTable}
        sessionId={sessionId}
        isOwner={isOwner}
      />
      {r.status === 'waiting' && r.visibility === 'open' ? (
        <Text className="mt-3 text-center text-sm text-neutral-500">
          {tr.rooms.waitingForGuest}
        </Text>
      ) : null}

      {hasOtherTable ? <OtherTableStatus roomId={r.id} isOwner={isOwner} /> : null}

      <ChatPanel roomId={r.id} sessionId={sessionId} />

      <View className="mt-auto gap-3 pt-8">
        <RoomSafety roomId={r.id} hasOtherTable={hasOtherTable} />
        {exit.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(exit.error)}</Text>
        ) : null}
        <Button
          variant="secondary"
          label={tr.rooms.end}
          onPress={() => exit.mutate('end')}
          disabled={exit.isPending}
        />
        <Button
          variant="secondary"
          label={tr.rooms.leave}
          onPress={() => exit.mutate('leave')}
          disabled={exit.isPending}
        />
      </View>

      {isOwner ? (
        <IncomingRequest roomId={r.id} ownerSessionId={r.owner_session_id} concept={concept} />
      ) : null}
    </Screen>
  );
}

function OtherTableStatus({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const online = useOtherTableOnline(roomId, isOwner ? 'owner' : 'guest', true);
  return online ? null : (
    <Text className="mt-3 text-sm text-amber-700">{tr.safety.otherOffline}</Text>
  );
}
