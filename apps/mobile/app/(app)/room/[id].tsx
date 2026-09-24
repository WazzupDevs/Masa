import type { Concept } from '@shared/rooms.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { RoomSafety } from '@/features/chat/RoomSafety';
import { useOtherTableOnline } from '@/features/chat/usePresence';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { IncomingRequest } from '@/features/rooms/IncomingRequest';
import { roomKeys, useRoom } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
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
  if (!r || !member || r.status === 'closed') return <Redirect href="/" />;

  const isOwner = r.owner_session_id === sessionId;
  const concept = r.concept as Concept;
  const hasOtherTable = r.guest_session_id !== null;

  return (
    <Screen>
      <Text className="text-sm text-neutral-500">{tr.rooms.roomTitle(tr.concepts[concept])}</Text>
      <Text className="mt-1 text-2xl font-bold text-black">
        {r.guest_alias ? tr.rooms.withGuest(r.owner_alias, r.guest_alias) : r.owner_alias}
      </Text>

      <View className="mt-6 min-h-48 items-center justify-center rounded-2xl bg-neutral-100 p-6">
        <Text className="text-center text-base text-neutral-500">{tr.rooms.conceptSoon}</Text>
        {r.status === 'waiting' && r.visibility === 'open' ? (
          <Text className="mt-3 text-center text-sm text-neutral-500">
            {tr.rooms.waitingForGuest}
          </Text>
        ) : null}
      </View>

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
