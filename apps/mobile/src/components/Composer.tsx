import { Ionicons } from '@expo/vector-icons';
import { forwardRef, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { typeStyle, useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING, TOUCH } from '@/theme/tokens';

import { usePressScale } from './motion';
import { Text } from './Text';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  maxLength: number;
  onSend: () => void;
  // The send button's name for screen readers and tests ("Gönder").
  sendLabel: string;
  sendDisabled?: boolean;
  sending?: boolean;
  // Right-aligned over the field while typing ("12/200").
  counter?: string;
  // A compact row over the field: the venue chat's "Profilimle yaz" switch.
  above?: ReactNode;
  inputTestID?: string;
  sendTestID?: string;
};

// The message bar of a chat screen (canvas: Aşama 4 · Yenileme): fixed at the bottom on a hairline,
// a pill field and a round send button in the accent colour.
export const Composer = forwardRef<TextInput, Props>(function Composer(
  {
    value,
    onChangeText,
    placeholder,
    maxLength,
    onSend,
    sendLabel,
    sendDisabled,
    sending,
    counter,
    above,
    inputTestID,
    sendTestID,
  },
  ref,
) {
  const theme = useTheme();
  const { colors, shape } = theme;
  const pressScale = usePressScale();
  const inactive = sendDisabled || sending;
  return (
    <View
      style={{
        paddingHorizontal: shape.screenPadding - SPACING[1],
        paddingTop: above ? SPACING[1] : SPACING[2.5],
        paddingBottom: SPACING[2.5],
        gap: SPACING[1.5],
        backgroundColor: colors.canvas,
        borderTopWidth: shape.stroke.hairline,
        borderTopColor: colors.divider,
      }}
    >
      {above}
      <View className="flex-row items-end gap-2.5">
        <View
          className="flex-1 justify-center"
          style={{
            minHeight: TOUCH.button,
            borderRadius: shape.radius.lg,
            backgroundColor: colors.raised,
            borderWidth: shape.stroke.hairline,
            borderColor: colors.divider,
            paddingHorizontal: SPACING[4],
          }}
        >
          <TextInput
            ref={ref}
            testID={inputTestID}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            maxLength={maxLength}
            multiline
            style={[
              typeStyle(theme, 'body'),
              { color: colors.text, paddingVertical: SPACING[2.5], maxHeight: SPACING[16] * 2 },
            ]}
          />
        </View>
        <Pressable
          testID={sendTestID}
          accessibilityRole="button"
          accessibilityLabel={sendLabel}
          accessibilityState={{ disabled: !!inactive, busy: !!sending }}
          disabled={inactive}
          onPress={onSend}
        >
          {({ pressed }) => (
            <View
              style={[
                {
                  width: TOUCH.button,
                  height: TOUCH.button,
                  borderRadius: shape.radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: inactive ? colors.surface2 : colors.accent,
                },
                pressScale(pressed),
              ]}
            >
              {sending ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <Ionicons
                  name="send"
                  size={ICON.md}
                  color={inactive ? colors.muted : colors.onAccent}
                />
              )}
            </View>
          )}
        </Pressable>
      </View>
      {counter ? (
        <Text variant="fine" align="right">
          {counter}
        </Text>
      ) : null}
    </View>
  );
});
