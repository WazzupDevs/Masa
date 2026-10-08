import {
  IBRE_CONFIG,
  ibreAutoLockDue,
  type IbreReveal,
  type IbreSide,
  type IbreState,
} from '@shared/ibre.ts';
import type { TableSide } from '@shared/tabu.ts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { ClockPill, TeamScore } from '../GameBits';
import { TurnReady } from '../TurnReady';
import { Dial, NeedleDial, NeedleReveal, SideChoice, TargetHold } from './Ibre';

// The dials' widest; a phone narrower than this gets its own width (measured, not assumed).
const DIAL_MAX = 360;

// The dials take the width their column really has: measured on layout, then drawn.
export function DialWidth({ children }: { children: (width: number) => ReactNode }) {
  const [width, setWidth] = useState(0);
  return (
    <View
      onLayout={(e) => setWidth(Math.min(DIAL_MAX, Math.floor(e.nativeEvent.layout.width)))}
      testID="ibre-dial-area"
    >
      {width > 0 ? children(width) : null}
    </View>
  );
}

// A round's reveal (canvas: İbrenin açılışı): the bands, the needle, the points and the side guess.
export function RoundReveal({
  reveal,
  guesser,
  brand,
}: {
  reveal: IbreReveal;
  // The other table's alias, or Takım A / B.
  guesser: string;
  brand?: string;
}) {
  return (
    <DialWidth>
      {(w) => (
        <NeedleReveal
          width={w}
          left={reveal.scale.left}
          right={reveal.scale.right}
          target={reveal.target}
          needle={reveal.needle}
          points={reveal.band}
          detail={tr.ibre.revealDetail(
            reveal.target,
            reveal.needle,
            guesser,
            reveal.side,
            reveal.sidePoint,
          )}
          brand={brand}
        />
      )}
    </DialWidth>
  );
}

const other = (side: TableSide): TableSide => (side === 'owner' ? 'guest' : 'owner');

// The round's header: where it is, the clock, both scores.
export function IbreHeader({
  state,
  now,
  names,
  mine,
}: {
  state: IbreState;
  now: number;
  names: Record<TableSide, string>;
  mine: TableSide | null;
}) {
  const secondsLeft = Math.max(0, Math.ceil(((state.endsAt ?? now) - now) / 1000));
  return (
    <>
      <View className="flex-row items-center justify-between">
        <Text variant="overline" tone="muted">
          {tr.ibre.round(state.roundNo, state.totalRounds)}
        </Text>
        <ClockPill seconds={secondsLeft} />
      </View>
      <View className="flex-row gap-2.5">
        {(['owner', 'guest'] as const).map((side) => (
          // Straight in the row: TeamScore fills its half (a wrapper collapsed it to a strip).
          <TeamScore
            key={side}
            name={names[side]}
            note={side === mine ? tr.games.you : ''}
            score={state.scores[side]}
            active={side === state.turnTable}
          />
        ))}
      </View>
    </>
  );
}

type Props = {
  roomId: string;
  state: IbreState | null;
  side: TableSide;
  aliases: Record<TableSide, string>;
};

// Two-table İbre (docs/SPEC_V3.md §20.5): the server keeps the target, the clocks and the points.
// Başla on the describing table; when a clock runs out either phone moves the game on
// (ibre/advance, idempotent; the ready clock starts the turn from readyEndsAt).
export function IbreGame({ roomId, state, side, aliases }: Props) {
  const now = useNow(200);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });
  const begin = useMutation({ mutationFn: () => gamesApi.ibreBegin(roomId), onSettled: refresh });
  const advance = useMutation({
    mutationFn: () => gamesApi.ibreAdvance(roomId),
    onSettled: refresh,
  });
  const lock = useMutation({
    mutationFn: (v: { round: number; value: number }) =>
      gamesApi.ibreLock(roomId, v.round, v.value),
    onSettled: refresh,
  });
  const choose = useMutation({
    mutationFn: (v: { round: number; side: IbreSide }) =>
      gamesApi.ibreSide(roomId, v.round, v.side),
    onSettled: refresh,
  });
  // The target, asked for while held (ibre/target) and kept for the round.
  const [target, setTarget] = useState<{ round: number; value: number } | null>(null);
  const ask = useMutation({
    mutationFn: (round: number) => gamesApi.ibreTarget(roomId, round),
    onSuccess: (res) => setTarget({ round: res.roundNo, value: res.target }),
  });
  // This phone's needle and side guess, per round.
  const [needle, setNeedle] = useState<{ round: number; value: number }>({ round: 0, value: 50 });
  const [picked, setPicked] = useState<{ round: number; side: IbreSide } | null>(null);

  // Once per clock: advance after readyEndsAt or endsAt.
  const { mutate: advanceNow } = advance;
  const fired = useRef<string | null>(null);
  const clock = state?.turnPhase === 'ready' ? state.readyEndsAt : (state?.endsAt ?? null);
  const clockKey = state ? `${state.roundNo}:${state.turnPhase}:${clock}` : '';
  useEffect(() => {
    if (!state || clock === null || now < clock || fired.current === clockKey) return;
    fired.current = clockKey;
    advanceNow();
  }, [now, clock, clockKey, state, advanceNow]);

  // The describing table's needle, locked where it stands in the last 3 seconds unless locked by
  // hand (docs/SPEC_V3.md §20.5a). Once per round; the server ignores a second lock.
  const { mutate: lockNow } = lock;
  const lockedRound = useRef<number | null>(null);
  const autoValue = state && needle.round === state.roundNo ? needle.value : 50;
  useEffect(() => {
    if (!state || state.turnTable !== side || !ibreAutoLockDue(state, now)) return;
    if (lockedRound.current === state.roundNo) return;
    lockedRound.current = state.roundNo;
    lockNow({ round: state.roundNo, value: autoValue });
  }, [now, state, side, autoValue, lockNow]);

  if (!state) {
    return (
      <Text tone="muted" align="center">
        {tr.activities.ibre.body}
      </Text>
    );
  }

  const describing = state.turnTable === side;
  const round = state.roundNo;
  const value = needle.round === round ? needle.value : 50;
  const error = lock.error ?? choose.error ?? ask.error;

  if (state.turnPhase === 'ready') {
    const last = state.reveal;
    return (
      <View className="gap-3">
        {last ? (
          <RoundReveal reveal={last} guesser={aliases[other(last.table)]} />
        ) : (
          <DialWidth>
            {(w) => (
              <Dial
                width={w}
                left={state.scale.left}
                right={state.scale.right}
                accessibilityLabel={tr.ibre.scale(state.scale.left, state.scale.right)}
              />
            )}
          </DialWidth>
        )}
        <TurnReady
          testID="ibre-ready"
          describing={describing}
          describingAlias={aliases[state.turnTable]}
          secondsLeft={Math.max(0, Math.ceil(((state.readyEndsAt ?? now) - now) / 1000))}
          totalSeconds={IBRE_CONFIG.readySeconds}
          onStart={() => begin.mutate()}
          starting={begin.isPending}
          hint={tr.ibre.readyHint}
          waitingHint={tr.ibre.readyWaitingHint}
        />
      </View>
    );
  }

  const header = <IbreHeader state={state} now={now} names={aliases} mine={side} />;

  if (state.turnPhase === 'running') {
    return (
      <View className="gap-3" testID="ibre-round">
        {header}
        {describing ? (
          <>
            <Text variant="fine" align="center">
              {tr.ibre.clueHint}
            </Text>
            <DialWidth>
              {(w) => (
                <View className="gap-4">
                  <TargetHold
                    width={w}
                    left={state.scale.left}
                    right={state.scale.right}
                    target={target?.round === round ? target.value : null}
                    onHoldStart={() => {
                      if (target?.round !== round && !ask.isPending) ask.mutate(round);
                    }}
                    onHoldEnd={() => undefined}
                  />
                  <NeedleDial
                    width={w}
                    left={state.scale.left}
                    right={state.scale.right}
                    value={value}
                    onChange={(v) => setNeedle({ round, value: v })}
                    disabled={lock.isPending}
                  />
                </View>
              )}
            </DialWidth>
            <Button
              testID="ibre-lock"
              size="lg"
              label={tr.ibre.lock}
              onPress={() => {
                lockedRound.current = round;
                lock.mutate({ round, value });
              }}
              loading={lock.isPending}
              disabled={lock.isPending}
            />
          </>
        ) : (
          <>
            <DialWidth>
              {(w) => (
                <Dial
                  width={w}
                  left={state.scale.left}
                  right={state.scale.right}
                  accessibilityLabel={tr.ibre.scale(state.scale.left, state.scale.right)}
                />
              )}
            </DialWidth>
            <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
              {tr.ibre.otherClue(aliases[state.turnTable])}
            </Text>
          </>
        )}
        {error ? (
          <Text variant="fine" tone="danger">
            {errorMessage(error)}
          </Text>
        ) : null}
      </View>
    );
  }

  // The other table's 15 seconds: the locked needle, "Daha sol / Daha sağ".
  const mine = picked?.round === round ? picked.side : null;
  return (
    <View className="gap-3" testID="ibre-side-phase">
      {header}
      <DialWidth>
        {(w) => (
          <NeedleDial
            width={w}
            left={state.scale.left}
            right={state.scale.right}
            value={state.needle ?? 50}
            onChange={() => undefined}
            disabled
          />
        )}
      </DialWidth>
      {describing ? (
        <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
          {tr.ibre.sideWaiting(aliases[other(side)])}
        </Text>
      ) : (
        <>
          <Text variant="bodyStrong" align="center">
            {tr.ibre.sideTitle}
          </Text>
          <SideChoice
            selected={mine}
            onSelect={(s) => {
              setPicked({ round, side: s });
              choose.mutate({ round, side: s });
            }}
            disabled={choose.isPending || mine !== null}
          />
          <Text variant="fine" align="center">
            {tr.ibre.sideHint(IBRE_CONFIG.sideSeconds)}
          </Text>
        </>
      )}
      {error ? (
        <Text variant="fine" tone="danger">
          {errorMessage(error)}
        </Text>
      ) : null}
    </View>
  );
}
