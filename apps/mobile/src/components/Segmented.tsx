import { Ionicons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import type { IconName } from './Button';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string; icon?: IconName };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

// A pill switch (Keşfet list/map, the design picker).
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const { colors, shape } = useTheme();
  const outlined = shape.stroke.control > 1;
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row self-start"
      style={{
        padding: SPACING[0.5],
        gap: SPACING[0.5],
        borderRadius: shape.radius.pill,
        backgroundColor: colors.surface2,
        borderWidth: outlined ? shape.stroke.control : 0,
        borderColor: colors.border,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACING[1],
              minHeight: TOUCH.min,
              paddingHorizontal: SPACING[3],
              borderRadius: shape.radius.pill,
              backgroundColor: on ? colors.surface : 'transparent',
              boxShadow: on && !outlined ? '0px 1px 3px rgba(0, 0, 0, 0.15)' : undefined,
            }}
          >
            {o.icon ? (
              <Ionicons name={o.icon} size={ICON.sm} color={on ? colors.text : colors.muted} />
            ) : null}
            <Text variant="tag" tone={on ? 'text' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
