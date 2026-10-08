import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { TOUCH } from '@/theme/tokens';

import { useDepth } from './Depth';
import { Text } from './Text';

type Props = { label: string; selected: boolean; onPress: () => void; testID?: string };

// A square single-choice button for short values ("Masada kaç kişisiniz?" 1 / 2 / 3 / 4+).
export function ChoiceChip({ label, selected, onPress, testID }: Props) {
  const { colors, shape } = useTheme();
  const depth = useDepth();
  // 3D like the buttons; the chosen value stays pressed in (canvas: Aşama 8 · Saha).
  return (
    <Pressable
      accessibilityRole="radio"
      testID={testID}
      accessibilityState={{ selected }}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          style={[
            {
              width: TOUCH.tab,
              height: TOUCH.tab,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: shape.radius.md,
              backgroundColor: selected ? colors.violet : colors.raised,
            },
            depth({ pressed: pressed || selected }),
          ]}
        >
          <Text variant="mark" tone={selected ? 'onViolet' : 'text'}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
