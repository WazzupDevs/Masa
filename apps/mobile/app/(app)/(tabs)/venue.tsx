import { CONCEPTS, type Concept, type Intent, isIntent } from '@shared/rooms.ts';
import { tableState } from '@shared/tableCard.ts';
import { roomSeat } from '@shared/teams.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, type ScrollView, View } from 'react-native';

import { Button } from '@/components/Button';
import { ListRow } from '@/components/ListRow';
import { LiveDot } from '@/components/LiveDot';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Text } from '@/components/Text';
import { Loader } from '@/components/Loader';
import { useVenueSpots } from '@/features/checkin/spots';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { Lobby } from '@/features/rooms/Lobby';
import { OpenLobbySheet } from '@/features/rooms/OpenLobbySheet';
import { useOpenedTables } from '@/features/rooms/openedTables';
import { useCurrentRoom, useRoom, useRoomPhones } from '@/features/rooms/queries';
import { TableCard } from '@/features/rooms/TableCard';
import { useCreateSolo } from '@/features/rooms/useCreateSolo';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { sessionDurationMinutes } from '@shared/analytics.ts';

import { trackOnce } from '@/lib/analytics';
import { callLeave } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useReduceMotion } from '@/lib/useReduceMotion';
import { FEEL_ERROR } from '@/lib/hapticMoments';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, TOUCH } from '@/theme/tokens';

// The venue chat row's live dot beats at a calm pace.
const VENUE_CHAT_BEAT_MS = 1600;

type LobbySheet = { intent: Intent | null; gameTag: Concept | null };

function endSession(tableId: string, startedAt: string) {
  trackOnce(`session_ended:${tableId}`, 'session_ended', {
    duration_min: sessionDurationMinutes(startedAt, Date.now()),
  });
}

function isConcept(value: unknown): value is Concept {
  return (CONCEPTS as readonly unknown[]).includes(value);
}

// The table's venue, the home screen (docs/SPEC_V3.md §23.C): the table card with its state, the
// venue chat and the lobby. Without an active table it sends the user to Keşfet. Nothing sends the
// table to its room any more: the card's "Masaya git" does (canvas: Faz 3 · 23.1 Masa ve lobi).
// Aktiviteler's "Bu oyunla lobiye aç" lands here with the game (`lobbyGame`, `lobbyIntent`) and
// opens "Masanı lobiye aç" with them.
export default function VenueScreen() {
  const { colors, shape } = useTheme();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const currentRoom = useCurrentRoom(table.data?.id);
  const spots = useVenueSpots(table.data?.venue_id);
  const solo = useCreateSolo();
  const venueHasSpots = (spots.data ?? []).length > 0;
  const now = useNow(30_000);
  const params = useLocalSearchParams<{ lobbyGame?: string; lobbyIntent?: string }>();
  const [sheet, setSheet] = useState<LobbySheet | null>(null);
  const scroll = useRef<ScrollView>(null);
  const reduceMotion = useReduceMotion();

  const leave = useMutation({
    meta: FEEL_ERROR,
    mutationFn: callLeave,
    onSuccess: () => {
      if (table.data) endSession(table.data.id, table.data.created_at);
      return queryClient.invalidateQueries();
    },
  });

  const expiresAt = table.data ? Date.parse(table.data.expires_at) : null;
  const expired = expiresAt !== null && expiresAt <= now;

  const tableId = table.data?.id;
  const tableStartedAt = table.data?.created_at;
  useEffect(() => {
    if (!expired) return;
    if (tableId && tableStartedAt) endSession(tableId, tableStartedAt);
    void queryClient.invalidateQueries({ queryKey: ['activeTable'] });
  }, [expired, queryClient, tableId, tableStartedAt]);

  // "Bu oyunla lobiye aç" from Aktiviteler: the sheet opens once with the game (adjusted while
  // rendering), then the params go so that the next time opens it again.
  const { lobbyGame, lobbyIntent } = params;
  const asked = isConcept(lobbyGame) ? `${lobbyGame}:${lobbyIntent ?? ''}` : null;
  const [handled, setHandled] = useState<string | null>(null);
  if (asked !== handled) {
    setHandled(asked);
    if (asked && isConcept(lobbyGame)) {
      setSheet({ intent: isIntent(lobbyIntent) ? lobbyIntent : null, gameTag: lobbyGame });
    }
  }
  useEffect(() => {
    if (asked) router.setParams({ lobbyGame: undefined, lobbyIntent: undefined });
  }, [asked]);

  const room = currentRoom.data ?? null;
  const leads =
    !!room && !!tableId && [room.owner_session_id, room.guest_session_id].includes(tableId);
  // A member's side is only in room_phones (docs/SPEC_V3.md §22.B).
  const phones = useRoomPhones(room?.id ?? '', !!room && !leads);
  // "Kabul edildi …" / "… geliyor" until this phone opens the merged table once (openedTables).
  const openedIds = useOpenedTables((s) => s.ids);
  const loadOpened = useOpenedTables((s) => s.load);
  useEffect(() => loadOpened(), [loadOpened]);

  if (table.isPending) {
    return (
      <Screen edges={['top']}>
        <View className="mt-16 items-center">
          <Loader />
        </View>
      </Screen>
    );
  }

  if (!table.data || expired || expiresAt === null) {
    return <Redirect href="/explore" />;
  }

  const seat = room ? roomSeat(room, phones.data, table.data.id) : null;
  const state = tableState(room, seat?.leader ?? false);
  const minutesLeft = Math.max(0, Math.ceil((expiresAt - now) / 60_000));

  function confirmLeave() {
    Alert.alert(tr.venue.leaveConfirmTitle, tr.venue.leaveConfirmBody, [
      { text: tr.common.cancel, style: 'cancel' },
      { text: tr.venue.leaveConfirm, style: 'destructive', onPress: () => leave.mutate() },
    ]);
  }

  return (
    <Screen edges={['top']} scrollRef={scroll}>
      {/* The room's changes reach the card while it is on screen (Realtime and the status check). */}
      {room ? <RoomWatch roomId={room.id} /> : null}
      {/* Aşama 8 · Saha: no bell here; leaving the table is the small red button on the right. */}
      <ScreenHeader
        eyebrow={tr.venue.here}
        eyebrowIcon="location-outline"
        title={table.data.venue?.name ?? ''}
        trailing={
          <Button
            size="sm"
            variant="danger"
            testID="venue-leave"
            label={tr.venue.leave}
            onPress={confirmLeave}
            loading={leave.isPending}
          />
        }
      />
      {leave.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(leave.error)}
        </Text>
      ) : null}
      <TableCard
        table={table.data}
        room={room}
        state={state}
        seat={seat}
        minutesLeft={minutesLeft}
        venueHasSpots={venueHasSpots}
        // Unknown until read: the plain "Birleşti" rather than a line that may be gone a moment later.
        opened={openedIds === null || (!!room && openedIds.includes(room.id))}
      />
      {state === 'off' ? (
        // Side by side: the venue chat row stays above the floating tab bar on small phones.
        <View className="mt-5 flex-row gap-3">
          <View className="flex-1">
            <Button
              tight
              testID="lobby-open"
              label={tr.rooms.create}
              onPress={() => setSheet({ intent: null, gameTag: null })}
            />
          </View>
          <View className="flex-1">
            <Button
              variant="secondary"
              tight
              testID="play-with-table"
              label={tr.rooms.playWithTable}
              onPress={() => solo.mutate()}
              loading={solo.isPending}
            />
          </View>
        </View>
      ) : null}
      {solo.isError ? (
        <Text variant="fine" tone="danger" className="mt-2">
          {errorMessage(solo.error)}
        </Text>
      ) : null}
      <View className="mt-4">
        <ListRow
          card
          testID="venue-chat-open"
          title={tr.venueChat.open}
          meta={tr.venueChat.title(table.data.venue?.name ?? '')}
          onPress={() => router.push('/venue-chat')}
          trailing={<LiveDot tone="success" periodMs={VENUE_CHAT_BEAT_MS} />}
          leading={
            <View
              className="items-center justify-center"
              style={{
                width: TOUCH.button,
                height: TOUCH.button,
                borderRadius: shape.radius.pill,
                backgroundColor: colors.signal,
              }}
            >
              <Ionicons name="chatbubbles-outline" size={ICON.lg} color={colors.onSignal} />
            </View>
          }
        />
      </View>

      <Lobby
        venueId={table.data.venue_id}
        sessionId={table.data.id}
        alias={table.data.alias}
        since={table.data.created_at}
        mySpotId={table.data.spot_id}
        venueHasSpots={venueHasSpots}
        state={state}
      />
      {sheet && state === 'off' ? (
        <OpenLobbySheet
          onClose={() => setSheet(null)}
          // Opened from further down the screen, the card's new "Lobide açık" is scrolled away.
          onOpened={() => scroll.current?.scrollTo({ y: 0, animated: !reduceMotion })}
          alias={table.data.alias}
          venueId={table.data.venue_id}
          intent={sheet.intent}
          gameTag={sheet.gameTag}
        />
      ) : null}
    </Screen>
  );
}

// Keeps the table's room live while the venue screen shows its card: its row's changes re-read the
// table's current room (useRoom).
function RoomWatch({ roomId }: { roomId: string }) {
  useRoom(roomId);
  return null;
}
