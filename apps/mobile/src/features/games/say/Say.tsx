import { Pressable, View } from 'react-native';

import { Button } from '@/components/Button';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

// The shared parts of Harf Kapmaca and Şarkıda Geçsin (docs/SPEC_V3.md §20.3–20.4; canvas: Aşama 6 ·
// Oyunlar): the big prompt, the letter board, "Söyledik" and "İtiraz", the objections left and the
// 3-second objection window. Props only; the game screens wire them.

// The board's letters (§20.8 7): the Turkish alphabet without Ğ, I, J, Ö, Ü, V. The server sends
// the board in game_state; this is for previews and the order.
export const BOARD_LETTERS = [
  'A',
  'B',
  'C',
  'Ç',
  'D',
  'E',
  'F',
  'G',
  'H',
  'İ',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'R',
  'S',
  'Ş',
  'T',
  'U',
  'Y',
  'Z',
] as const;

export const OBJECTIONS_PER_TABLE = 3;
export const OBJECTION_WINDOW_MS = 3000;

const COLUMNS = 6;
const GAP = SPACING[1];

// The prompt: a category (Harf Kapmaca) or a word (Şarkıda Geçsin), as big as it fits.
export function PromptCard({
  kind,
  prompt,
  line,
  compact,
}: {
  kind: 'category' | 'word';
  prompt: string;
  // Under the prompt: "Geçtiği bir şarkıdan bir dize söyleyin".
  line?: string;
  // Over the letter board: one line, smaller.
  compact?: boolean;
}) {
  const { colors, shape } = useTheme();
  const [bg, fg] =
    kind === 'category' ? [colors.calm, colors.onCalm] : [colors.buzz, colors.onBuzz];
  return (
    <View
      testID="say-prompt"
      accessible
      accessibilityLabel={`${kind === 'category' ? tr.say.category : tr.say.word}: ${prompt}`}
      className={compact ? 'items-center gap-1' : 'flex-1 items-center justify-center gap-2'}
      style={{
        paddingHorizontal: SPACING[5],
        paddingVertical: compact ? SPACING[4] : SPACING[8],
        borderRadius: shape.radius.lg + SPACING[2],
        backgroundColor: bg,
        borderWidth: Math.max(shape.stroke.feature, 2),
        borderColor: colors.border,
        boxShadow: shape.shadow.feature ?? undefined,
      }}
    >
      <Text variant="overline" color={fg}>
        {kind === 'category' ? tr.say.category : tr.say.word}
      </Text>
      <Text variant={compact ? 'title' : 'hero'} color={fg} align="center">
        {prompt}
      </Text>
      {line ? (
        <Text variant="bodyStrong" color={fg} align="center">
          {line}
        </Text>
      ) : null}
    </View>
  );
}

export type BoardLetter = { letter: string; closed: boolean };

// Harf Kapmaca's board: open letters as tiles, closed ones dashed and struck through. The playing
// table taps an open letter after saying its word; other phones see it read-only.
export function LetterBoard({
  letters,
  selected,
  onPick,
  disabled,
}: {
  letters: readonly BoardLetter[];
  selected?: string | null;
  onPick?: (letter: string) => void;
  disabled?: boolean;
}) {
  const { colors, shape } = useTheme();
  return (
    // Each sixth of the row is the touch area; the tile is drawn inside it, the gap split around it.
    <View
      testID="letter-board"
      className="flex-row flex-wrap"
      style={{ marginHorizontal: -GAP, rowGap: GAP * 2 }}
    >
      {letters.map(({ letter, closed }) => {
        const on = letter === selected;
        const off = closed || disabled || !onPick;
        return (
          <Pressable
            key={letter}
            testID={`letter-${letter}`}
            accessibilityRole="button"
            accessibilityLabel={closed ? tr.say.letterClosed(letter) : letter}
            accessibilityState={{ disabled: off, selected: on }}
            disabled={off}
            onPress={() => onPick?.(letter)}
            style={{ width: `${100 / COLUMNS}%`, paddingHorizontal: GAP }}
          >
            <View
              className="items-center justify-center"
              style={{
                aspectRatio: 1,
                borderRadius: shape.radius.md,
                backgroundColor: on ? colors.accent : closed ? 'transparent' : colors.surface,
                borderWidth: on
                  ? Math.max(shape.stroke.control, 2)
                  : closed
                    ? shape.stroke.hairline * 2
                    : 0,
                borderStyle: closed ? 'dashed' : 'solid',
                borderColor: on ? colors.border : colors.divider,
                boxShadow: closed || on ? undefined : shape.shadow.card,
              }}
            >
              <Text
                variant="title"
                tone={on ? 'onAccent' : closed ? 'muted' : 'text'}
                strike={closed}
              >
                {letter}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// The objections a table has left: three dots, the used ones quiet.
export function ObjectionsLeft({
  left,
  total = OBJECTIONS_PER_TABLE,
}: {
  left: number;
  total?: number;
}) {
  const { colors, shape } = useTheme();
  return (
    <View
      testID="objections-left"
      accessible
      accessibilityLabel={tr.say.objectionsLeft(left)}
      className="flex-row items-center gap-1"
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: SPACING[2.5],
            height: SPACING[2.5],
            borderRadius: shape.radius.pill,
            backgroundColor: i < left ? colors.danger : colors.surface2,
          }}
        />
      ))}
    </View>
  );
}

// The 3-second objection window on the other table: a draining bar with the seconds left.
export function ObjectionWindow({
  remainingMs,
  totalMs = OBJECTION_WINDOW_MS,
  left,
}: {
  remainingMs: number;
  totalMs?: number;
  // This table's objections left.
  left: number;
}) {
  const { colors, shape } = useTheme();
  const fraction = Math.max(0, Math.min(1, remainingMs / totalMs));
  const seconds = Math.ceil(Math.max(0, remainingMs) / 1000);
  return (
    <View
      testID="objection-window"
      className="gap-1.5"
      accessibilityRole="timer"
      accessibilityLabel={tr.say.windowLabel(seconds)}
    >
      <View className="flex-row items-center justify-between">
        <Text variant="label" tone="text">
          {tr.say.window(seconds)}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text variant="caption" tone="muted">
            {tr.say.objectionsShort(left)}
          </Text>
          <ObjectionsLeft left={left} />
        </View>
      </View>
      <View
        style={{
          height: SPACING[2.5],
          borderRadius: shape.radius.pill,
          backgroundColor: colors.surface2,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            borderRadius: shape.radius.pill,
            backgroundColor: colors.danger,
          }}
        />
      </View>
    </View>
  );
}

// "Söyledik": the playing table said its line (Şarkıda Geçsin).
export function SaidButton({
  onPress,
  disabled,
  loading,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      variant="success"
      size="lg"
      testID="say-said"
      label={tr.say.said}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
    />
  );
}

// "İtiraz" with the objections left; off when none are left or the window closed.
export function ObjectButton({
  left,
  onPress,
  disabled,
  loading,
}: {
  left: number;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      variant="danger"
      size="lg"
      testID="say-object"
      label={tr.say.object}
      detail={tr.say.objectionsShort(left)}
      accessibilityLabel={`${tr.say.object}, ${tr.say.objectionsLeft(left)}`}
      onPress={onPress}
      disabled={disabled || left <= 0}
      loading={loading}
    />
  );
}

// After an objection: "İtiraz!" and what it changed ("F açıldı · Yaratıcı Lokma +1").
export function ObjectionResult({ detail }: { detail: string }) {
  const { colors, shape } = useTheme();
  return (
    <View
      testID="objection-result"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className="items-center gap-1"
      style={{
        padding: SPACING[4],
        borderRadius: shape.radius.lg,
        backgroundColor: colors.danger,
        borderWidth: Math.max(shape.stroke.feature, 2),
        borderColor: colors.border,
        boxShadow: shape.shadow.feature ?? undefined,
      }}
    >
      <Text variant="display" tone="onDanger">
        {tr.say.objected}
      </Text>
      <Text variant="bodyStrong" tone="onDanger" align="center">
        {detail}
      </Text>
    </View>
  );
}
