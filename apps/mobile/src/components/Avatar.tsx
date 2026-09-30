import { Image, Pressable, View } from 'react-native';

import { aliasColor, initials } from '@/theme/avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { Snail } from './Snail';
import { Text } from './Text';

export const AVATAR_SIZE = { sm: SPACING[8], md: SPACING[10], lg: TOUCH.button } as const;

type Size = keyof typeof AVATAR_SIZE;

type Props =
  // An anonymous table: the snail on a disc coloured by its alias. Never tappable (no profile).
  | { kind: 'table'; alias: string; size?: Size }
  // A profile: the photo, or the display name's initials. Tappable when it opens the profile card.
  | {
      kind: 'profile';
      name: string;
      photoUrl?: string | null;
      size?: Size;
      onPress?: () => void;
      accessibilityLabel?: string;
    };

// The face of a table or a person in chats, lists and cards (canvas: Aşama 1 · Son → Avatarlar).
export function Avatar(props: Props) {
  const { colors, shape } = useTheme();
  const side = AVATAR_SIZE[props.size ?? 'md'];
  const frame = {
    width: side,
    height: side,
    borderRadius: shape.radius.pill,
    borderWidth: shape.stroke.card,
    borderColor: colors.border,
    overflow: 'hidden' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (props.kind === 'table') {
    return (
      <View
        accessible
        accessibilityLabel={props.alias}
        style={[frame, { backgroundColor: aliasColor(props.alias) }]}
      >
        <Snail variant="small" height={side * 0.46} />
      </View>
    );
  }

  const inner = props.photoUrl ? (
    <Image
      source={{ uri: props.photoUrl }}
      accessibilityIgnoresInvertColors
      style={{ width: side, height: side }}
    />
  ) : (
    <Text variant={props.size === 'lg' ? 'bodyStrong' : 'tag'} tone="onAccent">
      {initials(props.name)}
    </Text>
  );
  const face = (
    <View style={[frame, { backgroundColor: props.photoUrl ? colors.surface2 : colors.accent }]}>
      {inner}
    </View>
  );
  if (!props.onPress) {
    return (
      <View accessible accessibilityLabel={props.accessibilityLabel ?? props.name}>
        {face}
      </View>
    );
  }
  // The avatar is small; the pressable area is at least 44.
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? props.name}
      onPress={props.onPress}
      hitSlop={Math.max(0, (TOUCH.min - side) / 2)}
    >
      {face}
    </Pressable>
  );
}
