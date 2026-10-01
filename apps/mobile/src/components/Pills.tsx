import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { usePressScale } from './motion';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string; testID?: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

// A row of pills, one chosen (canvas: Oda kur → Niyetin): the chosen one filled in the text colour,
// the others soft. Short labels only.
export function Pills<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors, shape } = useTheme();
  const pressScale = usePressScale();
  return (
    <View accessibilityRole="radiogroup" className="flex-row gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={o.testID}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            className="flex-1"
          >
            {({ pressed }) => (
              <View
                className="items-center justify-center"
                style={[
                  {
                    minHeight: TOUCH.button,
                    paddingHorizontal: SPACING[2],
                    borderRadius: shape.radius.pill,
                    backgroundColor: on ? colors.text : colors.raised,
                    boxShadow: on ? undefined : shape.shadow.card,
                  },
                  pressScale(pressed),
                ]}
              >
                <Text
                  variant="button"
                  color={on ? colors.canvas : colors.text}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {o.label}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
