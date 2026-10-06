import type { SahtekarViewResponse } from '@shared/api/games.ts';
import {
  clueRoundOf,
  ownSeats,
  SAHTEKAR,
  type SahtekarState,
  tableOfSeat,
} from '@shared/sahtekar.ts';
import type { TableSide } from '@shared/tabu.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { roomKeys } from '@/features/rooms/queries';
import { errorMessage } from '@/i18n/errors';
import { tr } from '@/i18n/tr';
import { gamesApi } from '@/lib/api';
import { useNow } from '@/lib/useNow';

import { ClockPill } from '../GameBits';
import {
  ClueOrder,
  GuessOptions,
  GuessWaiting,
  HoldCard,
  PassPhone,
  type SeatCard,
  SeatList,
  VoteGrid,
} from './Sahtekar';

type Props = { roomId: string; state: SahtekarState | null; side: TableSide };

// Two-table Sahtekar (docs/SPEC_V3.md §20.2). Each table passes its own phone between its seats:
// the card is asked for only while a seat holds it (sahtekar/view) and dropped when the finger
// lifts; the vote is cast seat by seat. The server keeps the impostor, the word, the order and the
// clock; when a phase's time is up either phone moves it on (sahtekar/advance, idempotent).
export function SahtekarGame({ roomId, state, side }: Props) {
  const now = useNow(250);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: roomKeys.room(roomId) });

  const advance = useMutation({
    mutationFn: () => gamesApi.sahtekarAdvance(roomId),
    onSettled: refresh,
  });
  const { mutate: advanceNow } = advance;
  const endsAt = state ? Date.parse(state.endsAt) : Number.POSITIVE_INFINITY;
  const secondsLeft = Math.max(0, Math.ceil((endsAt - now) / 1000));
  // Once per phase step: the key changes with every new clock.
  const advanced = useRef<string | null>(null);
  const stepKey = state ? `${state.gameNo}:${state.dealNo}:${state.phase}:${state.endsAt}` : '';
  useEffect(() => {
    if (state && now >= endsAt && advanced.current !== stepKey) {
      advanced.current = stepKey;
      advanceNow();
    }
  }, [now, endsAt, stepKey, state, advanceNow]);

  // The seat holding the phone to see its card. It keeps it until "Gördüm", also when the last
  // seat's look has already started the clues; a new deal (dealNo) takes it back.
  const [hold, setHold] = useState<Hold | null>(null);

  if (!state) {
    return (
      <Text tone="muted" align="center">
        {tr.activities.sahtekar.body}
      </Text>
    );
  }

  const key = `${state.gameNo}:${state.dealNo}`;
  if (hold && hold.key === key) {
    return (
      <HoldStage
        roomId={roomId}
        state={state}
        hold={hold}
        secondsLeft={secondsLeft}
        onCard={(card) => setHold((h) => (h && h.key === key ? { ...h, card } : h))}
        onDone={() => setHold(null)}
        onChanged={refresh}
      />
    );
  }
  switch (state.phase) {
    case 'viewing':
      return (
        <Viewing
          state={state}
          side={side}
          secondsLeft={secondsLeft}
          onHold={(seat) => setHold({ seat, key, card: null })}
        />
      );
    case 'clues':
      return (
        <Clues
          roomId={roomId}
          state={state}
          side={side}
          secondsLeft={secondsLeft}
          onChanged={refresh}
        />
      );
    case 'voting':
      return (
        <Voting
          key={key}
          roomId={roomId}
          state={state}
          side={side}
          secondsLeft={secondsLeft}
          onChanged={refresh}
        />
      );
    case 'guess':
      return (
        <Guess
          roomId={roomId}
          state={state}
          side={side}
          secondsLeft={secondsLeft}
          onChanged={refresh}
        />
      );
  }
}

type PhaseProps = {
  roomId: string;
  state: SahtekarState;
  side: TableSide;
  secondsLeft: number;
  onChanged: () => void;
};

// Both tables' seats with who has looked, this table first.
function Seats({
  state,
  side,
  current,
}: {
  state: SahtekarState;
  side: TableSide;
  current?: string;
}) {
  const other: TableSide = side === 'owner' ? 'guest' : 'owner';
  const rows = (s: TableSide) =>
    ownSeats(state.seats, s).map((seat) => ({ seat, viewed: state.viewed.includes(seat) }));
  return (
    <View className="gap-4">
      <SeatList title={tr.sahtekar.ownTable} seats={rows(side)} current={current} />
      {rows(other).length > 0 ? (
        <SeatList title={tr.sahtekar.otherTable} seats={rows(other)} />
      ) : null}
    </View>
  );
}

function toCard(res: SahtekarViewResponse): SeatCard {
  return res.imposter || res.word === null
    ? { category: res.category, imposter: true }
    : { category: res.category, word: res.word };
}

type Hold = { seat: string; key: string; card: SeatCard | null };

function ViewingTop({ state, secondsLeft }: { state: SahtekarState; secondsLeft: number }) {
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text variant="overline" tone="muted" className="flex-1">
          {tr.sahtekar.category(state.category)}
        </Text>
        {state.phase === 'viewing' ? <ClockPill seconds={secondsLeft} /> : null}
      </View>
      {state.dealNo > 1 && state.phase === 'viewing' ? (
        <Text variant="fine" accessibilityLiveRegion="polite" testID="sahtekar-redealt">
          {tr.sahtekar.redealt}
        </Text>
      ) : null}
    </View>
  );
}

// Seeing the word: "Telefonu A2'ye ver" for this table's next seat that has not looked.
function Viewing({
  state,
  side,
  secondsLeft,
  onHold,
}: {
  state: SahtekarState;
  side: TableSide;
  secondsLeft: number;
  onHold: (seat: string) => void;
}) {
  const next = ownSeats(state.seats, side).find((s) => !state.viewed.includes(s)) ?? null;
  if (next) {
    return (
      <View className="flex-1 gap-3">
        <ViewingTop state={state} secondsLeft={secondsLeft} />
        <PassPhone
          seat={next}
          seats={<Seats state={state} side={side} current={next} />}
          onReady={() => onHold(next)}
        />
      </View>
    );
  }
  return (
    <View className="gap-3">
      <ViewingTop state={state} secondsLeft={secondsLeft} />
      <Card>
        <Seats state={state} side={side} />
      </Card>
      <Text variant="fine" align="center" testID="sahtekar-own-done">
        {tr.sahtekar.ownDone}
      </Text>
    </View>
  );
}

// The card under a finger. While the viewing runs each press asks the server again; after it (the
// last seat's look started the clues) the answer this phone already has is shown, still only while
// the finger is down.
function HoldStage({
  roomId,
  state,
  hold,
  secondsLeft,
  onCard,
  onDone,
  onChanged,
}: {
  roomId: string;
  state: SahtekarState;
  hold: Hold;
  secondsLeft: number;
  onCard: (card: SeatCard) => void;
  onDone: () => void;
  onChanged: () => void;
}) {
  const view = useMutation({
    mutationFn: () => gamesApi.sahtekarView(roomId, hold.seat),
    onSuccess: (res) => onCard(toCard(res)),
    onSettled: onChanged,
  });
  return (
    <View className="flex-1 gap-3">
      <ViewingTop state={state} secondsLeft={secondsLeft} />
      <HoldCard
        seat={hold.seat}
        card={hold.card}
        onHoldStart={() => {
          if (state.phase === 'viewing') view.mutate();
        }}
        onHoldEnd={() => undefined}
        onDone={onDone}
      />
      {view.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(view.error)}
        </Text>
      ) : null}
    </View>
  );
}

function Clues({ roomId, state, side, secondsLeft, onChanged }: PhaseProps) {
  const said = useMutation({
    mutationFn: (step: number) => gamesApi.sahtekarSaid(roomId, step),
    onSettled: onChanged,
  });
  const speaking = state.order[state.step] ?? '';
  return (
    <View className="flex-1 gap-3">
      <Text variant="overline" tone="muted">
        {tr.sahtekar.category(state.category)}
      </Text>
      <ClueOrder
        round={clueRoundOf(state.step, state.order.length)}
        totalRounds={SAHTEKAR.clueRounds}
        order={state.order}
        currentIndex={state.step}
        secondsLeft={secondsLeft}
        canSay={speaking !== '' && tableOfSeat(speaking) === side}
        onSaid={() => said.mutate(state.step)}
        saying={said.isPending}
      />
      {said.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(said.error)}
        </Text>
      ) : null}
    </View>
  );
}

// The secret vote: the phone goes round this table's seats that saw their card. Which seats have
// voted is kept on this phone only; the server ignores a second vote from a seat.
function Voting({ roomId, state, side, secondsLeft, onChanged }: PhaseProps) {
  const mine = ownSeats(state.voters, side);
  const [voted, setVoted] = useState<readonly string[]>([]);
  const [voting, setVoting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const next = mine.find((s) => !voted.includes(s)) ?? null;
  const vote = useMutation({
    mutationFn: ({ voter, target }: { voter: string; target: string }) =>
      gamesApi.sahtekarVote(roomId, voter, target),
    onSuccess: (_res, { voter }) => {
      setVoted((v) => [...v, voter]);
      setVoting(null);
      setSelected(null);
    },
    onSettled: onChanged,
  });
  const error = vote.isError ? (
    <Text variant="fine" tone="danger">
      {errorMessage(vote.error)}
    </Text>
  ) : null;

  if (voting) {
    return (
      <View className="flex-1 gap-3">
        <VoteGrid
          voter={voting}
          seats={state.seats}
          selected={selected}
          onSelect={setSelected}
          onSubmit={() => {
            if (selected) vote.mutate({ voter: voting, target: selected });
          }}
          secondsLeft={secondsLeft}
          votesCast={state.votesCast}
          totalVoters={state.voters.length}
          submitting={vote.isPending}
        />
        {error}
      </View>
    );
  }
  if (next) {
    return (
      <View className="flex-1 gap-3">
        <View className="flex-row items-center justify-between">
          <Text variant="overline" tone="muted">
            {tr.sahtekar.votesCast(state.votesCast, state.voters.length)}
          </Text>
          <ClockPill seconds={secondsLeft} />
        </View>
        <PassPhone seat={next} onReady={() => setVoting(next)} />
        {error}
      </View>
    );
  }
  return (
    <View className="items-center gap-3">
      <ClockPill seconds={secondsLeft} />
      <Text variant="overline" tone="muted">
        {tr.sahtekar.votesCast(state.votesCast, state.voters.length)}
      </Text>
      <Text variant="fine" align="center" testID="sahtekar-votes-done">
        {tr.sahtekar.votesDone}
      </Text>
    </View>
  );
}

// The caught impostor's table picks a word; the other table waits.
function Guess({ roomId, state, side, secondsLeft, onChanged }: PhaseProps) {
  const accused = state.accused ?? '';
  const mine = accused !== '' && tableOfSeat(accused) === side;
  const options = useQuery({
    queryKey: ['sahtekarOptions', roomId, state.gameNo, state.dealNo],
    queryFn: () => gamesApi.sahtekarOptions(roomId),
    enabled: mine,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const guess = useMutation({
    mutationFn: (option: string) => gamesApi.sahtekarGuess(roomId, option),
    onSettled: onChanged,
  });
  if (!mine) return <GuessWaiting seat={accused} secondsLeft={secondsLeft} />;
  return (
    <View className="flex-1 gap-3">
      <GuessOptions
        seat={accused}
        category={state.category}
        options={options.data?.options ?? []}
        selected={selected}
        onSelect={setSelected}
        onSubmit={() => {
          if (selected) guess.mutate(selected);
        }}
        secondsLeft={secondsLeft}
        submitting={guess.isPending}
      />
      {options.isError || guess.isError ? (
        <Text variant="fine" tone="danger">
          {errorMessage(options.error ?? guess.error)}
        </Text>
      ) : null}
    </View>
  );
}
