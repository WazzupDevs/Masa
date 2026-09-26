import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { useQuiet } from './Quiet';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: 'md' | 'lg';
  icon?: IconName;
  // A short addition after the label ("+1", "2 hak").
  detail?: string;
  // Colours that are not theme tokens: only the reveal signal, filled or outlined.
  tint?: { background: string; foreground: string; outline?: boolean };
  accessibilityLabel?: string;
};

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'md',
  icon,
  detail,
  tint,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const quiet = useQuiet();
  const { colors, shape } = theme;
  const inactive = disabled || loading;

  const fills: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.surface, fg: colors.text },
    danger: { bg: colors.danger, fg: colors.onDanger },
    success: { bg: colors.success, fg: colors.onSuccess },
    ghost: { bg: 'transparent', fg: colors.muted },
  };
  let { bg, fg } = fills[variant];
  // Outlined directions (Oyun Gecesi) draw every button with the outline; the others only the
  // secondary one. Trust screens keep a hairline on the secondary button only.
  const outlined = shape.stroke.control > 1;
  let borderWidth = 0;
  let borderColor = 'transparent';
  if (variant === 'secondary') {
    borderWidth = quiet ? shape.stroke.hairline : shape.stroke.control;
    borderColor = quiet ? colors.divider : colors.border;
  } else if (variant !== 'ghost' && outlined && !quiet) {
    borderWidth = shape.stroke.control;
    borderColor = colors.border;
  }
  let shadow =
    quiet || variant === 'ghost'
      ? undefined
      : variant === 'primary'
        ? shape.shadow.primaryButton
        : shape.shadow.button;
  if (tint) {
    bg = tint.outline ? 'transparent' : tint.background;
    fg = tint.outline ? tint.background : tint.foreground;
    borderWidth = tint.outline ? shape.stroke.control : 0;
    borderColor = tint.outline ? tint.background : 'transparent';
    shadow = undefined;
  }

  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[2],
    paddingHorizontal: SPACING[5],
    minHeight: size === 'lg' ? TOUCH.large : TOUCH.button,
    borderRadius: shape.radius.md,
    backgroundColor: bg,
    borderWidth,
    borderColor,
    boxShadow: shadow,
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (detail ? `${label} ${detail}` : label)}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [style, { opacity: inactive ? 0.4 : pressed ? 0.85 : 1 }]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={ICON.md} color={fg} /> : null}
          <View className="flex-row items-baseline gap-1">
            <Text variant={size === 'lg' ? 'buttonLarge' : 'button'} color={fg} numberOfLines={1}>
              {label}
            </Text>
            {detail ? (
              <Text variant="buttonDetail" color={fg}>
                {detail}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </Pressable>
  );
}
