import {
  newSayGame,
  SAY_CONFIG,
  sayAdvance,
  sayBegin,
  sayClaim,
  type SayKind,
  sayObject,
  type SayState,
  sayWinner,
  turnSeconds,
} from '@shared/sayChallenge.ts';
import type { TableSide } from '@shared/tabu.ts';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { track } from '@/lib/analytics';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { TurnReady } from '../TurnReady';
import { PromptCard } from './Say';
import { SayRound } from './SayGame';

type Props = { roomId: string; kind: SayKind };

const TEAMS: Record<TableSide, string> = { owner: tr.say.team('A'), guest: tr.say.team('B') };

// One-table Harf Kapmaca or Şarkıda Geçsin (docs/SPEC_V3.md §20.3–20.4): Takım A and B on one
// phone with the same rules (pure/sayChallenge.ts), objections included; the other team presses
// İtiraz on the same phone. The prompts, one per round, come from harf|sarki/start.
export function LocalSay({ roomId, kind }: Props) {
  const now = useNow(200);
  const [game, setGame] = useState<SayState | null>(null);
  const [prompts, setPrompts] = useState<string[]>([]);
  // The prompt of the round after `game`'s (one per round, from harf|sarki/start).
  const nextFor = (g: SayState) => () => prompts[g.roundNo] ?? '';
  const deal = useMutation({
    mutationFn: () => gamesApi.sayStart(kind, roomId),
    onSuccess: ({ prompts: list }) => {
      setPrompts(list);
      setGame(newSayGame(kind, list[0] ?? '', Date.now()));
    },
  });
  const { mutate: dealNow } = deal;
  const dealt = useRef(false);
  useEffect(() => {
    if (!game && !dealt.current) {
      dealt.current = true;
      dealNow();
    }
  }, [game, dealNow]);

  // The clocks move on while rendering (React's "storing information from previous renders").
  if (game && game.phase === 'playing') {
    if (game.turnPhase === 'running' && game.endsAt !== null && now >= game.endsAt) {
      setGame(sayAdvance(game, nextFor(game), now));
    }
  }

  // Once per finished game.
  const tracked = useRef<SayState | null>(null);
  useEffect(() => {
    if (game?.phase === 'finished' && tracked.current !== game) {
      tracked.current = game;
      track('game_completed', {
        concept: kind,
        mode: 'voice',
        score: game.scores.owner,
        objections:
          2 * SAY_CONFIG[kind].objections - game.objectionsLeft.owner - game.objectionsLeft.guest,
        rounds_lost_by_timeout: game.timeouts,
      });
    }
  }, [game, kind]);

  if (!game) {
    return deal.isError ? (
      <View className="gap-3">
        <Text variant="fine" tone="danger">
          {errorMessage(deal.error)}
        </Text>
        <Button variant="neutral" label={tr.common.retry} onPress={() => dealNow()} />
      </View>
    ) : (
      <Text tone="muted" align="center">
        {tr.games.cardsLoading}
      </Text>
    );
  }

  if (game.phase === 'finished') {
    const winner = sayWinner(game);
    return (
      <View className="gap-3">
        <Card tone="note">
          <Text variant="title" align="center" testID="say-local-result">
            {winner ? tr.games.winner(winner === 'owner' ? 'A' : 'B') : tr.games.draw}
          </Text>
          <Text align="center" className="mt-2">
            {tr.games.scores(game.scores.owner, game.scores.guest)}
          </Text>
        </Card>
        <Button
          testID="say-play-again"
          label={tr.games.playAgain}
          onPress={() => {
            dealt.current = false;
            setGame(null);
          }}
        />
      </View>
    );
  }

  if (game.turnPhase === 'ready') {
    return (
      <View className="gap-3">
        <PromptCard kind={kind === 'harf' ? 'category' : 'word'} prompt={game.prompt} compact />
        <TurnReady
          testID="say-ready"
          describing
          describingAlias={TEAMS[game.turnTable]}
          secondsLeft={SAY_CONFIG[kind].readySeconds}
          totalSeconds={SAY_CONFIG[kind].readySeconds}
          onStart={() => setGame(sayBegin(game, game.turnTable, Date.now()))}
          hint={tr.say.readyHint(turnSeconds(kind, game.roundNo))}
        />
        <Text variant="fine" align="center">
          {tr.say.teamTurn(game.turnTable === 'owner' ? 'A' : 'B')}
        </Text>
      </View>
    );
  }

  return (
    <SayRound
      state={game}
      now={now}
      sides={{
        names: TEAMS,
        mine: null,
        turnText: (side) => tr.say.teamTurn(side === 'owner' ? 'A' : 'B'),
      }}
      onClaim={(letter) =>
        setGame(sayClaim(game, game.turnTable, game.roundNo, game.step, letter, Date.now()))
      }
      onObject={(by) =>
        setGame(
          sayObject(game, by, game.roundNo, game.lastClaim?.step ?? -1, nextFor(game), Date.now()),
        )
      }
    />
  );
}
