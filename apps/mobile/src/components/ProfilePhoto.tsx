import { Ionicons } from '@expo/vector-icons';
import { Image, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

// Row avatar (48) and profile head (104, the mockup's size).
const SIZES = { small: TOUCH.button, large: 104 } as const;

type Props = { url: string | null; name?: string | null; size?: keyof typeof SIZES };

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
}

// The profile photo, or the initials on the accent colour when there is none.
export function ProfilePhoto({ url, name, size = 'large' }: Props) {
  const { colors, shape } = useTheme();
  const side = SIZES[size];
  const frame = { width: side, height: side, borderRadius: shape.radius.pill };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        accessibilityIgnoresInvertColors
        style={[frame, { backgroundColor: colors.surface2 }]}
      />
    );
  }
  const letters = name ? initials(name) : '';
  return (
    <View
      className="items-center justify-center"
      style={[frame, { backgroundColor: letters ? colors.accent : colors.surface2 }]}
    >
      {letters ? (
        <Text variant={size === 'large' ? 'alias' : 'bodyStrong'} tone="onAccent">
          {letters}
        </Text>
      ) : (
        <Ionicons
          name="person"
          size={size === 'large' ? SPACING[12] : SPACING[6]}
          color={colors.muted}
        />
      )}
    </View>
  );
}
