import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { usePressScale } from '@/components/motion';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

// "Geri dön" over the profile photo (canvas: Profil kartı): a pill on the surface colour.
export function BackPill() {
  const { colors, shape } = useTheme();
  const pressScale = usePressScale();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.back()}>
      {({ pressed }) => (
        <View
          className="flex-row items-center gap-1"
          style={[
            {
              minHeight: TOUCH.min,
              paddingLeft: SPACING[2.5],
              paddingRight: SPACING[4],
              borderRadius: shape.radius.pill,
              backgroundColor: colors.surface,
              boxShadow: shape.shadow.card,
            },
            pressScale(pressed),
          ]}
        >
          <Ionicons name="chevron-back" size={ICON.md} color={colors.text} />
          <Text variant="button">{tr.profile.back}</Text>
        </View>
      )}
    </Pressable>
  );
}
