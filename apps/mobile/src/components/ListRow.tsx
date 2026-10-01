import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { usePressScale } from './motion';
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
  // A card of its own (Keşfet venues, friends, room lists): a picture on the left, the name and one
  // line in the middle, a status chip on the right. Otherwise a row on a hairline (settings).
  card?: boolean;
  testID?: string;
};

// A list row: as a card, or on a hairline.
export function ListRow({
  title,
  meta,
  below,
  leading,
  trailing,
  onPress,
  accessibilityRole = 'button',
  card,
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const pressScale = usePressScale();
  const content = (
    <>
      {leading}
      <View className={card ? 'flex-1 gap-0.5' : 'flex-1 gap-1'}>
        <Text variant="bodyStrong" numberOfLines={card ? 1 : undefined}>
          {title}
        </Text>
        {meta ? (
          <Text variant="fine" numberOfLines={card ? 1 : undefined}>
            {meta}
          </Text>
        ) : null}
        {below}
      </View>
      {trailing ? (
        // Centred beside the text (a tag aligns itself to the top of a row otherwise).
        <View className="justify-center">{trailing}</View>
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={ICON.md} color={colors.muted} />
      ) : null}
    </>
  );
  const style = card
    ? {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: SPACING[3] + SPACING[0.5],
        minHeight: TOUCH.large + SPACING[3],
        padding: SPACING[3],
        borderRadius: shape.radius.lg,
        backgroundColor: colors.surface,
        boxShadow: shape.shadow.card,
      }
    : {
        flexDirection: 'row' as const,
        alignItems: 'center' as const,
        gap: SPACING[3],
        minHeight: TOUCH.large,
        paddingVertical: SPACING[3],
        borderBottomWidth: shape.stroke.hairline,
        borderBottomColor: colors.divider,
      };
  if (!onPress)
    return (
      <View style={style} testID={testID}>
        {content}
      </View>
    );
  return (
    <Pressable accessibilityRole={accessibilityRole} onPress={onPress} testID={testID}>
      {({ pressed }) => (
        <View style={[style, card ? pressScale(pressed) : pressed ? { opacity: 0.7 } : null]}>
          {content}
        </View>
      )}
    </Pressable>
  );
}
