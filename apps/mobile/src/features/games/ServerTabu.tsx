import { checkClue, type TabuState } from '@shared/tabu.ts';
import { prepareTerms } from '@shared/profanity.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { TabuCardView } from './TabuCardView';
import { useGameEvents } from './useGameEvents';

// The profanity list stays on the server; the app warns only about forbidden words.
const NO_TERMS = prepareTerms([]);

type Props = { roomId: string; state: TabuState | null; sessionId: string; isOwner: boolean };

// Two-table Tabu (MVP_SPEC §5.2): shared score, the server decides everything.
export function ServerTabu({ roomId, state, sessionId, isOwner }: Props) {
  const start = useMutation({ mutationFn: () => gamesApi.tabuStart(roomId) });

  if (!state || state.phase === 'finished') {
    return (
      <View className="items-center gap-4">
        {state ? (
          <Text className="text-xl font-bold text-black">{tr.games.finished(state.score)}</Text>
        ) : (
          <Text className="text-center text-base text-neutral-600">{tr.games.serverIntro}</Text>
        )}
        {start.isError ? (
          <Text className="text-sm text-red-600">{errorMessage(start.error)}</Text>
        ) : null}
        {isOwner ? (
          <View className="w-full">
            <Button
              label={state ? tr.games.playAgain : tr.games.startServer}
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

  return <Turn roomId={roomId} state={state} describing={state.describerSessionId === sessionId} />;
}

function Turn({
  roomId,
  state,
  describing,
}: {
  roomId: string;
  state: TabuState;
  describing: boolean;
}) {
  const queryClient = useQueryClient();
  const now = useNow(250);
  const [text, setText] = useState('');
  // A new card is dealt after every correct guess or pass: refetch the card on game events.
  const refreshCard = useCallback(() => {
    if (describing) void queryClient.invalidateQueries({ queryKey: ['tabuCard', roomId] });
  }, [describing, queryClient, roomId]);
  const events = useGameEvents(roomId, refreshCard);

  const card = useQuery({
    queryKey: ['tabuCard', roomId, state.gameNo, state.turnNo],
    enabled: describing,
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

  const send = useMutation({
    mutationFn: async (value: string): Promise<void> => {
      if (describing) await gamesApi.tabuClue(roomId, value);
      else await gamesApi.tabuGuess(roomId, value);
    },
    onSuccess: () => setText(''),
  });
  const pass = useMutation({ mutationFn: () => gamesApi.tabuPass(roomId) });

  const warning =
    describing &&
    card.data &&
    text.trim() !== '' &&
    checkClue(text, card.data, NO_TERMS).ok === false;

  return (
    <View className="gap-3">
      <View className="flex-row justify-between">
        <Text className="text-sm text-neutral-600">
          {tr.games.turn(state.turnNo, state.totalTurns)}
        </Text>
        <Text className="text-sm font-semibold text-black">
          {tr.games.secondsLeft(secondsLeft)}
        </Text>
        <Text className="text-sm text-neutral-600">{tr.games.sharedScore(state.score)}</Text>
      </View>
      <Text className="text-base font-semibold text-black">
        {describing ? tr.games.youDescribe : tr.games.youGuess}
      </Text>

      {describing && card.data ? (
        <TabuCardView word={card.data.word} forbidden={card.data.forbidden} />
      ) : null}

      <View className="max-h-48 gap-1">
        {(events.data ?? [])
          .filter(
            (e) =>
              e.type === 'clue' ||
              e.type === 'guess' ||
              e.type === 'correct' ||
              e.type === 'card_closed',
          )
          .slice(0, 8)
          .map((e) => (
            <Text
              key={e.id}
              className={
                e.type === 'card_closed'
                  ? 'text-sm font-semibold text-neutral-500'
                  : 'text-base text-black'
              }
            >
              {e.type === 'card_closed'
                ? tr.games.cardClosed(
                    String((e.payload as { word?: string }).word ?? ''),
                    tr.games.results[
                      (e.payload as { result?: 'correct' | 'pass' | 'timeout' }).result ?? 'timeout'
                    ],
                  )
                : String((e.payload as { text?: string }).text ?? '')}
            </Text>
          ))}
      </View>

      {secondsLeft === 0 ? (
        <Text className="text-sm text-neutral-500">{tr.games.turnOverWait}</Text>
      ) : (
        <>
          {warning ? <Text className="text-sm text-amber-700">{tr.games.clueWarning}</Text> : null}
          {send.isError ? (
            <Text className="text-sm text-red-600">{errorMessage(send.error)}</Text>
          ) : null}
          <View className="flex-row items-center gap-2">
            <TextInput
              className="h-11 flex-1 rounded-xl border border-neutral-300 px-3 text-base text-black"
              placeholder={describing ? tr.games.cluePlaceholder : tr.games.guessPlaceholder}
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => text.trim() && !warning && send.mutate(text)}
            />
            <Button
              label={tr.games.send}
              onPress={() => send.mutate(text)}
              disabled={!text.trim() || Boolean(warning)}
              loading={send.isPending}
            />
          </View>
          {describing ? (
            <Button
              variant="secondary"
              label={`${tr.games.pass} · ${tr.games.passesLeft(state.maxPasses - state.passesUsed)}`}
              onPress={() => pass.mutate()}
              disabled={state.passesUsed >= state.maxPasses}
              loading={pass.isPending}
            />
          ) : null}
        </>
      )}
    </View>
  );
}
