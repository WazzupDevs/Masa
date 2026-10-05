import { View } from 'react-native';

import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

export type SeatState = 'idle' | 'current' | 'done';

// A seat label ("A1", "B2"): the owner table's seats in calm, the guest table's in lively; the
// current seat in the accent with the outline, a finished one quiet with a tick. A label only, never
// an identity (docs/SPEC_V3.md §20.1, rule 4).
export function SeatBadge({
  seat,
  state = 'idle',
  size = SPACING[12],
}: {
  seat: string;
  state?: SeatState;
  size?: number;
}) {
  const { colors, shape } = useTheme();
  const owner = seat.startsWith('A');
  const [bg, fg] =
    state === 'current'
      ? [colors.accent, colors.onAccent]
      : state === 'done'
        ? [colors.surface2, colors.muted]
        : owner
          ? [colors.calm, colors.onCalm]
          : [colors.lively, colors.onLively];
  return (
    <View
      accessible
      accessibilityLabel={state === 'done' ? tr.sahtekar.seatDone(seat) : seat}
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: shape.radius.pill,
        backgroundColor: bg,
        borderWidth: state === 'current' ? Math.max(shape.stroke.control, 2) : 0,
        borderColor: colors.border,
      }}
    >
      <Text variant={size >= SPACING[16] ? 'hero' : 'mark'} color={fg}>
        {state === 'done' ? '✓' : seat}
      </Text>
    </View>
  );
}
