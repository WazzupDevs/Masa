import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, TOUCH } from '@/theme/tokens';

import { Button, type IconName } from './Button';
import { Text } from './Text';

type Props = {
  icon: IconName;
  title?: string;
  body: string;
  action?: { label: string; onPress: () => void };
};

// Nothing to show yet: an icon disc, a short explanation and at most one action.
export function EmptyState({ icon, title, body, action }: Props) {
  const { colors, shape } = useTheme();
  return (
    <View className="items-center gap-3 py-8">
      <View
        className="items-center justify-center"
        style={{
          width: TOUCH.tab,
          height: TOUCH.tab,
          borderRadius: shape.radius.pill,
          backgroundColor: colors.surface2,
        }}
      >
        <Ionicons name={icon} size={ICON.lg} color={colors.muted} />
      </View>
      {title ? (
        <Text variant="heading" align="center">
          {title}
        </Text>
      ) : null}
      <Text tone="muted" align="center">
        {body}
      </Text>
      {action ? (
        <View className="mt-2 self-stretch">
          <Button variant="secondary" label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
    </View>
  );
}
