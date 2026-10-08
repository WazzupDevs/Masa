import { CONCEPTS, type Concept } from '@shared/rooms.ts';
import { parseGameState } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, useWindowDimensions, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { ChatScreen, ChatScroll } from '@/components/ChatScreen';
import { ChatTopBar } from '@/components/ChatTopBar';
import { IconButton } from '@/components/IconButton';
import { Screen } from '@/components/Screen';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { RoomComposer, RoomMessages, useRoomChat } from '@/features/chat/ChatPanel';
import { useRoomSafety } from '@/features/chat/RoomSafety';
import { useOtherTableOnline } from '@/features/chat/usePresence';
import { useActiveTable } from '@/features/checkin/useActiveTable';
import { GameArea, isGameRunning, type LocalGame, useEndGame } from '@/features/games/GameArea';
import { useFirstGameIntro } from '@/features/games/introSeen';
import { FirstGameIntro } from '@/features/games/FirstGameIntro';
import { useGameSignals } from '@/features/games/gameSignals';
import { GameStage } from '@/features/games/GameStage';
import { TimeUpOverlay } from '@/features/games/TimeUpOverlay';
import { useRoomMemberProfile } from '@/features/profile/queries';
import { RevealPrompt } from '@/features/reveal/RevealPrompt';
import { RevealResult } from '@/features/reveal/RevealResult';
import { IncomingRequest } from '@/features/rooms/IncomingRequest';
import { roomKeys, useRoom } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track, trackOnce } from '@/lib/analytics';
import { roomsApi } from '@/lib/api';
import { useKeepAwakeWhile } from '@/lib/keepAwake';
import { useTheme } from '@/theme/ThemeProvider';
import { NARROW_SCREEN, SPACING } from '@/theme/tokens';

export default function RoomScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const table = useActiveTable();
  const room = useRoom(id);
  const chat = useRoomChat(id);
  // A one-table game (Tabu, Sahtekar) runs on this phone; it starts in GameArea and keeps its place
  // when the room's concept turns to it, so the deck is not dealt twice.
  const [localGame, setLocalGame] = useState<LocalGame | null>(null);
  const endGame = useEndGame(id, () => setLocalGame(null));
  const [chatOpen, setChatOpen] = useState(false);
  // Messages from the other table seen so far; the rest count as unread on the game's chat button.
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null);
  const roomConcept = room.data?.concept;
  const gameRunning =
    !!room.data &&
    isGameRunning(
      (CONCEPTS as readonly unknown[]).includes(roomConcept) ? (roomConcept as Concept) : null,
      room.data.guest_session_id !== null,
      localGame,
    );
  const ownSession = table.data?.id;
  const loaded = chat.messages.data;
  // Each game counts unread messages from its own start: what came before (chat between games)
  // is seen. The chat panel closes when the game ends. Adjusted while rendering (React's "storing
  // information from previous renders"), not in an effect.
  const [wasRunning, setWasRunning] = useState(gameRunning);
  if (wasRunning !== gameRunning) {
    setWasRunning(gameRunning);
    setSeen(null);
    setChatOpen(false);
  } else if (gameRunning && seen === null && loaded) {
    setSeen(new Set(loaded.filter((m) => m.session_id !== ownSession).map((m) => m.id)));
  }

  // While a game runs the screen stays on; "Süre bitti!" comes from the game (docs/SPEC_V3.md
  // §19.2).
  useKeepAwakeWhile(gameRunning);
  const timeUp = useGameSignals((s) => s.timeUp);
  const localProgress = useGameSignals((s) => s.local);
  // Sesli Tabu's intro, once per device, on the first two-table game.
  const intro = useFirstGameIntro();
  const loadIntro = intro.load;
  useEffect(() => loadIntro(), [loadIntro]);

  // "Odayı bitir" is the only way out (docs/SPEC_V3.md §5.5).
  const exit = useMutation({
    mutationFn: roomsApi.end,
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
  // The running game; null is chat (docs/SPEC_V3.md §5.1).
  const concept: Concept | null = (CONCEPTS as readonly unknown[]).includes(r.concept)
    ? (r.concept as Concept)
    : null;
  const hasOtherTable = r.guest_session_id !== null;

  // Room-level events come from one table only, so each room counts once.
  if (!isOwner) trackOnce(`join_accepted:${r.id}`, 'join_accepted', {});

  const title = r.guest_alias ? tr.rooms.withGuest(r.owner_alias, r.guest_alias) : r.owner_alias;
  const topBar = (onClose?: () => void) => (
    <RoomTopBar
      roomId={r.id}
      title={title}
      subtitle={tr.rooms.roomEyebrow(concept)}
      aliases={[r.owner_alias, ...(r.guest_alias ? [r.guest_alias] : [])]}
      guestSessionId={r.guest_session_id}
      hasOtherTable={hasOtherTable}
      onEnd={() => exit.mutate()}
      ending={exit.isPending}
      onClose={onClose}
    />
  );
  const gameArea = (
    <GameArea
      roomId={r.id}
      sessionId={sessionId}
      concept={concept}
      gameState={r.game_state}
      hasGuest={hasOtherTable}
      isOwner={isOwner}
      aliases={{ owner: r.owner_alias, guest: r.guest_alias ?? '' }}
      headcount={table.data?.headcount ?? 0}
      localGame={localGame}
      onLocalGame={setLocalGame}
    />
  );

  if (r.status === 'ending' && r.reveal_ends_at) {
    // A table left (or ended the room) while Tabu ran: the game was stopped (§19.1).
    const stopped = parseGameState(r.game_state);
    if (stopped?.concept === 'tabu' && stopped.phase === 'playing') {
      trackOnce(`game_abandoned:${r.id}:${stopped.gameNo}`, 'game_abandoned', {
        concept: 'tabu',
        turn_no: stopped.turnNo,
        total_turns: stopped.totalTurns,
      });
    }
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

  // The newest message, for following it (ChatScroll): one on its way, else the newest read.
  const newestOut = chat.outbox[chat.outbox.length - 1];
  const newestIn = (chat.messages.data ?? []).at(-1);
  const newest = {
    key: newestOut?.localId ?? newestIn?.id,
    mine: newestOut ? true : newestIn?.session_id === sessionId,
  };

  // A running game takes the whole screen; the chat folds into a button (canvas: Aşama 6 · Oyunlar).
  if (isGameRunning(concept, hasOtherTable, localGame)) {
    const others = (chat.messages.data ?? []).filter((m) => m.session_id !== sessionId);
    const unread = chatOpen || !seen ? 0 : others.filter((m) => !seen.has(m.id)).length;
    const toggleChat = (open: boolean) => {
      setChatOpen(open);
      setSeen(new Set(others.map((m) => m.id)));
    };
    return (
      <GameStage
        title={tr.concepts[concept ?? localGame ?? 'tabu']}
        unread={unread}
        chatOpen={chatOpen}
        onChat={toggleChat}
        onEndGame={() => {
          // A one-table game stopped before its end (§19.1); a two-table one is counted from
          // lastGame in GameArea.
          if (localGame === 'tabu' && localProgress && !localProgress.finished) {
            track('game_abandoned', {
              concept: 'tabu',
              turn_no: localProgress.turnNo,
              total_turns: localProgress.totalTurns,
            });
          }
          endGame.mutate();
        }}
        overlay={
          <TimeUpOverlay
            visible={timeUp !== null}
            detail={timeUp?.detail}
            brand={tr.games.gameBrand(tr.concepts[concept ?? localGame ?? 'tabu'])}
          />
        }
        ending={endGame.isPending}
        endError={endGame.error}
        solo={!hasOtherTable}
        chat={
          <>
            {topBar(() => toggleChat(false))}
            <ChatScroll
              startAtEnd
              newestKey={newest.key}
              newestMine={newest.mine}
              contentContainerStyle={{ padding: SPACING[4], gap: SPACING[2] }}
            >
              <RoomMessages
                chat={chat}
                sessionId={sessionId}
                roomId={r.id}
                guestSessionId={r.guest_session_id}
              />
            </ChatScroll>
            <RoomComposer chat={chat} />
          </>
        }
      >
        {exit.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(exit.error)}
          </Text>
        ) : null}
        {gameArea}
        {hasOtherTable ? <OtherTableStatus roomId={r.id} isOwner={isOwner} /> : null}
        {isOwner ? <IncomingRequest roomId={r.id} ownerSessionId={r.owner_session_id} /> : null}
        <FirstGameIntro
          visible={concept === 'tabu' && hasOtherTable && intro.seen === false}
          onClose={intro.markSeen}
        />
      </GameStage>
    );
  }

  return (
    <ChatScreen
      top={topBar()}
      composer={<RoomComposer chat={chat} />}
      newestKey={newest.key}
      newestMine={newest.mine}
    >
      {exit.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(exit.error)}
        </Text>
      ) : null}
      <View className="mt-4">{gameArea}</View>
      {r.status === 'waiting' && r.visibility === 'open' ? (
        <Card tone="note" className="mt-1">
          <Text variant="fine">{tr.rooms.waitingForGuest}</Text>
        </Card>
      ) : null}
      {hasOtherTable ? <OtherTableStatus roomId={r.id} isOwner={isOwner} /> : null}

      <RoomMessages
        chat={chat}
        sessionId={sessionId}
        roomId={r.id}
        guestSessionId={r.guest_session_id}
      />

      {isOwner ? <IncomingRequest roomId={r.id} ownerSessionId={r.owner_session_id} /> : null}
    </ChatScreen>
  );
}

// The room's top bar (canvas: Aşama 4 · Yenileme): the tables' avatars and names, "Odayı bitir"
// (the only way out, docs/SPEC_V3.md §5.5) and a menu with "Şikayet et" and "Engelle". The avatars
// open the other table's profile only when it joined with its profile, and only while the room runs
// (room_member_profile; docs/SPEC_V2.md §5.4).
function RoomTopBar({
  roomId,
  title,
  subtitle,
  aliases,
  guestSessionId,
  hasOtherTable,
  onEnd,
  ending,
  onClose,
}: {
  roomId: string;
  title: string;
  subtitle: string;
  aliases: readonly string[];
  guestSessionId: string | null;
  hasOtherTable: boolean;
  onEnd: () => void;
  ending: boolean;
  // In the game's chat panel: the back arrow closes the panel.
  onClose?: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const safety = useRoomSafety(roomId);
  const member = useRoomMemberProfile(roomId, guestSessionId);
  const publicId = member.data;
  // On a narrow screen "Odayı bitir" is an icon: the label left the tables' names a letter.
  const { width, fontScale } = useWindowDimensions();
  const narrow = width < NARROW_SCREEN * Math.max(1, fontScale);
  return (
    <>
      <ChatTopBar
        onBack={onClose}
        title={title}
        subtitle={subtitle}
        leading={<TableFaces aliases={aliases} />}
        onPressTitle={
          publicId
            ? () => router.push({ pathname: '/people/[publicId]', params: { publicId } })
            : undefined
        }
        titleAccessibilityLabel={tr.rooms.viewProfile}
        actions={
          <>
            <Button
              variant="danger"
              size="sm"
              testID="end-room"
              label={tr.rooms.end}
              icon={narrow ? 'exit-outline' : undefined}
              iconOnly={narrow}
              onPress={onEnd}
              disabled={ending}
            />
            <IconButton
              icon="ellipsis-horizontal"
              label={tr.friends.more}
              onPress={() => setMenu(true)}
            />
          </>
        }
      />
      <Sheet visible={menu} onClose={() => setMenu(false)} title={tr.friends.more}>
        {hasOtherTable ? <Text variant="fine">{tr.rooms.endHint}</Text> : null}
        <Button
          variant="neutral"
          label={tr.safety.report}
          onPress={() => {
            setMenu(false);
            safety.startReport();
          }}
        />
        {hasOtherTable ? (
          <Button
            variant="neutral"
            label={tr.safety.block}
            onPress={() => {
              setMenu(false);
              safety.confirmBlock();
            }}
          />
        ) : null}
      </Sheet>
      {safety.blockError ? (
        <View style={{ paddingHorizontal: SPACING[5], paddingTop: SPACING[2] }}>
          <Text variant="fine" tone="danger">
            {errorMessage(safety.blockError)}
          </Text>
        </View>
      ) : null}
      {safety.reportForm}
    </>
  );
}

// The tables in the room, the second a little over the first.
function TableFaces({ aliases }: { aliases: readonly string[] }) {
  const { colors, shape } = useTheme();
  return (
    <View className="flex-row">
      {aliases.map((alias, i) => (
        <View
          key={alias}
          style={
            i > 0
              ? {
                  marginLeft: -SPACING[4],
                  borderRadius: shape.radius.pill,
                  borderWidth: shape.stroke.feature,
                  borderColor: colors.canvas,
                  margin: -shape.stroke.feature,
                }
              : undefined
          }
        >
          <Avatar kind="table" alias={alias} size="md" />
        </View>
      ))}
    </View>
  );
}

function OtherTableStatus({ roomId, isOwner }: { roomId: string; isOwner: boolean }) {
  const online = useOtherTableOnline(roomId, isOwner ? 'owner' : 'guest', true);
  return online ? null : (
    <Card tone="note" className="mt-1">
      <Text variant="fine" tone="text" accessibilityLiveRegion="polite">
        {tr.safety.otherOffline}
      </Text>
    </Card>
  );
}
