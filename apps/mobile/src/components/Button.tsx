import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { useQuiet } from './Quiet';
import { Text } from './Text';

// `dangerText`: a text-only button in the danger colour (Hesabımı sil).
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'dangerText';
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
  testID?: string;
  // A text-only button that lines up with the content's left edge ("Tekrar gönder").
  flush?: boolean;
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
  testID,
  flush,
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
    dangerText: { bg: 'transparent', fg: colors.danger },
  };
  const textOnly = variant === 'ghost' || variant === 'dangerText';
  let { bg, fg } = fills[variant];
  // A theme with heavy control strokes draws every button with the outline; otherwise only the
  // secondary one has it. Trust screens keep a hairline on the secondary button only.
  const outlined = shape.stroke.control > 1;
  let borderWidth = 0;
  let borderColor = 'transparent';
  if (variant === 'secondary') {
    borderWidth = quiet ? shape.stroke.hairline : shape.stroke.control;
    borderColor = quiet ? colors.divider : colors.border;
  } else if (!textOnly && outlined && !quiet) {
    borderWidth = shape.stroke.control;
    borderColor = colors.border;
  }
  let shadow =
    quiet || textOnly
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
    // With a detail ("Doğru +1" in half a row) the label needs the room more than the padding.
    gap: detail ? SPACING[1.5] : SPACING[2],
    paddingHorizontal: flush ? 0 : detail ? SPACING[3] : SPACING[5],
    justifyContent: flush ? 'flex-start' : 'center',
    paddingVertical: SPACING[2],
    minHeight: size === 'lg' ? TOUCH.large : TOUCH.button,
    borderRadius: shape.radius.md,
    backgroundColor: bg,
    borderWidth,
    borderColor,
    boxShadow: shadow,
  };

  // Pressed: the hard shadow goes and the button moves into its place. Disabled: a quiet fill,
  // muted text, no shadow.
  const pressOffset = shadow ? shape.stroke.control + 1 : 0;
  if (inactive && !tint) {
    bg = textOnly ? 'transparent' : colors.surface2;
    fg = colors.muted;
    borderColor = textOnly ? 'transparent' : colors.muted;
  }

  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? (detail ? `${label} ${detail}` : label)}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          style={[
            style,
            { backgroundColor: bg, borderColor },
            inactive
              ? { boxShadow: undefined, opacity: tint ? 0.4 : 1 }
              : pressed
                ? {
                    boxShadow: undefined,
                    transform: [{ translateX: pressOffset }, { translateY: pressOffset }],
                    opacity: shadow ? 1 : 0.85,
                  }
                : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={fg} />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={ICON.md} color={fg} /> : null}
              <View className="shrink flex-row items-baseline gap-1">
                <Text
                  variant={size === 'lg' ? 'buttonLarge' : 'button'}
                  color={fg}
                  align="center"
                  // With a detail ("Doğru +1") the label stays on one line and shrinks to fit a half
                  // width button instead of breaking inside the word.
                  numberOfLines={detail ? 1 : 2}
                  adjustsFontSizeToFit={!!detail}
                  minimumFontScale={0.7}
                  className="shrink"
                >
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
        </View>
      )}
    </Pressable>
  );
}
