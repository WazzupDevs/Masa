import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { useDepth } from './Depth';
import { useQuiet } from './Quiet';
import { Text } from './Text';

// Roles (canvas: Aşama 8 · Saha → 3D düğme sistemi): primary purple ("Oda kur"), secondary orange
// ("Masanla oyna"), positive green ("Doğru", "Arkadaşlar"), danger red ("Odayı bitir"), neutral
// white (everything else that acts). All five have the 3D depth. `ghost` and `dangerText` are
// text-only (a link-like action; "Hesabımı sil").
export type ButtonVariant =
  'primary' | 'secondary' | 'positive' | 'danger' | 'neutral' | 'ghost' | 'dangerText';
export type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
  // sm: a header button ("Mekandan ayrıl"), 40 high with the touch area grown to 48.
  size?: 'sm' | 'md' | 'lg';
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
  // Only `icon`, in a round button as high as the size; the label is what screen readers say. For a
  // header button on a narrow screen ("Odayı bitir" at 320 dp).
  iconOnly?: boolean;
};

const SMALL_HEIGHT = SPACING[10];

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
  iconOnly,
}: Props) {
  const { colors, shape } = useTheme();
  const quiet = useQuiet();
  const depth = useDepth();
  const inactive = disabled || loading;

  const fills: Record<ButtonVariant, { bg: string; fg: string }> = {
    primary: { bg: colors.violet, fg: colors.onViolet },
    secondary: { bg: colors.event, fg: colors.onEvent },
    positive: { bg: colors.success, fg: colors.onSuccess },
    danger: { bg: colors.danger, fg: colors.onDanger },
    neutral: { bg: colors.raised, fg: colors.text },
    ghost: { bg: 'transparent', fg: colors.muted },
    dangerText: { bg: 'transparent', fg: colors.danger },
  };
  const textOnly = variant === 'ghost' || variant === 'dangerText';
  let { bg, fg } = fills[variant];
  if (inactive && !tint) {
    bg = textOnly ? 'transparent' : colors.surface2;
    fg = colors.muted;
  }
  // Trust screens keep a hairline on the neutral button only; everything else is flat there.
  const quietEdge: ViewStyle =
    quiet && variant === 'neutral'
      ? { borderWidth: shape.stroke.hairline, borderColor: colors.divider }
      : {};
  const outline: ViewStyle | undefined = tint?.outline
    ? { borderWidth: shape.stroke.control, borderColor: tint.background }
    : undefined;
  if (tint) {
    bg = tint.outline ? 'transparent' : tint.background;
    fg = tint.outline ? tint.background : tint.foreground;
  }
  const small = size === 'sm';

  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    // With a detail ("Doğru +1" in half a row) the label needs the room more than the padding.
    gap: detail || small ? SPACING[1.5] : SPACING[2],
    paddingHorizontal: flush
      ? 0
      : small
        ? SPACING[3] + SPACING[0.5]
        : detail || tight
          ? SPACING[3]
          : SPACING[5],
    justifyContent: flush ? 'flex-start' : 'center',
    paddingVertical: small ? SPACING[1] : SPACING[2],
    minHeight: small ? SMALL_HEIGHT : size === 'lg' ? TOUCH.large : TOUCH.button,
    borderRadius: shape.radius.pill,
    backgroundColor: bg,
  };
  if (iconOnly) {
    style.width = style.minHeight;
    style.paddingHorizontal = 0;
  }

  const oneLine = !!detail || !!tight || small || !/\s/.test(label.trim());
  // The 3D depth on every filled button; text-only and reveal-signal buttons have none.
  const raised = !textOnly && !tint;

  return (
    <Pressable
      accessibilityRole="button"
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? (detail ? `${label} ${detail}` : label)}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      // The small button's face is 40 high; its touch area is 48.
      hitSlop={small ? (TOUCH.button - SMALL_HEIGHT) / 2 : undefined}
    >
      {({ pressed }) => (
        <View
          style={[
            style,
            raised ? (quiet ? quietEdge : depth({ pressed, inactive })) : outline,
            tint && inactive ? { opacity: 0.4 } : null,
            textOnly && pressed ? { opacity: 0.7 } : null,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={fg} />
          ) : iconOnly && icon ? (
            <Ionicons name={icon} size={ICON.md} color={fg} />
          ) : (
            <>
              {icon ? <Ionicons name={icon} size={ICON.md} color={fg} /> : null}
              <View
                className={stack ? 'shrink items-center' : 'shrink flex-row items-baseline gap-1'}
              >
                <Text
                  variant={small ? 'buttonSmall' : size === 'lg' ? 'buttonLarge' : 'button'}
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
