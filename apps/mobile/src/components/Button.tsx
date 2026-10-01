import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { usePressScale } from './motion';
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
  // The detail under the label, for three buttons in a row (cooperative Tabu: "Doğru" over "+1").
  stack?: boolean;
  // Half a row ("Oda kur" | "Masanla oyna"): tighter padding and the label kept on one line.
  tight?: boolean;
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
  stack,
  tight,
}: Props) {
  const theme = useTheme();
  const quiet = useQuiet();
  const pressScale = usePressScale();
  const { colors, shape } = theme;
  const inactive = disabled || loading;

  const fills: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: colors.accent, fg: colors.onAccent },
    secondary: { bg: colors.raised, fg: colors.text },
    danger: { bg: colors.danger, fg: colors.onDanger },
    success: { bg: colors.success, fg: colors.onSuccess },
    ghost: { bg: 'transparent', fg: colors.muted },
    dangerText: { bg: 'transparent', fg: colors.danger },
  };
  const textOnly = variant === 'ghost' || variant === 'dangerText';
  let { bg, fg } = fills[variant];
  // Only the primary button carries the outline and the hard shadow; the secondary one is a soft
  // pill lifted off the ground. Trust screens keep a hairline on the secondary button only.
  let borderWidth = 0;
  let borderColor = 'transparent';
  if (variant === 'secondary' && quiet) {
    borderWidth = shape.stroke.hairline;
    borderColor = colors.divider;
  } else if (variant === 'primary' && !quiet) {
    borderWidth = shape.stroke.feature;
    borderColor = colors.border;
  }
  let shadow =
    quiet || textOnly
      ? undefined
      : variant === 'primary'
        ? shape.shadow.primaryButton
        : variant === 'secondary'
          ? shape.shadow.card
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
    paddingHorizontal: flush ? 0 : detail || tight ? SPACING[3] : SPACING[5],
    justifyContent: flush ? 'flex-start' : 'center',
    paddingVertical: SPACING[2],
    minHeight: size === 'lg' ? TOUCH.large : TOUCH.button,
    borderRadius: shape.radius.pill,
    backgroundColor: bg,
    borderWidth,
    borderColor,
    boxShadow: shadow,
  };

  // Pressed: the primary button's hard shadow goes and the button moves into its place; the others
  // shrink a little. Disabled: a quiet fill, muted text, no shadow.
  const oneLine = !!detail || !!tight || !/\s/.test(label.trim());
  const hard = variant === 'primary' && !!shadow;
  const pressOffset = hard ? shape.stroke.feature + 1 : 0;
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
                ? hard
                  ? {
                      boxShadow: undefined,
                      transform: [{ translateX: pressOffset }, { translateY: pressOffset }],
                    }
                  : [{ boxShadow: undefined, opacity: textOnly ? 0.7 : 1 }, pressScale(true)]
                : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={fg} />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={ICON.md} color={fg} /> : null}
              <View
                className={stack ? 'shrink items-center' : 'shrink flex-row items-baseline gap-1'}
              >
                <Text
                  variant={size === 'lg' ? 'buttonLarge' : 'button'}
                  color={fg}
                  align="center"
                  // A single word or a label with a detail ("Doğru +1") stays on one line and
                  // shrinks to fit instead of breaking inside the word.
                  numberOfLines={oneLine ? 1 : 2}
                  adjustsFontSizeToFit={oneLine}
                  minimumFontScale={0.7}
                  className="shrink"
                >
                  {label}
                </Text>
                {detail ? (
                  <Text
                    variant="buttonDetail"
                    color={fg}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                  >
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
