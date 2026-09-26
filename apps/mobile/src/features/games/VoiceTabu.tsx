import {
  applyMark,
  type GameState,
  isVoiceTabu,
  type Mark,
  type MarkResult,
  optimisticView,
  pendingAfter,
  roleOf,
  type TableSide,
  type VoiceTabuState,
  voiceWinner,
} from '@shared/tabu.ts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING } from '@/theme/tokens';

import { ClockPill, RoleNote, TeamScore } from './GameBits';
import { TabuCardView } from './TabuCardView';

// Height of the covered card, about that of an open one.
const COVER_HEIGHT = 192;

type Props = {
  roomId: string;
  state: GameState | null;
  side: TableSide;
  isOwner: boolean;
  aliases: Record<TableSide, string>;
};

// Two-table Tabu, face to face (docs/SPEC_V2.md §8.2). Team = table. Both phones hold the turn's
// card list; a press moves this phone to the next card at once and is sent in order; the server
// checks it and the room row brings the other phone along. The server's order wins.
export function VoiceTabu({ roomId, state, side, isOwner, aliases }: Props) {
  const start = useMutation({ mutationFn: () => gamesApi.tabuStart(roomId) });
  const voice = isVoiceTabu(state) ? state : null;

  if (!voice || voice.phase === 'finished') {
    const winner = voice ? voiceWinner(voice.scores) : null;
    return (
      <View className="items-center gap-4">
        {voice ? (
          <>
            <Scores scores={voice.scores} aliases={aliases} side={side} />
            <Text variant="title" align="center">
              {winner === 'draw' || winner === null
                ? tr.games.voiceDraw
                : tr.games.voiceWinner(aliases[winner])}
            </Text>
          </>
        ) : (
          <Text tone="muted" align="center">
            {tr.games.voiceIntro}
          </Text>
        )}
        {start.isError ? (
          <Text variant="fine" tone="danger">
            {errorMessage(start.error)}
          </Text>
        ) : null}
        {isOwner ? (
          <View className="w-full">
            <Button
              label={voice ? tr.games.playAgain : tr.games.startServer}
              onPress={() => start.mutate()}
              loading={start.isPending}
            />
          </View>
        ) : (
          <Text variant="fine">{tr.games.waitingForOwner}</Text>
        )}
      </View>
    );
  }

  return <Turn roomId={roomId} server={voice} side={side} aliases={aliases} />;
}

function Scores({
  scores,
  aliases,
  side,
  describing,
}: {
  scores: Record<TableSide, number>;
  aliases: Record<TableSide, string>;
  side: TableSide;
  describing?: TableSide;
}) {
  return (
    <View className="w-full flex-row gap-2.5">
      {(['owner', 'guest'] as const).map((t) => (
        <TeamScore
          key={t}
          name={aliases[t]}
          note={t === side ? tr.games.you : describing === t ? tr.games.describing : ' '}
          score={scores[t]}
          active={describing === t}
        />
      ))}
    </View>
  );
}

// This phone's presses the server has not answered yet, sent one at a time in order.
function usePressQueue(roomId: string) {
  const [pending, setPending] = useState<Mark[]>([]);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  const queue = useRef<Mark[]>([]);

  const pump = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    while (queue.current.length > 0) {
      const next = queue.current[0] as Mark;
      try {
        await gamesApi.tabuMark(roomId, next);
      } catch (err) {
        // Rejected (turn over, no passes left) or lost: the server state stands; drop the rest of
        // this turn's presses, which were built on this one.
        setError(err);
        queue.current = queue.current.filter((m) => m.turnNo !== next.turnNo);
        setPending([...queue.current]);
        continue;
      }
      queue.current = queue.current.slice(1);
      setPending([...queue.current]);
    }
    sending.current = false;
  }, [roomId]);

  const push = (mark: Mark) => {
    setError(null);
    queue.current = [...queue.current, mark];
    setPending([...queue.current]);
    void pump();
  };
  return { pending, push, error };
}

function Turn({
  roomId,
  server,
  side,
  aliases,
}: {
  roomId: string;
  server: VoiceTabuState;
  side: TableSide;
  aliases: Record<TableSide, string>;
}) {
  const { colors, shape } = useTheme();
  const now = useNow(250);
  const role = roleOf(server, side);
  const { pending, push, error } = usePressQueue(roomId);
  const view = optimisticView(server, pendingAfter(server, pending), role, now);

  // The whole turn's list, fetched once when the turn starts.
  const cards = useQuery({
    queryKey: ['tabuTurnCards', roomId, server.gameNo, server.turnNo],
    queryFn: () => gamesApi.tabuTurnCards(roomId),
    staleTime: Infinity,
  });
  const card = cards.data?.turnNo === server.turnNo ? cards.data.cards[view.cardIndex] : undefined;

  // The describing table starts with the card covered, so the phone can be held away from its
  // own team first.
  const [revealedTurn, setRevealedTurn] = useState<number | null>(null);
  const covered = role === 'describer' && revealedTurn !== server.turnNo;

  const secondsLeft = Math.max(0, Math.ceil((Date.parse(server.turnEndsAt) - now) / 1000));

  // Any table ends the turn when the countdown reaches zero; the server checks and is idempotent.
  const endedTurn = useRef<number | null>(null);
  useEffect(() => {
    if (secondsLeft === 0 && endedTurn.current !== server.turnNo) {
      endedTurn.current = server.turnNo;
      void gamesApi.tabuEndTurn(roomId);
    }
  }, [secondsLeft, server.turnNo, roomId]);

  const press = (result: MarkResult) => {
    const mark = { turnNo: view.turnNo, cardIndex: view.cardIndex, result };
    if (applyMark(view, mark, role, now).kind === 'applied') push(mark);
  };
  const passesLeft = view.maxPasses - view.passesUsed;
  const disabled = !card || covered || secondsLeft === 0;

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="eyebrow">{tr.games.turnEyebrow(server.turnNo, server.totalTurns)}</Text>
        <ClockPill seconds={secondsLeft} />
      </View>
      <Scores
        scores={view.scores}
        aliases={aliases}
        side={side}
        describing={view.describingTable}
      />
      <RoleNote
        icon={role === 'describer' ? 'megaphone-outline' : 'shield-checkmark-outline'}
        text={
          role === 'describer'
            ? tr.games.voiceDescribe
            : tr.games.voiceJudge(aliases[view.describingTable])
        }
      />

      {covered ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRevealedTurn(server.turnNo)}
          className="items-center justify-center gap-2"
          style={{
            minHeight: COVER_HEIGHT,
            padding: SPACING[6],
            borderRadius: shape.radius.lg,
            backgroundColor: colors.accent,
            boxShadow: shape.shadow.card,
          }}
        >
          <Ionicons name="eye-outline" size={ICON.xl} color={colors.onAccent} />
          <Text variant="title" tone="onAccent" align="center">
            {tr.games.tapToReveal}
          </Text>
          <Text variant="fine" tone="onAccent" align="center">
            {tr.games.hideFromTeam}
          </Text>
        </Pressable>
      ) : card ? (
        <TabuCardView word={card.word} forbidden={card.forbidden} />
      ) : (
        <Text variant="fine" align="center" tone={cards.isError ? 'danger' : 'muted'}>
          {cards.isError ? errorMessage(cards.error) : tr.games.cardsLoading}
        </Text>
      )}

      {secondsLeft === 0 ? (
        <Text variant="fine" align="center">
          {tr.games.turnOverWait}
        </Text>
      ) : (
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              variant="success"
              size="lg"
              icon="checkmark"
              label={tr.games.correct}
              detail={tr.games.correctPoints}
              onPress={() => press('correct')}
              disabled={disabled}
            />
          </View>
          <View className="flex-1">
            {role === 'judge' ? (
              <Button
                variant="danger"
                size="lg"
                icon="close"
                label={tr.games.taboo}
                detail={tr.games.tabooPoints}
                onPress={() => press('taboo')}
                disabled={disabled}
              />
            ) : (
              <Button
                variant="secondary"
                size="lg"
                icon="play-skip-forward-outline"
                label={tr.games.pass}
                detail={tr.games.passDetail(passesLeft)}
                accessibilityLabel={`${tr.games.pass}, ${tr.games.passesLeft(passesLeft)}`}
                onPress={() => press('pass')}
                disabled={disabled || passesLeft <= 0}
              />
            )}
          </View>
        </View>
      )}
      {error ? (
        <Text variant="fine" tone="danger">
          {errorMessage(error)}
        </Text>
      ) : null}
      <Text variant="fine" align="center">
        {tr.games.cardOnlyHere}
      </Text>
    </View>
  );
}
