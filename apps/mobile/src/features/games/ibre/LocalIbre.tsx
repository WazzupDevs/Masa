import {
  IBRE_CONFIG,
  ibreAdvance,
  ibreAutoLockDue,
  ibreBegin,
  ibreLock,
  type IbreScale,
  ibreSide,
  type IbreState,
  ibreWinner,
  newIbreGame,
  randomTarget,
} from '@shared/ibre.ts';
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
import { NeedleDial, SideChoice, TargetHold } from './Ibre';
import { DialWidth, IbreHeader, RoundReveal } from './IbreGame';

type Props = { roomId: string };

const TEAMS: Record<TableSide, string> = { owner: tr.say.team('A'), guest: tr.say.team('B') };
const LETTER: Record<TableSide, string> = { owner: 'A', guest: 'B' };
const other = (side: TableSide): TableSide => (side === 'owner' ? 'guest' : 'owner');

// The game and the round's target, made on this phone; they change together.
type Local = { game: IbreState; target: number };

// One-table İbre (docs/SPEC_V3.md §20.5): Takım A and B on one phone with the same rules
// (pure/ibre.ts). The describer holds the target out of the team's sight, gives the clue, the team
// moves the needle; then the other team picks a side. The scales come from ibre/start.
export function LocalIbre({ roomId }: Props) {
  const now = useNow(200);
  const [local, setLocal] = useState<Local | null>(null);
  const [scales, setScales] = useState<IbreScale[]>([]);
  const [needle, setNeedle] = useState<{ round: number; value: number }>({ round: 0, value: 50 });
  // The scale of the round after `game`'s (one per round, from ibre/start).
  const nextFor = (g: IbreState) => () => scales[g.roundNo] ?? g.scale;
  const deal = useMutation({
    mutationFn: () => gamesApi.ibreStart(roomId),
    onSuccess: ({ scales: list }) => {
      setScales(list);
      const first = list[0];
      if (first) {
        setLocal({ game: newIbreGame(first, Date.now()), target: randomTarget(Math.random) });
      }
    },
  });
  const { mutate: dealNow } = deal;
  const dealt = useRef(false);
  useEffect(() => {
    if (!local && !dealt.current) {
      dealt.current = true;
      dealNow();
    }
  }, [local, dealNow]);

  // A round ends: the next round's target with it.
  const next = (from: Local, game: IbreState): Local =>
    game.roundNo === from.game.roundNo && game.phase === from.game.phase
      ? { ...from, game }
      : { game, target: randomTarget(Math.random) };

  // The clocks move on while rendering (React's "storing information from previous renders").
  if (local && local.game.phase === 'playing' && local.game.turnPhase !== 'ready') {
    const { game } = local;
    if (game.endsAt !== null && now >= game.endsAt) {
      setLocal(next(local, ibreAdvance(game, local.target, nextFor(game), now)));
    } else if (ibreAutoLockDue(game, now)) {
      // The last 3 seconds: the needle is locked where it stands (docs/SPEC_V3.md §20.5a).
      const at = needle.round === game.roundNo ? needle.value : 50;
      setLocal({ ...local, game: ibreLock(game, game.turnTable, game.roundNo, at, now) });
    }
  }

  // Once per finished game.
  const tracked = useRef<IbreState | null>(null);
  const finished = local?.game.phase === 'finished' ? local.game : null;
  useEffect(() => {
    if (finished && tracked.current !== finished) {
      tracked.current = finished;
      track('game_completed', {
        concept: 'ibre',
        mode: 'voice',
        score: finished.scores.owner,
        bullseyes: finished.bullseyes.owner,
      });
    }
  }, [finished]);

  if (!local) {
    return deal.isError ? (
      <View className="gap-3">
        <Text variant="fine" tone="danger">
          {errorMessage(deal.error)}
        </Text>
        <Button variant="secondary" label={tr.common.retry} onPress={() => dealNow()} />
      </View>
    ) : (
      <Text tone="muted" align="center">
        {tr.games.cardsLoading}
      </Text>
    );
  }

  const { game, target } = local;
  const reveal = game.reveal ? (
    <RoundReveal reveal={game.reveal} guesser={TEAMS[other(game.reveal.table)]} />
  ) : null;

  if (game.phase === 'finished') {
    const winner = ibreWinner(game);
    return (
      <View className="gap-3">
        {reveal}
        <Card tone="note">
          <Text variant="title" align="center" testID="ibre-local-result">
            {winner ? tr.games.winner(LETTER[winner]) : tr.games.draw}
          </Text>
          <Text align="center" className="mt-2">
            {tr.games.scores(game.scores.owner, game.scores.guest)}
          </Text>
        </Card>
        <Button
          testID="ibre-play-again"
          label={tr.games.playAgain}
          onPress={() => {
            dealt.current = false;
            setLocal(null);
          }}
        />
      </View>
    );
  }

  if (game.turnPhase === 'ready') {
    return (
      <View className="gap-3">
        {reveal}
        <TurnReady
          testID="ibre-ready"
          describing
          describingAlias={TEAMS[game.turnTable]}
          secondsLeft={IBRE_CONFIG.readySeconds}
          totalSeconds={IBRE_CONFIG.readySeconds}
          onStart={() => setLocal({ ...local, game: ibreBegin(game, game.turnTable, Date.now()) })}
          hint={tr.ibre.readyHint}
        />
        <Text variant="fine" align="center">
          {tr.ibre.describerTurn(TEAMS[game.turnTable])}
        </Text>
      </View>
    );
  }

  const round = game.roundNo;
  const value = needle.round === round ? needle.value : 50;
  const header = <IbreHeader state={game} now={now} names={TEAMS} mine={null} />;

  if (game.turnPhase === 'running') {
    return (
      <View className="gap-3" testID="ibre-round">
        {header}
        <Text variant="fine" align="center">
          {tr.ibre.clueHint}
        </Text>
        <DialWidth>
          {(w) => (
            <View className="gap-4">
              <TargetHold
                width={w}
                left={game.scale.left}
                right={game.scale.right}
                target={target}
                onHoldStart={() => undefined}
                onHoldEnd={() => undefined}
              />
              <NeedleDial
                width={w}
                left={game.scale.left}
                right={game.scale.right}
                value={value}
                onChange={(v) => setNeedle({ round, value: v })}
              />
            </View>
          )}
        </DialWidth>
        <Button
          testID="ibre-lock"
          size="lg"
          label={tr.ibre.lock}
          onPress={() =>
            setLocal({
              ...local,
              game: ibreLock(game, game.turnTable, round, value, Date.now()),
            })
          }
        />
      </View>
    );
  }

  const guesser = other(game.turnTable);
  return (
    <View className="gap-3" testID="ibre-side-phase">
      {header}
      <DialWidth>
        {(w) => (
          <NeedleDial
            width={w}
            left={game.scale.left}
            right={game.scale.right}
            value={game.needle ?? 50}
            onChange={() => undefined}
            disabled
          />
        )}
      </DialWidth>
      <Text variant="bodyStrong" align="center">
        {tr.ibre.sideTurn(TEAMS[guesser])}
      </Text>
      <SideChoice
        selected={null}
        onSelect={(side) =>
          setLocal(
            next(local, ibreSide(game, guesser, round, side, target, nextFor(game), Date.now())),
          )
        }
      />
      <Text variant="fine" align="center">
        {tr.ibre.sideHint(IBRE_CONFIG.sideSeconds)}
      </Text>
    </View>
  );
}
