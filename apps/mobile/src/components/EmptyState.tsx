import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { Button, type IconName } from './Button';
import { Snail } from './Snail';
import { Text } from './Text';

type Props = {
  // An icon in a disc, or the brand snail (errors, "update required", empty lists).
  icon?: IconName;
  snail?: boolean;
  title?: string;
  body: string;
  action?: { label: string; onPress: () => void };
};

// Nothing to show yet: an icon disc, a short explanation and at most one action.
export function EmptyState({ icon, snail, title, body, action }: Props) {
  const { colors, shape } = useTheme();
  return (
    <View className="items-center gap-3 py-8">
      {snail ? <Snail height={SPACING[16] + SPACING[4]} /> : null}
      {icon ? (
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
      ) : null}
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
