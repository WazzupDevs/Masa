import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { Text } from './Text';

type Props = { secondsLeft: number; totalSeconds: number; label: string };

// A thin bar and the seconds left: the join request window, "Tanışalım mı?".
export function Countdown({ secondsLeft, totalSeconds, label }: Props) {
  const { colors, shape } = useTheme();
  const share = totalSeconds > 0 ? Math.min(1, Math.max(0, secondsLeft / totalSeconds)) : 0;
  return (
    <View
      className="flex-row items-center gap-2.5 self-stretch"
      accessibilityRole="timer"
      accessibilityLabel={label}
    >
      <View
        className="flex-1 overflow-hidden"
        style={{
          height: SPACING[1.5],
          borderRadius: shape.radius.pill,
          backgroundColor: colors.surface2,
        }}
      >
        <View
          style={{
            width: `${share * 100}%`,
            height: '100%',
            borderRadius: shape.radius.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>
      <Text variant="label">{label}</Text>
    </View>
  );
}
