import { Image, Pressable, View } from 'react-native';

import { initials, TABLE_AVATAR_INK, tableAvatarOf } from '@/theme/avatar';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { TABLE_AVATAR_IMAGES } from './Glyph';
import { Text } from './Text';

// sm 32 (chat), md 40 (top bars), lg 48, xl 56 (list rows and room cards), hero 72 (the table card).
export const AVATAR_SIZE = {
  sm: SPACING[8],
  md: SPACING[10],
  lg: TOUCH.button,
  xl: SPACING[14],
  hero: SPACING[16] + SPACING[2],
} as const;

type Size = keyof typeof AVATAR_SIZE;

// The table icon's share of the disc.
const ICON_SHARE = 0.56;

type Props =
  // An anonymous table: a game-night icon on a coloured disc. `seed` picks them: the table session
  // id for the viewer's own table (the face stays for the whole check-in, a new name keeps it),
  // otherwise the alias. Never tappable (no profile).
  | { kind: 'table'; alias: string; seed?: string; size?: Size }
  // A profile: the photo, or the display name's initials. Tappable when it opens the profile card.
  | {
      kind: 'profile';
      name: string;
      photoUrl?: string | null;
      size?: Size;
      onPress?: () => void;
      accessibilityLabel?: string;
    };

// The face of a table or a person in chats, lists and cards (canvas: Aşama 1 · Son → Avatarlar;
// tables: Aşama 8 · Saha → Masa avatarları).
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
    const face = tableAvatarOf(props.seed ?? props.alias);
    const icon = Math.round(side * ICON_SHARE);
    return (
      <View
        accessible
        accessibilityLabel={props.alias}
        style={[frame, { backgroundColor: face.color }]}
      >
        <Image
          source={TABLE_AVATAR_IMAGES[face.icon]}
          accessible={false}
          style={{ width: icon, height: icon, tintColor: TABLE_AVATAR_INK }}
          resizeMode="contain"
        />
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
    <Text
      variant={side >= AVATAR_SIZE.lg ? (side >= AVATAR_SIZE.xl ? 'heading' : 'bodyStrong') : 'tag'}
      tone="onViolet"
    >
      {initials(props.name)}
    </Text>
  );
  const face = (
    <View style={[frame, { backgroundColor: props.photoUrl ? colors.surface2 : colors.violet }]}>
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
