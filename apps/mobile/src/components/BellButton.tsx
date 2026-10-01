import { Pressable, View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { TabIcon } from './Glyph';
import { Text } from './Text';

const BADGE = SPACING[4] + SPACING[0.5];

// The notification button at the top right of the tab screens (canvas: Aşama 5 · Geri bildirim):
// the bell on a surface disc, the count in a danger badge when there is something new.
export function BellButton({
  count,
  onPress,
  testID,
}: {
  count: number;
  onPress: () => void;
  testID?: string;
}) {
  const { colors, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? tr.notifications.withCount(count) : tr.notifications.title}
      onPress={onPress}
      testID={testID}
    >
      {({ pressed }) => (
        <View
          className="items-center justify-center"
          style={{
            width: TOUCH.min,
            height: TOUCH.min,
            borderRadius: shape.radius.pill,
            backgroundColor: pressed ? colors.surface2 : colors.surface,
          }}
        >
          <TabIcon name="bell" color={colors.text} />
          {count > 0 ? (
            <View
              className="absolute items-center justify-center"
              style={{
                top: -SPACING[0.5],
                right: -SPACING[0.5],
                minWidth: BADGE,
                height: BADGE,
                paddingHorizontal: SPACING[1],
                borderRadius: shape.radius.pill,
                backgroundColor: colors.danger,
              }}
            >
              <Text variant="caption" tone="onDanger">
                {count > 99 ? '99+' : String(count)}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}
