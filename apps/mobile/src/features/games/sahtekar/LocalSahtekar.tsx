import {
  cardOf,
  clueRoundOf,
  type LocalAction,
  type LocalSahtekar as Game,
  newLocalGame,
  redealLocal,
  reduceLocal,
  SAHTEKAR,
} from '@shared/sahtekar.ts';
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

import { ClockPill } from '../GameBits';
import {
  ClueOrder,
  GuessOptions,
  HoldCard,
  ImposterReveal,
  PassPhone,
  type SeatCard,
  SeatList,
  VoteGrid,
} from './Sahtekar';

type Props = { roomId: string; players: number };

// One-table Sahtekar (docs/SPEC_V3.md §20.2): the phone picks the impostor and runs the same rules
// for the table's seats (pure/sahtekar.ts → reduceLocal); the deck (a word, its category, 6
// options) comes from sahtekar/start. The phone goes round the table for the cards and the vote.
export function LocalSahtekar({ roomId, players }: Props) {
  const now = useNow(250);
  const [game, setGame] = useState<Game | null>(null);
  const deal = useMutation({
    mutationFn: () => gamesApi.sahtekarStart(roomId),
    onSuccess: (deck) =>
      setGame((g) =>
        g && g.phase === 'redeal'
          ? redealLocal(g, deck, Date.now())
          : newLocalGame(deck, players, Date.now()),
      ),
  });
  const { mutate: dealNow } = deal;
  const dispatch = (action: LocalAction) =>
    setGame((g) => (g ? reduceLocal(g, action, Date.now()) : g));

  // The first deck, and a new one when the impostor did not look in time.
  const dealt = useRef<string | null>(null);
  const dealKey =
    game === null ? 'start' : game.phase === 'redeal' ? `redeal:${game.seats.join()}` : null;
  useEffect(() => {
    if (dealKey && dealt.current !== dealKey) {
      dealt.current = dealKey;
      dealNow();
    }
  }, [dealKey, dealNow]);

  // The clock: a phase whose time is up moves on while rendering (React's "storing information
  // from previous renders"), not in an effect.
  if (game && game.phase !== 'done' && game.phase !== 'redeal' && now >= game.endsAt) {
    setGame(reduceLocal(game, { type: 'tick' }, now));
  }

  // Once per finished game (a game that ended for too few seats has no winner).
  const tracked = useRef<Game | null>(null);
  useEffect(() => {
    if (game?.phase === 'done' && game.winner && tracked.current !== game) {
      tracked.current = game;
      track('game_completed', {
        concept: 'sahtekar',
        mode: 'voice',
        outcome: game.winner,
        players: game.seats.length,
      });
    }
  }, [game]);

  // The seat holding the phone to see its card, until "Gördüm" (the last seat's look starts the
  // clues; the card stays under the finger until then).
  const [holding, setHolding] = useState<string | null>(null);
  const [voting, setVoting] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  if (!game) {
    return deal.isError ? (
      <Retry error={deal.error} onRetry={() => dealNow()} />
    ) : (
      <Text tone="muted" align="center">
        {tr.sahtekar.loading}
      </Text>
    );
  }
  const secondsLeft = Math.max(0, Math.ceil((game.endsAt - now) / 1000));

  if (holding) {
    return (
      <HoldCard
        seat={holding}
        card={seatCard(cardOf(game, holding))}
        onHoldStart={() => dispatch({ type: 'view', seat: holding })}
        onHoldEnd={() => undefined}
        onDone={() => setHolding(null)}
      />
    );
  }

  switch (game.phase) {
    case 'viewing': {
      const next = game.seats.find((s) => !game.viewed.includes(s)) ?? game.seats[0] ?? '';
      return (
        <View className="flex-1 gap-3">
          <View className="flex-row items-center justify-between">
            <Text variant="overline" tone="muted" className="flex-1">
              {tr.sahtekar.category(game.category)}
            </Text>
            <ClockPill seconds={secondsLeft} />
          </View>
          <PassPhone
            seat={next}
            seats={
              <SeatList
                title={tr.sahtekar.ownTable}
                seats={game.seats.map((seat) => ({ seat, viewed: game.viewed.includes(seat) }))}
                current={next}
              />
            }
            onReady={() => setHolding(next)}
          />
        </View>
      );
    }
    case 'redeal':
      return deal.isError ? (
        <Retry error={deal.error} onRetry={() => dealNow()} />
      ) : (
        <Card>
          <Text variant="fine">{tr.sahtekar.redealt}</Text>
          <Text tone="muted" className="mt-2">
            {tr.sahtekar.dealing}
          </Text>
        </Card>
      );
    case 'clues':
      return (
        <View className="flex-1 gap-3">
          <Text variant="overline" tone="muted">
            {tr.sahtekar.category(game.category)}
          </Text>
          <ClueOrder
            round={clueRoundOf(game.step, game.order.length)}
            totalRounds={SAHTEKAR.clueRounds}
            order={game.order}
            currentIndex={game.step}
            secondsLeft={secondsLeft}
            canSay
            onSaid={() => dispatch({ type: 'said', step: game.step })}
          />
        </View>
      );
    case 'voting': {
      const next = game.seats.find((s) => !(s in game.votes)) ?? null;
      if (voting) {
        return (
          <VoteGrid
            voter={voting}
            seats={game.seats}
            selected={selected}
            onSelect={setSelected}
            onSubmit={() => {
              if (!selected) return;
              dispatch({ type: 'vote', voter: voting, target: selected });
              setVoting(null);
              setSelected(null);
            }}
            secondsLeft={secondsLeft}
            votesCast={Object.keys(game.votes).length}
            totalVoters={game.seats.length}
          />
        );
      }
      return (
        <View className="flex-1 gap-3">
          <View className="flex-row items-center justify-between">
            <Text variant="overline" tone="muted">
              {tr.sahtekar.votesCast(Object.keys(game.votes).length, game.seats.length)}
            </Text>
            <ClockPill seconds={secondsLeft} />
          </View>
          {next ? <PassPhone seat={next} onReady={() => setVoting(next)} /> : null}
        </View>
      );
    }
    case 'guess':
      return (
        <GuessOptions
          seat={game.accused ?? ''}
          category={game.category}
          options={game.options}
          selected={selected}
          onSelect={setSelected}
          onSubmit={() => {
            if (!selected) return;
            dispatch({ type: 'guess', option: selected });
            setSelected(null);
          }}
          secondsLeft={secondsLeft}
        />
      );
    case 'done':
      return (
        <View className="flex-1 gap-3">
          {game.winner ? (
            <ImposterReveal
              imposter={game.imposter}
              word={game.word}
              guess={game.guess}
              outcome={game.winner}
              votes={Object.entries(game.votes).map(([voter, target]) => ({ voter, target }))}
              brand={tr.games.gameBrand(tr.concepts.sahtekar)}
            />
          ) : (
            <Card tone="note">
              <Text variant="fine" testID="sahtekar-not-enough">
                {tr.sahtekar.notEnough}
              </Text>
            </Card>
          )}
          <Button
            testID="sahtekar-play-again"
            label={tr.games.playAgain}
            onPress={() => {
              dealt.current = null;
              setGame(null);
            }}
          />
        </View>
      );
  }
}

function seatCard(c: ReturnType<typeof cardOf>): SeatCard {
  return c.imposter || c.word === null
    ? { category: c.category, imposter: true }
    : { category: c.category, word: c.word };
}

function Retry({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <View className="gap-3">
      <Text variant="fine" tone="danger">
        {errorMessage(error)}
      </Text>
      <Button variant="secondary" label={tr.common.retry} onPress={onRetry} />
    </View>
  );
}
