import {
  applyMark,
  type GameState,
  isVoiceTabu,
  type Mark,
  type MarkResult,
  mayBeginTurn,
  optimisticView,
  pendingAfter,
  roleOf,
  TABU,
  type TableSide,
  type VoiceTabuState,
  voiceWinner,
} from '@shared/tabu.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING } from '@/theme/tokens';

import { ClockPill, RoleNote, TeamScore } from './GameBits';
import { TabuCardView } from './TabuCardView';
import { tabuStats, TurnReady } from './TurnReady';
import { useTurnFeedback } from './useTurnFeedback';

// Height of the covered card, about that of an open one.
const COVER_HEIGHT = 192;

type Props = {
  roomId: string;
  state: GameState | null;
  side: TableSide;
  aliases: Record<TableSide, string>;
};

// Two-table Tabu, face to face (docs/SPEC_V2.md §8.2, docs/SPEC_V3.md §6). Refereed: team = table,
// both phones hold the turn's card list and the other table judges. Cooperative (a one-person
// table): one team score, only the describing phone holds the list and presses all three; the
// guessing phone never asks for it. A press moves this phone to the next card at once and is sent
// in order; the server checks it and the room row brings the other phone along. The server's order
// wins.
// A game starts only from an accepted proposal and, when it ends, the room returns to chat with the
// result kept as lastGame (docs/SPEC_V3.md §5.3); this shows the running game only.
export function VoiceTabu({ roomId, state, side, aliases }: Props) {
  const voice = isVoiceTabu(state) ? state : null;
  if (!voice || voice.phase !== 'playing') {
    return (
      <Text tone="muted" align="center">
        {tr.games.voiceIntro}
      </Text>
    );
  }
  if (voice.turnPhase === 'ready') {
    return <ReadyTurn roomId={roomId} server={voice} side={side} aliases={aliases} />;
  }
  return <Turn roomId={roomId} server={voice} side={side} aliases={aliases} />;
}

// Between turns (docs/SPEC_V3.md §19.1, canvas: Aşama 6 · Oyunlar → Tur hazır): the last turn's
// summary; "Başla" on the describing table, "… hazırlanıyor" and the countdown on the other one.
// When the countdown runs out either phone starts the turn (the server checks the time, and a
// second call changes nothing).
function ReadyTurn({
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
  const now = useNow(250);
  const queryClient = useQueryClient();
  const role = roleOf(server, side);
  const readyEndsAt = server.readyEndsAt ?? new Date(now).toISOString();
  const secondsLeft = Math.max(0, Math.ceil((Date.parse(readyEndsAt) - now) / 1000));
  const begin = useMutation({
    mutationFn: () => gamesApi.tabuBeginTurn(roomId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) }),
  });

  const { mutate } = begin;
  const autoStarted = useRef<number | null>(null);
  useEffect(() => {
    if (mayBeginTurn('judge', readyEndsAt, now) && autoStarted.current !== server.turnNo) {
      autoStarted.current = server.turnNo;
      mutate();
    }
  }, [now, readyEndsAt, server.turnNo, mutate]);

  const last = server.lastTurn;
  return (
    <View className="gap-3">
      <TurnReady
        testID="turn-ready"
        summary={
          last
            ? {
                eyebrow: tr.games.turnDone(last.turnNo),
                alias: aliases[last.describingTable],
                title: tr.games.turnSummaryTitle(aliases[last.describingTable]),
                points: tr.games.signedPoints(last.score),
                stats: tabuStats(last.correct, last.taboo, last.pass),
              }
            : undefined
        }
        describing={role === 'describer'}
        describingAlias={aliases[server.describingTable]}
        secondsLeft={secondsLeft}
        totalSeconds={TABU.readySeconds}
        onStart={() => mutate()}
        starting={begin.isPending}
      />
      {begin.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(begin.error)}
        </Text>
      ) : null}
    </View>
  );
}

// The last game's result in the chat room: both scores and the winner.
export function VoiceTabuResult({
  scores,
  side,
  aliases,
}: {
  scores: Record<TableSide, number>;
  side: TableSide;
  aliases: Record<TableSide, string>;
}) {
  const winner = voiceWinner(scores);
  return (
    <View className="items-center gap-3">
      <Scores scores={scores} aliases={aliases} side={side} />
      <Text variant="heading" align="center">
        {winner === 'draw' ? tr.games.voiceDraw : tr.games.voiceWinner(aliases[winner])}
      </Text>
    </View>
  );
}

function Scores({
  scores,
  aliases,
  side,
  describing,
}: {
  scores: VoiceTabuState['scores'];
  aliases: Record<TableSide, string>;
  side: TableSide;
  describing?: TableSide;
}) {
  if ('team' in scores) {
    return (
      <View className="w-full flex-row gap-2.5">
        <TeamScore name={tr.games.teamScore} note=" " score={scores.team} active />
      </View>
    );
  }
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

  // The whole turn's list, fetched once when the turn starts. A cooperative guessing table never
  // asks: the server would refuse it (not_describer), and the card must not reach this phone.
  const guessing = role === 'guesser';
  const cards = useQuery({
    queryKey: ['tabuTurnCards', roomId, server.gameNo, server.turnNo],
    queryFn: () => gamesApi.tabuTurnCards(roomId),
    staleTime: Infinity,
    enabled: !guessing,
  });
  const card = cards.data?.turnNo === server.turnNo ? cards.data.cards[view.cardIndex] : undefined;

  // The describing table starts with the card covered, so the phone can be held away from its
  // own team first.
  const [revealedTurn, setRevealedTurn] = useState<number | null>(null);
  const covered = role === 'describer' && revealedTurn !== server.turnNo;

  const secondsLeft = server.turnEndsAt
    ? Math.max(0, Math.ceil((Date.parse(server.turnEndsAt) - now) / 1000))
    : 0;
  // The last 5 seconds and the end: vibration and "Süre bitti!" with this turn's points
  // (docs/SPEC_V3.md §19.2). The turn's points: the describing side's score now less what it had
  // when this phone first saw the turn.
  const turnKey = `${roomId}:${server.gameNo}:${server.turnNo}`;
  const sideScore = 'team' in view.scores ? view.scores.team : view.scores[view.describingTable];
  const [turnStart, setTurnStart] = useState({ key: turnKey, score: sideScore });
  if (turnStart.key !== turnKey) setTurnStart({ key: turnKey, score: sideScore });
  useTurnFeedback(
    turnKey,
    secondsLeft,
    tr.games.turnPointsLine(aliases[server.describingTable], sideScore - turnStart.score),
  );

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
        icon={
          role === 'describer'
            ? 'megaphone-outline'
            : role === 'guesser'
              ? 'ear-outline'
              : 'shield-checkmark-outline'
        }
        text={
          role === 'describer'
            ? server.mode === 'cooperative'
              ? tr.games.coopDescribe
              : tr.games.voiceDescribe
            : role === 'guesser'
              ? tr.games.coopGuess(aliases[view.describingTable])
              : tr.games.voiceJudge(aliases[view.describingTable])
        }
      />

      {guessing ? (
        <Text variant="fine" align="center" testID="tabu-guessing">
          {tr.games.coopCardHidden}
        </Text>
      ) : covered ? (
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
        <TabuCardView testID="tabu-card" word={card.word} forbidden={card.forbidden} />
      ) : (
        <Text variant="fine" align="center" tone={cards.isError ? 'danger' : 'muted'}>
          {cards.isError ? errorMessage(cards.error) : tr.games.cardsLoading}
        </Text>
      )}

      {secondsLeft === 0 ? (
        <Text variant="fine" align="center">
          {tr.games.turnOverWait}
        </Text>
      ) : guessing ? null : server.mode === 'cooperative' ? (
        <View className="flex-row gap-2">
          {/* Three in a row (canvas: Tabu iş birliği): no icons, the points under each label. */}
          <View className="flex-1">
            <Button
              variant="success"
              testID="tabu-correct"
              size="lg"
              stack
              label={tr.games.correct}
              detail={tr.games.correctPoints}
              onPress={() => press('correct')}
              disabled={disabled}
            />
          </View>
          <View className="flex-1">
            <Button
              variant="secondary"
              testID="tabu-pass"
              size="lg"
              stack
              label={tr.games.pass}
              detail={tr.games.passDetail(passesLeft)}
              accessibilityLabel={`${tr.games.pass}, ${tr.games.passesLeft(passesLeft)}`}
              onPress={() => press('pass')}
              disabled={disabled || passesLeft <= 0}
            />
          </View>
          <View className="flex-1">
            <Button
              variant="danger"
              testID="tabu-taboo"
              size="lg"
              stack
              label={tr.games.taboo}
              detail={tr.games.tabooPoints}
              onPress={() => press('taboo')}
              disabled={disabled}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row gap-2.5">
          <View className="flex-1">
            <Button
              variant="success"
              testID="tabu-correct"
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
                testID="tabu-taboo"
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
                testID="tabu-pass"
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
        {server.mode === 'cooperative' ? tr.games.coopIntro : tr.games.cardOnlyHere}
      </Text>
    </View>
  );
}
