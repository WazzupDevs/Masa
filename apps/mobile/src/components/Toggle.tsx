import { Pressable, View } from 'react-native';

import { switchColors } from '@/theme/switch';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

import { Text } from './Text';

type Props = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  // A line under the label that says what the choice does.
  hint?: string;
  disabled?: boolean;
  // A small switch first, the label and the hint on one line (over a chat's message field).
  compact?: boolean;
  testID?: string;
};

// The canvas switch: a 52 × 32 outlined track and an outlined thumb (`switchColors`).
const TRACK = { width: SPACING[12] + SPACING[1], height: SPACING[8] } as const;
const THUMB = SPACING[5] + SPACING[0.5];
const TRACK_COMPACT = { width: SPACING[10], height: SPACING[6] } as const;
const THUMB_COMPACT = SPACING[4];

// A labelled on/off switch (canvas: "Profilimle yaz"). The whole row toggles, so the label is as
// good a target as the switch; screen readers hear one switch.
export function Toggle({ label, value, onChange, hint, disabled, compact, testID }: Props) {
  const { colors, shape } = useTheme();
  const c = switchColors(colors, value);
  const track = compact ? TRACK_COMPACT : TRACK;
  const thumb = compact ? THUMB_COMPACT : THUMB;
  const knob = (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: track.width,
        height: track.height,
        borderRadius: shape.radius.pill,
        borderWidth: shape.stroke.control,
        borderColor: c.trackBorder,
        backgroundColor: c.track,
        paddingHorizontal: SPACING[0.5],
        justifyContent: 'center',
        alignItems: value ? 'flex-end' : 'flex-start',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <View
        style={{
          width: thumb,
          height: thumb,
          borderRadius: shape.radius.pill,
          borderWidth: shape.stroke.control,
          borderColor: c.thumbBorder,
          backgroundColor: c.thumb,
        }}
      />
    </View>
  );
  if (compact) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled: !!disabled }}
        disabled={disabled}
        onPress={() => onChange(!value)}
        className="flex-row items-center gap-2.5"
        style={{ minHeight: TOUCH.min }}
      >
        {knob}
        <Text variant="label" tone="text">
          {label}
        </Text>
        {hint ? (
          <View className="flex-1">
            <Text variant="fine" numberOfLines={1}>
              {hint}
            </Text>
          </View>
        ) : null}
      </Pressable>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      className="flex-row items-center gap-3"
      style={{ minHeight: TOUCH.min }}
    >
      <View className="flex-1">
        <Text variant="bodyStrong">{label}</Text>
        {hint ? <Text variant="fine">{hint}</Text> : null}
      </View>
      {knob}
    </Pressable>
  );
}
