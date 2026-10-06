import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GameIcon } from '@/components/Glyph';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { ClockPill } from '../GameBits';
import { SeatBadge } from './Seat';

// Sahtekar's visual parts (docs/SPEC_V3.md §20.2; canvas: Aşama 6 · Oyunlar → Sahtekar). They take
// props only; the game screen wires them to the room's game_state and the sahtekar function.

const BIG_SEAT = SPACING[16] * 2;
const CARD_MIN = 360;

// ------------------------------------------------------------------ seats

export type SeatRow = { seat: string; viewed: boolean };

// The seats of one table with who has seen their card ("1 / 3 baktı").
export function SeatList({
  title,
  seats,
  current,
}: {
  title: string;
  seats: readonly SeatRow[];
  current?: string;
}) {
  const seen = seats.filter((s) => s.viewed).length;
  return (
    <View className="gap-2.5">
      <View className="flex-row items-center gap-3">
        <Text variant="overline" tone="muted" className="flex-1">
          {title}
        </Text>
        <Text variant="caption" tone="muted">
          {tr.sahtekar.viewedCount(seen, seats.length)}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-2.5">
        {seats.map((s) => (
          <SeatBadge
            key={s.seat}
            seat={s.seat}
            state={s.seat === current ? 'current' : s.viewed ? 'done' : 'idle'}
          />
        ))}
      </View>
    </View>
  );
}

// "Telefonu A2'ye ver": who holds the phone next, before they see their card.
export function PassPhone({
  seat,
  seats,
  onReady,
}: {
  seat: string;
  // Both tables' seats with their seen state, this table first.
  seats?: ReactNode;
  onReady: () => void;
}) {
  return (
    <View className="flex-1 gap-4" testID="sahtekar-pass">
      {seats ? <Card>{seats}</Card> : null}
      <View className="flex-1 items-center justify-center gap-3">
        <SeatBadge seat={seat} state="current" size={BIG_SEAT} />
        <Text variant="display" align="center" accessibilityRole="header">
          {tr.sahtekar.passTo(seat)}
        </Text>
        <Text variant="fine" align="center">
          {tr.sahtekar.passHint}
        </Text>
      </View>
      <Button testID="sahtekar-ready" label={tr.sahtekar.ready(seat)} onPress={onReady} />
    </View>
  );
}

// ------------------------------------------------------------------ the card

export type SeatCard = { category: string; word: string } | { category: string; imposter: true };

// The seat's card, seen only while a finger holds it (canvas: Basılı tut, Kart). Pressing asks the
// parent for the card (`onHoldStart`, sahtekar/view); letting go hides it at once (`onHoldEnd`,
// the parent drops the card). The imposter sees "Sahtekarsın" and the category only.
export function HoldCard({
  seat,
  card,
  onHoldStart,
  onHoldEnd,
  onDone,
}: {
  seat: string;
  // Null until the server answers.
  card: SeatCard | null;
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onDone: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const [held, setHeld] = useState(false);
  return (
    <View className="flex-1 gap-3">
      <Pressable
        testID="sahtekar-hold"
        accessibilityRole="button"
        accessibilityLabel={tr.sahtekar.holdLabel(seat)}
        accessibilityHint={tr.sahtekar.holdHint}
        onPressIn={() => {
          setHolding(true);
          setHeld(true);
          onHoldStart();
        }}
        onPressOut={() => {
          setHolding(false);
          onHoldEnd();
        }}
        className="flex-1"
      >
        <SeatCardFace card={holding ? card : null} loading={holding && !card} />
      </Pressable>
      <Button
        variant="secondary"
        testID="sahtekar-seen"
        label={tr.sahtekar.seen}
        onPress={onDone}
        disabled={!held || holding}
      />
    </View>
  );
}

// The card's face: covered ("Basılı tut"), the word, or "Sahtekarsın" with the category.
export function SeatCardFace({ card, loading }: { card: SeatCard | null; loading?: boolean }) {
  const { colors, shape } = useTheme();
  const imposter = card !== null && 'imposter' in card;
  const [bg, fg] = card
    ? imposter
      ? [colors.lively, colors.onLively]
      : [colors.violet, colors.onViolet]
    : [colors.surface2, colors.text];
  return (
    <View
      className="flex-1 items-center justify-center gap-3"
      style={{
        minHeight: CARD_MIN,
        padding: SPACING[6],
        borderRadius: shape.radius.lg + SPACING[2],
        backgroundColor: bg,
        borderWidth: card ? Math.max(shape.stroke.feature, 2) : shape.stroke.hairline * 2,
        borderStyle: card ? 'solid' : 'dashed',
        borderColor: card ? colors.border : colors.muted,
        boxShadow: card ? (shape.shadow.feature ?? undefined) : undefined,
      }}
    >
      {card === null ? (
        <>
          <GameIcon name="impostor" color={colors.muted} size={SPACING[16]} />
          <Text variant="display" align="center">
            {loading ? tr.sahtekar.loading : tr.sahtekar.hold}
          </Text>
          <Text variant="fine" align="center">
            {tr.sahtekar.holdHint}
          </Text>
        </>
      ) : 'imposter' in card ? (
        <View className="items-center gap-3" testID="sahtekar-card-imposter">
          <GameIcon name="impostor" color={fg} size={SPACING[16] + SPACING[8]} />
          <HeroText color={fg}>{tr.sahtekar.youAreImposter}</HeroText>
          <Text variant="title" color={fg} align="center">
            {tr.sahtekar.category(card.category)}
          </Text>
          <Text variant="body" color={fg} align="center">
            {tr.sahtekar.imposterHint}
          </Text>
        </View>
      ) : (
        <View className="items-center gap-2" testID="sahtekar-card-word">
          <Text variant="overline" color={fg}>
            {tr.sahtekar.category(card.category)}
          </Text>
          <HeroText color={fg}>{card.word}</HeroText>
          <Text variant="bodyStrong" color={fg}>
            {tr.sahtekar.notImposter}
          </Text>
        </View>
      )}
    </View>
  );
}

// ------------------------------------------------------------------ clues

// The clue order (two rounds, A1, B1, A2, B2 …): who has spoken, who is speaking with 15 s, who is
// next. The speaking seat's table presses "Söyledi".
export function ClueOrder({
  round,
  totalRounds,
  order,
  currentIndex,
  secondsLeft,
  canSay,
  onSaid,
  saying,
}: {
  round: number;
  totalRounds: number;
  order: readonly string[];
  currentIndex: number;
  secondsLeft: number;
  // The speaking seat is at this table.
  canSay: boolean;
  onSaid: () => void;
  saying?: boolean;
}) {
  const { colors, shape } = useTheme();
  const speaking = order[currentIndex] ?? '';
  return (
    <View className="flex-1 gap-3" testID="sahtekar-clues">
      <View className="flex-row items-center justify-between">
        <Text variant="overline" tone="muted">
          {tr.sahtekar.clueRound(round, totalRounds)}
        </Text>
        <ClockPill seconds={secondsLeft} />
      </View>
      <Text variant="display" accessibilityRole="header">
        {tr.sahtekar.turnOf(speaking)}
      </Text>
      <Text variant="fine">{tr.sahtekar.clueHint}</Text>
      <View className="gap-1">
        {order.map((seat, i) => {
          const now = i === currentIndex;
          return (
            <View
              key={`${seat}-${i}`}
              className="flex-row items-center gap-3"
              style={{
                paddingHorizontal: SPACING[3],
                paddingVertical: SPACING[1.5],
                borderRadius: shape.radius.md,
                backgroundColor: now ? colors.surface : 'transparent',
                boxShadow: now ? shape.shadow.card : undefined,
              }}
            >
              <SeatBadge
                seat={seat}
                state={now ? 'current' : i < currentIndex ? 'done' : 'idle'}
                size={SPACING[10]}
              />
              <Text
                variant={now ? 'bodyStrong' : 'body'}
                tone={i > currentIndex ? 'muted' : 'text'}
                className="flex-1"
              >
                {now
                  ? tr.sahtekar.speaking(seat)
                  : i < currentIndex
                    ? tr.sahtekar.said(seat)
                    : seat}
              </Text>
            </View>
          );
        })}
      </View>
      <View className="mt-auto">
        {canSay ? (
          <Button
            testID="sahtekar-said"
            label={tr.sahtekar.saidButton}
            onPress={onSaid}
            loading={saying}
          />
        ) : (
          <Text variant="fine" align="center">
            {tr.sahtekar.otherSpeaking}
          </Text>
        )}
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ vote

// The secret vote: the seat holding the phone picks a seat; its own seat is off (§20.8 4).
export function VoteGrid({
  voter,
  seats,
  selected,
  onSelect,
  onSubmit,
  secondsLeft,
  votesCast,
  totalVoters,
  submitting,
}: {
  voter: string;
  seats: readonly string[];
  selected: string | null;
  onSelect: (seat: string) => void;
  onSubmit: () => void;
  secondsLeft?: number;
  votesCast: number;
  totalVoters: number;
  submitting?: boolean;
}) {
  const { colors, shape } = useTheme();
  return (
    <View className="flex-1 gap-3" testID="sahtekar-vote">
      <View className="flex-row items-center justify-between">
        <Text variant="overline" tone="muted">
          {tr.sahtekar.votesCast(votesCast, totalVoters)}
        </Text>
        {secondsLeft !== undefined ? <ClockPill seconds={secondsLeft} /> : null}
      </View>
      <View className="flex-row items-center gap-3">
        <SeatBadge seat={voter} state="current" size={SPACING[11]} />
        <Text variant="display" accessibilityRole="header" className="flex-1">
          {tr.sahtekar.whoIsImposter(voter)}
        </Text>
      </View>
      <Text variant="fine">{tr.sahtekar.voteHint}</Text>
      <View
        className="flex-row flex-wrap"
        style={{ marginHorizontal: -SPACING[1], rowGap: SPACING[2.5] }}
      >
        {seats.map((seat) => {
          const self = seat === voter;
          const on = seat === selected;
          return (
            <View key={seat} style={{ width: '33.333%', paddingHorizontal: SPACING[1] }}>
              <Pressable
                testID={`sahtekar-vote-${seat}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: self }}
                accessibilityLabel={self ? tr.sahtekar.selfVote(seat) : seat}
                disabled={self}
                onPress={() => onSelect(seat)}
                className="items-center justify-center gap-1"
                style={{
                  paddingVertical: SPACING[3],
                  borderRadius: shape.radius.lg,
                  backgroundColor: on ? colors.accent : colors.surface,
                  borderWidth: on
                    ? Math.max(shape.stroke.control, 2)
                    : self
                      ? shape.stroke.hairline * 2
                      : 0,
                  borderStyle: self ? 'dashed' : 'solid',
                  borderColor: on ? colors.border : colors.divider,
                  boxShadow: on
                    ? (shape.shadow.primaryButton ?? undefined)
                    : self
                      ? undefined
                      : shape.shadow.card,
                  opacity: self ? 0.45 : 1,
                }}
              >
                <SeatBadge seat={seat} size={SPACING[14]} />
                {self ? (
                  <Text variant="caption" tone="muted">
                    {tr.sahtekar.you}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </View>
      <View className="mt-auto">
        <Button
          testID="sahtekar-vote-submit"
          label={selected ? tr.sahtekar.voteFor(selected) : tr.sahtekar.pickSeat}
          onPress={onSubmit}
          disabled={!selected}
          loading={submitting}
        />
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ guess

// The caught imposter's last chance: six words from the category, 30 s.
export function GuessOptions({
  seat,
  category,
  options,
  selected,
  onSelect,
  onSubmit,
  secondsLeft,
  submitting,
}: {
  seat: string;
  category: string;
  options: readonly string[];
  selected: string | null;
  onSelect: (option: string) => void;
  onSubmit: () => void;
  secondsLeft: number;
  submitting?: boolean;
}) {
  const { colors, shape } = useTheme();
  return (
    <View className="flex-1 gap-3" testID="sahtekar-guess">
      <View className="flex-row items-center justify-between">
        <Text variant="overline" tone="muted">
          {tr.sahtekar.lastChance(seat)}
        </Text>
        <ClockPill seconds={secondsLeft} />
      </View>
      <View className="flex-row items-center gap-3">
        <GameIcon name="impostor" color={colors.text} size={SPACING[12]} />
        <Text variant="display" accessibilityRole="header" className="flex-1">
          {tr.sahtekar.guessTitle}
        </Text>
      </View>
      <Text variant="fine">{tr.sahtekar.guessHint(category)}</Text>
      <View className="flex-row flex-wrap justify-between gap-y-2.5">
        {options.map((o, i) => {
          const on = o === selected;
          return (
            <Pressable
              key={o}
              testID={`sahtekar-option-${i}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onSelect(o)}
              className="items-center justify-center"
              style={{
                width: '48.5%',
                minHeight: TOUCH.large,
                borderRadius: shape.radius.lg,
                backgroundColor: on ? colors.accent : colors.surface,
                borderWidth: on ? Math.max(shape.stroke.control, 2) : 0,
                borderColor: colors.border,
                boxShadow: on ? (shape.shadow.primaryButton ?? undefined) : shape.shadow.card,
              }}
            >
              <Text variant="buttonLarge" tone={on ? 'onAccent' : 'text'}>
                {o}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View className="mt-auto">
        <Button
          testID="sahtekar-guess-submit"
          label={selected ? tr.sahtekar.guessSubmit(selected) : tr.sahtekar.pickWord}
          onPress={onSubmit}
          disabled={!selected}
          loading={submitting}
        />
      </View>
    </View>
  );
}

// The other tables while the caught imposter guesses.
export function GuessWaiting({ seat, secondsLeft }: { seat: string; secondsLeft: number }) {
  return (
    <View className="flex-1 items-center justify-center gap-3" testID="sahtekar-guess-wait">
      <ClockPill seconds={secondsLeft} />
      <SeatBadge seat={seat} state="current" size={BIG_SEAT} />
      <Text variant="display" align="center">
        {tr.sahtekar.caught(seat)}
      </Text>
      <Text variant="fine" align="center">
        {tr.sahtekar.guessingNow}
      </Text>
    </View>
  );
}

// ------------------------------------------------------------------ reveal

export type Vote = { voter: string; target: string };

// The big reveal (a shareable moment, canvas: Sahtekarın açılışı): who it was, who won, the word,
// the imposter's guess and every vote by seat label. Big enough to read in a screen recording.
export function ImposterReveal({
  imposter,
  word,
  guess,
  outcome,
  votes,
  brand,
}: {
  imposter: string;
  word: string;
  guess?: string | null;
  outcome: 'imposter' | 'tables';
  votes: readonly Vote[];
  // "Kabuk · Sahtekar" in the corner of a recording.
  brand?: string;
}) {
  const { colors, shape } = useTheme();
  const fg = colors.onLively;
  return (
    <View
      testID="sahtekar-reveal"
      accessibilityLiveRegion="polite"
      className="flex-1 items-center justify-center gap-3"
      style={{
        padding: SPACING[6],
        borderRadius: shape.radius.lg + SPACING[2],
        backgroundColor: colors.lively,
      }}
    >
      <GameIcon name="impostor" color={fg} size={SPACING[16] + SPACING[8]} />
      <Text variant="overline" color={fg}>
        {tr.sahtekar.imposterWas}
      </Text>
      <View
        className="items-center justify-center"
        style={{
          width: BIG_SEAT + SPACING[4],
          height: BIG_SEAT + SPACING[4],
          borderRadius: shape.radius.pill,
          backgroundColor: colors.surface,
          borderWidth: Math.max(shape.stroke.feature, 2),
          borderColor: colors.border,
          boxShadow: shape.shadow.feature ?? undefined,
        }}
      >
        <Text variant="hero">{imposter}</Text>
      </View>
      <HeroText color={fg}>
        {outcome === 'tables' ? tr.sahtekar.tablesWon : tr.sahtekar.imposterWon}
      </HeroText>
      <Text variant="title" color={fg} align="center">
        {guess ? tr.sahtekar.wordAndGuess(word, guess) : tr.sahtekar.word(word)}
      </Text>
      <View
        className="flex-row flex-wrap justify-center gap-x-5 gap-y-2"
        accessibilityLabel={tr.sahtekar.votesLabel}
      >
        {votes.map((v) => (
          <View
            key={v.voter}
            accessible
            accessibilityLabel={tr.sahtekar.voteLine(v.voter, v.target)}
            className="flex-row items-center gap-1.5"
          >
            <SeatBadge seat={v.voter} size={SPACING[9]} />
            <Text variant="bodyStrong" color={fg}>
              →
            </Text>
            <SeatBadge seat={v.target} size={SPACING[9]} />
          </View>
        ))}
      </View>
      {brand ? (
        <Text variant="label" color={fg} className="mt-2">
          {brand}
        </Text>
      ) : null}
    </View>
  );
}

// The hero size breaks a long word ("Sahtekarsın") mid-way on a narrow card; it shrinks instead,
// one line at most per word.
function HeroText({ children, color }: { children: string; color: string }) {
  const words = children.trim().split(/\s+/).length;
  return (
    <Text
      variant="hero"
      color={color}
      align="center"
      numberOfLines={Math.min(3, words)}
      adjustsFontSizeToFit
    >
      {children}
    </Text>
  );
}
