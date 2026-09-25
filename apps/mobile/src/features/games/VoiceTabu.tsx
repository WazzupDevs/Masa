import {
  type GameState,
  isVoiceTabu,
  type JudgeResult,
  type TableSide,
  type VoiceTabuState,
  voiceWinner,
} from '@shared/tabu.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { TabuCardView } from './TabuCardView';
import { useGameEvents } from './useGameEvents';

type Props = {
  roomId: string;
  state: GameState | null;
  side: TableSide;
  isOwner: boolean;
  aliases: Record<TableSide, string>;
};

// Two-table Tabu, face to face (docs/SPEC_V2.md §8.2). Team = table: the describing table talks,
// the other table sees the same card and judges with Doğru / Tabu / Pas. The server keeps time,
// turns, passes and scores; this screen only shows them and sends the judge's press.
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
              {winner === 'draw'
                ? tr.games.voiceDraw
                : tr.games.voiceWinner(aliases[winner ?? 'owner'])}
            </Text>
          </>
        ) : (
          <Text className="text-center text-base text-neutral-600">
            {state?.concept === 'tabu' && state.phase === 'playing'
              ? tr.games.legacyGame
              : tr.games.voiceIntro}
          </Text>
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

  return <Turn roomId={roomId} state={voice} side={side} aliases={aliases} />;
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

function Turn({
  roomId,
  state,
  side,
  aliases,
}: {
  roomId: string;
  state: VoiceTabuState;
  side: TableSide;
  aliases: Record<TableSide, string>;
}) {
  const queryClient = useQueryClient();
  const now = useNow(250);
  const describing = state.describingTable === side;

  // Every judged card deals a new one: both phones refetch the card on game events.
  const refreshCard = useCallback(
    () => void queryClient.invalidateQueries({ queryKey: ['tabuCard', roomId] }),
    [queryClient, roomId],
  );
  useGameEvents(roomId, refreshCard);
  const card = useQuery({
    queryKey: ['tabuCard', roomId, state.gameNo, state.turnNo],
    queryFn: () => gamesApi.tabuCard(roomId),
  });

  const secondsLeft = Math.max(0, Math.ceil((Date.parse(state.turnEndsAt) - now) / 1000));

  // Any table ends the turn when the countdown reaches zero; the server checks and is idempotent.
  const endedTurn = useRef<number | null>(null);
  useEffect(() => {
    if (secondsLeft === 0 && endedTurn.current !== state.turnNo) {
      endedTurn.current = state.turnNo;
      void gamesApi.tabuEndTurn(roomId);
    }
  }, [secondsLeft, state.turnNo, roomId]);

  const judge = useMutation({
    mutationFn: (result: JudgeResult) => {
      if (!card.data) throw new Error('No card');
      return gamesApi.tabuJudge(roomId, card.data.cardId, result);
    },
    onSettled: refreshCard,
  });
  const passesLeft = state.maxPasses - state.passesUsed;
  const busy = judge.isPending || card.isFetching;

  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text className="text-sm text-neutral-600">
          {tr.games.turn(state.turnNo, state.totalTurns)}
        </Text>
        <Text className="text-sm font-semibold text-black">
          {tr.games.secondsLeft(secondsLeft)}
        </Text>
      </View>
      <Scores
        scores={state.scores}
        aliases={aliases}
        side={side}
        describing={state.describingTable}
      />
      <Text className="rounded-xl bg-white p-3 text-base text-black">
        {describing ? tr.games.voiceDescribe : tr.games.voiceJudge(aliases[state.describingTable])}
      </Text>

      {card.data ? <TabuCardView word={card.data.word} forbidden={card.data.forbidden} /> : null}

      {secondsLeft === 0 ? (
        <Text className="text-sm text-neutral-500">{tr.games.turnOverWait}</Text>
      ) : describing ? (
        <Text className="text-center text-sm text-neutral-500">{tr.games.voiceDescribeHint}</Text>
      ) : (
        <View className="gap-2">
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                label={tr.games.judgeCorrect}
                onPress={() => judge.mutate('correct')}
                disabled={busy}
              />
            </View>
            <View className="flex-1">
              <Button
                variant="danger"
                label={tr.games.judgeTaboo}
                onPress={() => judge.mutate('taboo')}
                disabled={busy}
              />
            </View>
          </View>
          <Button
            variant="secondary"
            label={`${tr.games.pass} · ${tr.games.passesLeft(passesLeft)}`}
            onPress={() => judge.mutate('pass')}
            disabled={busy || passesLeft <= 0}
          />
          {judge.isError ? (
            <Text className="text-sm text-red-600">{errorMessage(judge.error)}</Text>
          ) : null}
        </View>
      )}
      <Text className="text-center text-xs text-neutral-500">{tr.games.cardOnlyHere}</Text>
    </View>
  );
}
