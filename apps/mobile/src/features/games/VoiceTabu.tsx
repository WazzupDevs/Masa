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
import { Pressable, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { TabuCardView } from './TabuCardView';

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
            <Text className="text-center text-xl font-bold text-black">
              {winner === 'draw' || winner === null
                ? tr.games.voiceDraw
                : tr.games.voiceWinner(aliases[winner])}
            </Text>
          </>
        ) : (
          <Text className="text-center text-base text-neutral-600">{tr.games.voiceIntro}</Text>
        )}
        {start.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(start.error)}</Text>
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
          <Text className="text-sm text-neutral-500">{tr.games.waitingForOwner}</Text>
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
    <View className="w-full flex-row gap-2">
      {(['owner', 'guest'] as const).map((t) => (
        <View
          key={t}
          className={`flex-1 rounded-xl border-2 bg-white p-3 ${describing === t ? 'border-black' : 'border-transparent'}`}
        >
          <Text className="text-sm font-semibold text-black" numberOfLines={1}>
            {aliases[t]}
          </Text>
          <Text className="text-xs text-neutral-500">
            {t === side ? tr.games.you : describing === t ? tr.games.describing : ' '}
          </Text>
          <Text className="mt-1 text-3xl font-bold text-black">{scores[t]}</Text>
        </View>
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
      <View className="flex-row justify-between">
        <Text className="text-sm text-neutral-600">
          {tr.games.turn(server.turnNo, server.totalTurns)}
        </Text>
        <Text className="text-sm font-semibold text-black">
          {tr.games.secondsLeft(secondsLeft)}
        </Text>
      </View>
      <Scores
        scores={view.scores}
        aliases={aliases}
        side={side}
        describing={view.describingTable}
      />
      <Text className="rounded-xl bg-white p-3 text-base text-black">
        {role === 'describer'
          ? tr.games.voiceDescribe
          : tr.games.voiceJudge(aliases[view.describingTable])}
      </Text>

      {covered ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setRevealedTurn(server.turnNo)}
          className="min-h-48 items-center justify-center gap-2 rounded-2xl bg-black p-6"
        >
          <Text className="text-xl font-bold text-white">{tr.games.tapToReveal}</Text>
          <Text className="text-center text-sm text-neutral-300">{tr.games.hideFromTeam}</Text>
        </Pressable>
      ) : card ? (
        <TabuCardView word={card.word} forbidden={card.forbidden} />
      ) : (
        <Text className="text-center text-sm text-neutral-500">
          {cards.isError ? errorMessage(cards.error) : tr.games.cardsLoading}
        </Text>
      )}

      {secondsLeft === 0 ? (
        <Text className="text-sm text-neutral-500">{tr.games.turnOverWait}</Text>
      ) : (
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Button
              label={tr.games.judgeCorrect}
              onPress={() => press('correct')}
              disabled={disabled}
            />
          </View>
          <View className="flex-1">
            {role === 'judge' ? (
              <Button
                variant="danger"
                label={tr.games.judgeTaboo}
                onPress={() => press('taboo')}
                disabled={disabled}
              />
            ) : (
              <Button
                variant="secondary"
                label={`${tr.games.pass} · ${passesLeft}`}
                onPress={() => press('pass')}
                disabled={disabled || passesLeft <= 0}
              />
            )}
          </View>
        </View>
      )}
      {error ? <Text className="text-sm text-red-600">{errorMessage(error)}</Text> : null}
      <Text className="text-center text-xs text-neutral-500">{tr.games.cardOnlyHere}</Text>
    </View>
  );
}
