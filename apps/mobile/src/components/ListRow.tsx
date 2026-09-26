import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = {
  title: string;
  meta?: string;
  // Tags, a badge or a switch under or beside the title.
  below?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityRole?: 'button' | 'link';
};

// A row on a hairline: Keşfet venues, friends, settings links.
export function ListRow({
  title,
  meta,
  below,
  leading,
  trailing,
  onPress,
  accessibilityRole = 'button',
}: Props) {
  const { colors, shape } = useTheme();
  const content = (
    <>
      {leading}
      <View className="flex-1 gap-1">
        <Text variant="bodyStrong">{title}</Text>
        {meta ? <Text variant="fine">{meta}</Text> : null}
        {below}
      </View>
      {trailing ??
        (onPress ? <Ionicons name="chevron-forward" size={ICON.md} color={colors.muted} /> : null)}
    </>
  );
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: SPACING[3],
    minHeight: TOUCH.large,
    paddingVertical: SPACING[3],
    borderBottomWidth: shape.stroke.hairline,
    borderBottomColor: colors.divider,
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      onPress={onPress}
      style={({ pressed }) => [style, pressed ? { opacity: 0.7 } : null]}
    >
      {content}
    </Pressable>
  );
}
