import { Pressable, View } from 'react-native';

import { Card } from '@/components/Card';
import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import type { PaletteKey } from '@/theme/tokens';
import { SPACING } from '@/theme/tokens';

const START = 196;
const WAIT = 152;
const HINT_WIDTH = 300;

export type TurnStat = { label: string; value: number; tone: PaletteKey };

type Props = {
  // The finished turn: "2. tur bitti", who played it, its points and counts.
  summary?: { eyebrow: string; alias: string; title: string; points: string; stats: TurnStat[] };
  // The describing table sees "Başla"; the other one the countdown.
  describing: boolean;
  // The describing table's alias, for "… hazırlanıyor".
  describingAlias: string;
  secondsLeft: number;
  totalSeconds: number;
  onStart?: () => void;
  starting?: boolean;
  // Tabu's lines by default; other timed games pass their own.
  hint?: string;
  waitingHint?: string;
  testID?: string;
};

// Between turns (canvas: Aşama 6 · Oyunlar → Tur hazır): the last turn's summary, then a big
// "Başla" on the describing table, or "… hazırlanıyor" with the countdown on the other one.
export function TurnReady({
  summary,
  describing,
  describingAlias,
  secondsLeft,
  totalSeconds,
  onStart,
  starting,
  hint = tr.games.turnReadyHint,
  waitingHint = tr.games.turnReadyWaitingHint,
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  return (
    <View className="flex-1 gap-4" testID={testID}>
      {summary ? (
        <Card>
          <View className="gap-3">
            <Text variant="overline" tone="muted">
              {summary.eyebrow}
            </Text>
            <View className="flex-row items-center gap-3">
              <Avatar kind="table" alias={summary.alias} size="md" />
              <Text variant="heading" className="flex-1">
                {summary.title}
              </Text>
              <Text variant="score">{summary.points}</Text>
            </View>
            <View
              className="flex-row pt-2"
              style={{ borderTopWidth: shape.stroke.hairline, borderTopColor: colors.divider }}
            >
              {summary.stats.map((s) => (
                <View
                  key={s.label}
                  className="flex-1 items-center"
                  accessible
                  accessibilityLabel={`${s.label} ${s.value}`}
                >
                  <Text variant="score" color={colors[s.tone]}>
                    {String(s.value)}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {s.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </Card>
      ) : null}
      <View className="flex-1 items-center justify-center gap-4">
        {describing ? (
          <>
            <Pressable
              testID="turn-start"
              accessibilityRole="button"
              accessibilityLabel={tr.games.turnReadyStartLabel}
              accessibilityState={{ disabled: !!starting }}
              disabled={starting}
              onPress={onStart}
            >
              {({ pressed }) => (
                <View
                  style={{
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: START,
                    height: START,
                    borderRadius: shape.radius.pill,
                    backgroundColor: colors.accent,
                    borderWidth: Math.max(shape.stroke.feature, 2),
                    borderColor: colors.border,
                    boxShadow: shape.shadow.primaryButton ?? undefined,
                    opacity: starting ? 0.6 : 1,
                    transform: [{ scale: pressed ? 0.97 : 1 }],
                  }}
                >
                  <Text variant="hero" tone="onAccent">
                    {tr.games.turnReadyStart}
                  </Text>
                </View>
              )}
            </Pressable>
            <Text variant="bodyStrong" align="center">
              {tr.games.turnReadyYou}
            </Text>
            <View style={{ maxWidth: HINT_WIDTH }}>
              <Text variant="fine" align="center">
                {hint}
              </Text>
            </View>
          </>
        ) : (
          <>
            <View
              testID="turn-countdown"
              accessibilityRole="timer"
              accessibilityLabel={tr.games.turnReadySeconds(secondsLeft)}
              className="items-center justify-center"
              style={{
                width: WAIT,
                height: WAIT,
                borderRadius: shape.radius.pill,
                borderWidth: SPACING[2.5],
                borderColor: colors.surface2,
                borderTopColor: colors.accent,
                borderRightColor: fraction > 0.25 ? colors.accent : colors.surface2,
                borderBottomColor: fraction > 0.5 ? colors.accent : colors.surface2,
                borderLeftColor: fraction > 0.75 ? colors.accent : colors.surface2,
              }}
            >
              <Text variant="hero" tabular>
                {String(secondsLeft)}
              </Text>
            </View>
            <Text variant="heading" align="center">
              {tr.games.turnReadyWaiting(describingAlias)}
            </Text>
            <View style={{ maxWidth: HINT_WIDTH }}>
              <Text variant="fine" align="center">
                {waitingHint}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

// The Tabu counts for the summary: Doğru, Tabu, Pas.
export function tabuStats(correct: number, taboo: number, pass: number): TurnStat[] {
  return [
    { label: tr.games.statCorrect, value: correct, tone: 'success' },
    { label: tr.games.statTaboo, value: taboo, tone: 'danger' },
    { label: tr.games.statPass, value: pass, tone: 'muted' },
  ];
}
