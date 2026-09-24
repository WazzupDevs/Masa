import { initialLocalTabu, localTabuReducer } from '@shared/localTabu.ts';
import { TABU } from '@shared/tabu.ts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useReducer } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { TabuCardView } from './TabuCardView';

// One-table Tabu (MVP_SPEC §5.1): the server only hands out the deck; the game runs here. If
// another table joins, the room switches to the two-table game and this unmounts.
export function LocalTabu({ roomId }: { roomId: string }) {
  const deck = useMutation({ mutationFn: () => gamesApi.tabuStart(roomId) });
  const [state, dispatch] = useReducer(localTabuReducer, initialLocalTabu([]));
  const now = useNow(250);

  const { mutate: loadDeck } = deck;
  useEffect(() => loadDeck(), [loadDeck]);
  const cards = deck.data?.mode === 'local' ? deck.data.deck : null;
  useEffect(() => {
    if (cards) dispatch({ type: 'reset', deck: cards });
  }, [cards]);

  const secondsLeft = state.turnEndsAt
    ? Math.max(0, Math.ceil((state.turnEndsAt - now) / 1000))
    : 0;
  const timeUp = state.phase === 'playing' && secondsLeft === 0;
  useEffect(() => {
    if (timeUp) dispatch({ type: 'timeUp' });
  }, [timeUp]);
  const finished = state.phase === 'finished';
  const { A, B } = state.scores;
  useEffect(() => {
    if (finished) track('game_completed', { concept: 'tabu', score: A + B });
  }, [finished, A, B]);

  if (deck.isError) return <Text className="text-sm text-red-600">{errorMessage(deck.error)}</Text>;
  if (!cards || state.deck.length === 0) return <ActivityIndicator />;

  const game = state;
  const card = game.deck[game.cardIndex];

  if (game.phase === 'finished') {
    const { A, B } = game.scores;
    return (
      <View className="items-center gap-4">
        <Text className="text-2xl font-bold text-black">
          {A === B ? tr.games.draw : tr.games.winner(A > B ? 'A' : 'B')}
        </Text>
        <Text className="text-lg text-neutral-700">{tr.games.scores(A, B)}</Text>
        <View className="w-full">
          <Button label={tr.games.playAgain} onPress={() => loadDeck()} />
        </View>
      </View>
    );
  }

  if (game.phase === 'ready' || game.phase === 'between') {
    return (
      <View className="items-center gap-4">
        {game.phase === 'ready' ? (
          <Text className="text-center text-base text-neutral-600">{tr.games.localIntro}</Text>
        ) : null}
        <Text className="text-lg text-neutral-700">
          {tr.games.scores(game.scores.A, game.scores.B)}
        </Text>
        <Text className="text-sm text-neutral-500">
          {tr.games.round(game.round, TABU.localRoundsPerTeam)}
        </Text>
        <View className="w-full">
          <Button
            label={tr.games.startTurn(game.team)}
            onPress={() => dispatch({ type: 'start', now: Date.now() })}
          />
        </View>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row justify-between">
        <Text className="text-base font-semibold text-black">{tr.games.team(game.team)}</Text>
        <Text className="text-base text-neutral-700">{tr.games.secondsLeft(secondsLeft)}</Text>
        <Text className="text-base text-neutral-700">
          {tr.games.scores(game.scores.A, game.scores.B)}
        </Text>
      </View>
      {card ? <TabuCardView word={card.word} forbidden={card.forbidden} /> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button label={tr.games.correct} onPress={() => dispatch({ type: 'correct' })} />
        </View>
        <View className="flex-1">
          <Button
            variant="secondary"
            label={tr.games.pass}
            onPress={() => dispatch({ type: 'pass' })}
          />
        </View>
        <View className="flex-1">
          <Button
            variant="danger"
            label={tr.games.taboo}
            onPress={() => dispatch({ type: 'taboo' })}
          />
        </View>
      </View>
    </View>
  );
}
