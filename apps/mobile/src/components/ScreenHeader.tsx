import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { ICON } from '@/theme/tokens';

import type { IconName } from './Button';
import { IconButton } from './IconButton';
import { Text } from './Text';

type Props = {
  title: string;
  eyebrow?: string;
  eyebrowIcon?: IconName;
  subtitle?: string;
  onBack?: () => void;
  action?: { icon: IconName; label: string; onPress: () => void };
  // Anything else on the title row (the Keşfet list/map switch).
  trailing?: React.ReactNode;
};

// The top of a screen: optional back button, eyebrow, the title (h1) with an action on the right,
// and a subtitle.
export function ScreenHeader({
  title,
  eyebrow,
  eyebrowIcon,
  subtitle,
  onBack,
  action,
  trailing,
}: Props) {
  const { colors } = useTheme();
  return (
    <View className="mb-2">
      {onBack ? (
        <View className="-ml-3 mb-1 self-start">
          <IconButton icon="chevron-back" label={tr.common.back} onPress={onBack} />
        </View>
      ) : null}
      {eyebrow ? (
        <View className="mb-1.5 mt-1 flex-row items-center gap-1.5">
          {eyebrowIcon ? <Ionicons name={eyebrowIcon} size={ICON.sm} color={colors.muted} /> : null}
          <Text variant="eyebrow">{eyebrow}</Text>
        </View>
      ) : null}
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="display" accessibilityRole="header" className="flex-1">
          {title}
        </Text>
        {trailing}
        {action ? (
          <View className="-mr-3">
            <IconButton icon={action.icon} label={action.label} onPress={action.onPress} />
          </View>
        ) : null}
      </View>
      {subtitle ? (
        <Text variant="subtitle" className="mt-1">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
