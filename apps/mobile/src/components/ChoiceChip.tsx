import { Pressable } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = { label: string; selected: boolean; onPress: () => void };

// A square single-choice button for short values ("Masada kaç kişisiniz?" 1 / 2 / 3 / 4+).
export function ChoiceChip({ label, selected, onPress }: Props) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: TOUCH.tab,
        height: TOUCH.tab,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: shape.radius.md,
        borderWidth: selected ? 0 : Math.max(shape.stroke.control, 1),
        borderColor: colors.muted,
        backgroundColor: selected ? colors.accent : colors.surface,
        boxShadow: selected ? shape.shadow.primaryButton : undefined,
      }}
    >
      <Text variant="mark" tone={selected ? 'onAccent' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}
