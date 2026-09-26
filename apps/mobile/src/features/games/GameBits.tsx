import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { type IconName } from '@/components/Button';
import { Card } from '@/components/Card';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

// The turn clock pill ("0:37").
export function ClockPill({ seconds }: { seconds: number }) {
  const { colors, shape } = useTheme();
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={tr.games.clockLabel(seconds)}
      className="flex-row items-center gap-1.5"
      style={{
        minHeight: TOUCH.min - SPACING[2],
        paddingHorizontal: SPACING[3],
        borderRadius: shape.radius.pill,
        backgroundColor: colors.surface2,
        borderWidth: shape.stroke.control > 1 ? shape.stroke.control : 0,
        borderColor: colors.border,
      }}
    >
      <Ionicons name="time-outline" size={ICON.sm} color={colors.text} />
      <Text variant="bodyStrong" tabular>
        {tr.games.clock(seconds)}
      </Text>
    </View>
  );
}

// A team's score. The describing team is ringed in the accent, or filled like a sticker in
// Oyun Gecesi.
export function TeamScore({
  name,
  note,
  score,
  active,
}: {
  name: string;
  note: string;
  score: number;
  active: boolean;
}) {
  const { colors, shape } = useTheme();
  const fill = active && shape.selectedTeam === 'fill';
  const fg = fill ? colors.onBuzz : colors.text;
  return (
    <View
      className="flex-1 gap-0.5"
      style={{
        paddingHorizontal: SPACING[3],
        paddingVertical: SPACING[2.5],
        borderRadius: shape.radius.md,
        backgroundColor: fill ? colors.buzz : colors.surface,
        borderWidth:
          active && !fill ? Math.max(shape.stroke.control, 2) : Math.max(shape.stroke.card, 1),
        borderColor: active && !fill ? colors.accent : colors.border,
        boxShadow: shape.shadow.card,
      }}
    >
      <Text variant="label" color={fg} numberOfLines={1}>
        {name}
      </Text>
      <Text variant="fine" color={fill ? colors.onBuzz : colors.muted}>
        {note}
      </Text>
      <Text variant="score" color={fg}>
        {String(score)}
      </Text>
    </View>
  );
}

// "Hakem sizsiniz …": the role note above the card.
export function RoleNote({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useTheme();
  return (
    <Card tone="note">
      <View className="flex-row items-start gap-2">
        <Ionicons name={icon} size={ICON.md} color={colors.text} />
        <Text className="flex-1">{text}</Text>
      </View>
    </Card>
  );
}
