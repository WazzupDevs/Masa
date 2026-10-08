import { SAY_CONFIG, type SayKind, type SayState } from '@shared/sayChallenge.ts';
import { mayObject, turnSeconds } from '@shared/sayChallenge.ts';
import type { TableSide } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { ClockPill, TeamScore } from '../GameBits';
import { TurnReady } from '../TurnReady';
import {
  LetterBoard,
  ObjectButton,
  ObjectionResult,
  ObjectionWindow,
  PromptCard,
  SaidButton,
} from './Say';

// How long the last round's result stays over the next round.
const RESULT_MS = 2500;

export type SaySides = {
  // The names on the score bars and in "Sıra …": the tables' aliases, or Takım A and B.
  names: Record<TableSide, string>;
  // The side this phone plays (two tables); null on one phone, which plays both.
  mine: TableSide | null;
  // "Sıra sizde", "Sıra … masasında", "Sıra Takım A'de".
  turnText: (turn: TableSide) => string;
};

// The running round, shared by the two-table and the one-table game (docs/SPEC_V3.md §20.3–20.4;
// canvas: Aşama 7 · Harf Kapmaca, Şarkıda Geçsin): the clock, both scores, the prompt, the board or
// "Söyledik" for the table whose turn it is, and "İtiraz" with the window for the other one.
export function SayRound({
  state,
  now,
  sides,
  onClaim,
  onObject,
  busy,
  error,
}: {
  state: SayState;
  now: number;
  sides: SaySides;
  onClaim: (letter: string | null) => void;
  onObject: (by: TableSide) => void;
  busy?: boolean;
  error?: unknown;
}) {
  const turn = state.turnTable;
  const myTurn = sides.mine === null || sides.mine === turn;
  const objector: TableSide = sides.mine ?? (turn === 'owner' ? 'guest' : 'owner');
  const canObject = mayObject(state, objector, now);
  const secondsLeft = Math.max(0, Math.ceil(((state.endsAt ?? now) - now) / 1000));
  const result = useRoundResult(state, now);

  return (
    <View className="gap-3" testID="say-round">
      <View className="flex-row items-center justify-between">
        <Text variant="overline" tone="muted">
          {tr.say.round(state.roundNo, state.totalRounds)}
        </Text>
        <ClockPill seconds={secondsLeft} />
      </View>
      <View className="flex-row gap-2.5">
        {(['owner', 'guest'] as const).map((side) => (
          // Straight in the row: TeamScore fills its half (a wrapper collapsed it to a strip).
          <TeamScore
            key={side}
            name={sides.names[side]}
            note={
              side === sides.mine
                ? `${tr.games.you} · ${tr.say.objectionsShort(state.objectionsLeft[side])}`
                : tr.say.objectionsShort(state.objectionsLeft[side])
            }
            score={state.scores[side]}
            active={side === turn}
          />
        ))}
      </View>
      {result}
      <PromptCard
        kind={state.kind === 'harf' ? 'category' : 'word'}
        prompt={state.prompt}
        line={state.kind === 'sarki' ? tr.say.sayLine : undefined}
        compact={state.kind === 'harf'}
      />
      <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite" testID="say-turn">
        {sides.turnText(turn)}
      </Text>
      {state.kind === 'harf' ? (
        <>
          <LetterBoard
            letters={state.letters}
            onPick={(letter) => onClaim(letter)}
            disabled={!myTurn || busy}
          />
          {myTurn ? (
            <Text variant="fine" align="center">
              {tr.say.pickLetter}
            </Text>
          ) : null}
        </>
      ) : myTurn ? (
        <SaidButton onPress={() => onClaim(null)} disabled={busy} />
      ) : null}
      {canObject ? (
        <View className="gap-2.5">
          <ObjectionWindow
            remainingMs={(state.objectionEndsAt ?? now) - now}
            totalMs={SAY_CONFIG[state.kind].objectionSeconds * 1000}
            left={state.objectionsLeft[objector]}
          />
          <ObjectButton
            left={state.objectionsLeft[objector]}
            onPress={() => onObject(objector)}
            disabled={busy}
          />
        </View>
      ) : null}
      {error ? (
        <Text variant="fine" tone="danger">
          {errorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}

// The last round's result, for a moment after it ended: "İtiraz!" with what it changed, or the
// clock or the full board.
function useRoundResult(state: SayState, now: number) {
  const last = state.lastRound;
  const key = last ? `${last.roundNo}:${last.reason}:${last.winner ?? ''}` : null;
  const [seen, setSeen] = useState<{ key: string | null; at: number }>({ key, at: 0 });
  if (seen.key !== key) setSeen({ key, at: now });
  if (!last || now - seen.at > RESULT_MS || seen.at === 0) return null;
  if (last.reason === 'objection' && last.winner) {
    return <ObjectionResult detail={`${tr.say.object}: +1`} />;
  }
  return (
    <Text variant="fine" align="center" testID="say-round-result">
      {last.reason === 'lines' ? tr.say.roundNoPoint : tr.say.roundEnd[last.reason]}
    </Text>
  );
}

type Props = {
  roomId: string;
  kind: SayKind;
  state: SayState | null;
  side: TableSide;
  aliases: Record<TableSide, string>;
};

// Two-table Harf Kapmaca or Şarkıda Geçsin: the server keeps the turn, the clock, the window and
// the points. Başla on the starting table (either table after readyEndsAt); when a clock runs out
// either phone moves the game on (harf|sarki/advance, idempotent).
export function SayGame({ roomId, kind, state, side, aliases }: Props) {
  const now = useNow(200);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
  const begin = useMutation({
    mutationFn: () => gamesApi.sayBegin(kind, roomId),
    onSettled: refresh,
  });
  const advance = useMutation({
    mutationFn: () => gamesApi.sayAdvance(kind, roomId),
    onSettled: refresh,
  });
  const claim = useMutation({
    mutationFn: (v: { round: number; step: number; letter: string | null }) =>
      gamesApi.sayClaim(kind, roomId, v.round, v.step, v.letter),
    onSettled: refresh,
  });
  const object = useMutation({
    mutationFn: (v: { round: number; step: number }) =>
      gamesApi.sayObject(kind, roomId, v.round, v.step),
    onSettled: refresh,
  });

  // Once per clock: Başla after readyEndsAt, advance after endsAt.
  const { mutate: beginNow } = begin;
  const { mutate: advanceNow } = advance;
  const fired = useRef<string | null>(null);
  const clock = state?.turnPhase === 'ready' ? state.readyEndsAt : (state?.endsAt ?? null);
  const clockKey = state ? `${state.roundNo}:${state.step}:${state.turnPhase}:${clock}` : '';
  useEffect(() => {
    if (!state || clock === null || now < clock || fired.current === clockKey) return;
    fired.current = clockKey;
    if (state.turnPhase === 'ready') beginNow();
    else advanceNow();
  }, [now, clock, clockKey, state, beginNow, advanceNow]);

  if (!state) {
    return (
      <Text tone="muted" align="center">
        {tr.activities[kind].body}
      </Text>
    );
  }

  if (state.turnPhase === 'ready') {
    const last = state.lastRound;
    const total = SAY_CONFIG[kind].readySeconds;
    return (
      <View className="gap-3">
        <PromptCard kind={kind === 'harf' ? 'category' : 'word'} prompt={state.prompt} compact />
        <TurnReady
          testID="say-ready"
          summary={
            last?.winner
              ? {
                  eyebrow: tr.games.turnDone(last.roundNo),
                  alias: aliases[last.winner],
                  title: tr.say.roundWon(aliases[last.winner], last.reason),
                  points: '+1',
                  stats: [],
                }
              : undefined
          }
          describing={state.turnTable === side}
          describingAlias={aliases[state.turnTable]}
          secondsLeft={Math.max(0, Math.ceil(((state.readyEndsAt ?? now) - now) / 1000))}
          totalSeconds={total}
          onStart={() => begin.mutate()}
          starting={begin.isPending}
          hint={tr.say.readyHint(turnSeconds(kind, state.roundNo))}
          waitingHint={tr.say.readyWaitingHint}
        />
      </View>
    );
  }

  return (
    <SayRound
      state={state}
      now={now}
      sides={{
        names: aliases,
        mine: side,
        turnText: (turn) => (turn === side ? tr.say.yourTurn : tr.say.theirTurn(aliases[turn])),
      }}
      onClaim={(letter) => claim.mutate({ round: state.roundNo, step: state.step, letter })}
      onObject={() =>
        state.lastClaim && object.mutate({ round: state.roundNo, step: state.lastClaim.step })
      }
      busy={claim.isPending || object.isPending}
      error={claim.error ?? object.error}
    />
  );
}
