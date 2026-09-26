import { forwardRef, useState } from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { AA_LARGE, contrastRatio } from '@/theme/contrast';
import { typeStyle, useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = Omit<TextInputProps, 'style' | 'placeholderTextColor'> & {
  label?: string;
  hint?: string;
  error?: string | null;
  // Fixed text before the field ("+90").
  prefix?: string;
  // Right-aligned under the field ("12/160").
  counter?: string;
  // The one-time code: large, centered, spaced digits.
  code?: boolean;
  // A multi-line field that starts several lines high (the bio).
  tall?: boolean;
};

// A text field. Its outline is the direction's border where that reads 3:1 against the surface
// (Oyun Gecesi), the secondary text colour otherwise; focus draws it in the accent.
export const Input = forwardRef<TextInput, Props>(function Input(
  { label, hint, error, prefix, counter, code, tall, multiline, ...rest },
  ref,
) {
  const theme = useTheme();
  const { colors, shape } = theme;
  const [focused, setFocused] = useState(false);
  const outline =
    contrastRatio(colors.border, colors.surface) >= AA_LARGE ? colors.border : colors.muted;

  return (
    <View className="gap-2">
      {label ? <Text variant="label">{label}</Text> : null}
      <View
        className="flex-row items-center"
        style={{
          minHeight: TOUCH.button,
          borderRadius: shape.radius.md,
          borderWidth: focused ? Math.max(shape.stroke.control, 2) : shape.stroke.control,
          borderColor: error ? colors.danger : focused ? colors.accent : outline,
          backgroundColor: colors.surface,
          paddingHorizontal: SPACING[4],
        }}
      >
        {prefix ? (
          <Text tone="muted" className="mr-2">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          ref={ref}
          {...rest}
          multiline={multiline}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[
            typeStyle(theme, code ? 'title' : 'body'),
            {
              flex: 1,
              color: colors.text,
              paddingVertical: SPACING[3],
              minHeight: tall ? TOUCH.large + SPACING[8] : undefined,
            },
            code ? { textAlign: 'center', letterSpacing: SPACING[2] } : null,
          ]}
        />
      </View>
      {error ? (
        <Text variant="fine" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {hint || counter ? (
        <View className="flex-row justify-between gap-3">
          <Text variant="fine" className="flex-1">
            {hint ?? ''}
          </Text>
          {counter ? <Text variant="fine">{counter}</Text> : null}
        </View>
      ) : null}
    </View>
  );
});
