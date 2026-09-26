import { initialLocalTabu, localTabuReducer } from '@shared/localTabu.ts';
import { TABU } from '@shared/tabu.ts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useReducer } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';
import { useTheme } from '@/theme/ThemeProvider';

import { ClockPill, TeamScore } from './GameBits';
import { TabuCardView } from './TabuCardView';

// One-table Tabu (MVP_SPEC §5.1): the server only hands out the deck; the game runs here. If
// another table joins, the room switches to the two-table game and this unmounts.
export function LocalTabu({ roomId }: { roomId: string }) {
  const { colors } = useTheme();
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
    if (finished) track('game_completed', { concept: 'tabu', mode: 'voice', score: A + B });
  }, [finished, A, B]);

  if (deck.isError) {
    return (
      <Text variant="fine" tone="danger">
        {errorMessage(deck.error)}
      </Text>
    );
  }
  if (!cards || state.deck.length === 0) return <ActivityIndicator color={colors.muted} />;

  const game = state;
  const card = game.deck[game.cardIndex];

  if (game.phase === 'finished') {
    const { A, B } = game.scores;
    return (
      <View className="items-center gap-4">
        <Text variant="title" align="center">
          {A === B ? tr.games.draw : tr.games.winner(A > B ? 'A' : 'B')}
        </Text>
        <Scores a={A} b={B} active={null} />
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
          <Card>
            <Text>{tr.games.localIntro}</Text>
          </Card>
        ) : null}
        <Scores a={game.scores.A} b={game.scores.B} active={null} />
        <Text variant="eyebrow">{tr.games.round(game.round, TABU.localRoundsPerTeam)}</Text>
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
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="eyebrow">{tr.games.round(game.round, TABU.localRoundsPerTeam)}</Text>
        <ClockPill seconds={secondsLeft} />
      </View>
      <Scores a={game.scores.A} b={game.scores.B} active={game.team} />
      {card ? <TabuCardView word={card.word} forbidden={card.forbidden} /> : null}
      <View className="flex-row gap-2">
        <View className="flex-1">
          <Button
            variant="success"
            label={tr.games.correct}
            onPress={() => dispatch({ type: 'correct' })}
          />
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

// Team A and B of the table; the team on turn is highlighted.
function Scores({ a, b, active }: { a: number; b: number; active: 'A' | 'B' | null }) {
  return (
    <View className="w-full flex-row gap-2.5">
      {(['A', 'B'] as const).map((t) => (
        <TeamScore
          key={t}
          name={tr.games.team(t)}
          note={active === t ? tr.games.describing : ' '}
          score={t === 'A' ? a : b}
          active={active === t}
        />
      ))}
    </View>
  );
}
