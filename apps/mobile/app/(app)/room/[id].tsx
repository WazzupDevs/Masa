import type { Concept } from '@shared/rooms.ts';
import { isVoiceTabu, parseGameState } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { RoomSafety } from '@/features/chat/RoomSafety';
import { useOtherTableOnline } from '@/features/chat/usePresence';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { ConceptArea } from '@/features/games/ConceptArea';
import { useRoomMemberProfile } from '@/features/profile/queries';
import { RevealPrompt } from '@/features/reveal/RevealPrompt';
import { RevealResult } from '@/features/reveal/RevealResult';
import { IncomingRequest } from '@/features/rooms/IncomingRequest';
import { roomKeys, useRoom } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { trackOnce } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useTheme } from '@/theme/ThemeProvider';

export default function RoomScreen() {
  const { colors } = useTheme();
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
        <ActivityIndicator className="mt-16" color={colors.muted} />
      </Screen>
    );
  }

  const sessionId = table.data?.id;
  const r = room.data;
  const member =
    r && sessionId && (r.owner_session_id === sessionId || r.guest_session_id === sessionId);
  if (!r || !member) return <Redirect href="/venue" />;
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
      <Redirect href="/venue" />
    );
  }

  const isOwner = r.owner_session_id === sessionId;
  const concept = r.concept as Concept;
  const hasOtherTable = r.guest_session_id !== null;
  const tabuState = parseGameState(r.game_state);

  // Room-level events come from one table only, so each room counts once.
  if (!isOwner) trackOnce(`join_accepted:${r.id}`, 'join_accepted', {});
  if (isOwner && isVoiceTabu(tabuState) && tabuState.phase === 'finished') {
    trackOnce(`game_completed:${r.id}:${tabuState.gameNo}`, 'game_completed', {
      concept: 'tabu',
      mode: 'voice',
      score: tabuState.scores.owner,
    });
  }

  if (r.status === 'ending' && r.reveal_ends_at) {
    return (
      <Screen>
        <ScreenHeader
          eyebrow={tr.rooms.roomEyebrow(concept)}
          title={r.guest_alias ? tr.rooms.withGuest(r.owner_alias, r.guest_alias) : r.owner_alias}
        />
        <RevealPrompt
          roomId={r.id}
          isOwner={isOwner}
          revealEndsAt={r.reveal_ends_at}
          score={null}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader
        eyebrow={tr.rooms.roomEyebrow(concept)}
        title={r.guest_alias ? tr.rooms.withGuest(r.owner_alias, r.guest_alias) : r.owner_alias}
      />

      <ConceptArea
        roomId={r.id}
        concept={concept}
        gameState={r.game_state}
        hasGuest={hasOtherTable}
        isOwner={isOwner}
        aliases={{ owner: r.owner_alias, guest: r.guest_alias ?? '' }}
      />
      {r.status === 'waiting' && r.visibility === 'open' ? (
        <Card tone="note" className="mt-3">
          <Text variant="fine">{tr.rooms.waitingForGuest}</Text>
        </Card>
      ) : null}

      {hasOtherTable ? <OtherTableStatus roomId={r.id} isOwner={isOwner} /> : null}
      {hasOtherTable ? (
        <OtherTableProfile roomId={r.id} guestSessionId={r.guest_session_id} />
      ) : null}

      <ChatPanel roomId={r.id} sessionId={sessionId} />

      <View className="mt-auto gap-3 pt-8">
        <RoomSafety roomId={r.id} hasOtherTable={hasOtherTable} />
        {exit.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(exit.error)}
          </Text>
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
    <Card tone="note" className="mt-3">
      <Text variant="fine" tone="text" accessibilityLiveRegion="polite">
        {tr.safety.otherOffline}
      </Text>
    </Card>
  );
}

// "Profili gör" only when the other table joined with its profile, and only while the room runs
// (room_member_profile; docs/SPEC_V2.md §5.4).
function OtherTableProfile({
  roomId,
  guestSessionId,
}: {
  roomId: string;
  guestSessionId: string | null;
}) {
  const member = useRoomMemberProfile(roomId, guestSessionId);
  const publicId = member.data;
  if (!publicId) return null;
  return (
    <View className="mt-3">
      <Button
        variant="secondary"
        label={tr.rooms.viewProfile}
        onPress={() => router.push({ pathname: '/people/[publicId]', params: { publicId } })}
      />
    </View>
  );
}
