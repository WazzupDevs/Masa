import { Ionicons } from '@expo/vector-icons';
import { View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, SPACING } from '@/theme/tokens';

import type { IconName } from './Button';
import { useQuiet } from './Quiet';
import { Text } from './Text';

export type TagVariant =
  | 'calm'
  | 'lively'
  | 'buzz'
  | 'event'
  | 'neutral' // headcount, participation, badges
  | 'profiled'
  | 'accent'; // counters: new requests, unread

type Props = { label: string; variant?: TagVariant; icon?: IconName };

// A pill label. Oyun Gecesi outlines it and tilts the event sticker; Gece Kafe dashes the
// "profilli" outline. On trust screens it sits still.
export function Tag({ label, variant = 'neutral', icon }: Props) {
  const theme = useTheme();
  const quiet = useQuiet();
  const { colors, shape } = theme;

  const fill: Record<TagVariant, { bg: string; fg: string }> = {
    calm: { bg: colors.calm, fg: colors.onCalm },
    lively: { bg: colors.lively, fg: colors.onLively },
    buzz: { bg: colors.buzz, fg: colors.onBuzz },
    event: { bg: colors.event, fg: colors.onEvent },
    neutral: { bg: colors.surface2, fg: colors.text },
    profiled: { bg: colors.surface2, fg: colors.text },
    accent: { bg: colors.accent, fg: colors.onAccent },
  };
  const { bg, fg } = fill[variant];
  const outline = variant === 'profiled' ? Math.max(shape.stroke.tag, 1) : shape.stroke.tag;
  const tilt = variant === 'event' && !quiet ? theme.eventTagTilt : 0;

  return (
    <View
      className="flex-row items-center gap-1 self-start"
      style={{
        backgroundColor: bg,
        borderRadius: shape.radius.pill,
        paddingHorizontal: SPACING[2.5],
        paddingVertical: SPACING[1],
        borderWidth: quiet ? Math.min(outline, shape.stroke.hairline) : outline,
        borderColor: quiet ? colors.divider : colors.border,
        borderStyle: variant === 'profiled' && theme.profiledTagDashed ? 'dashed' : 'solid',
        transform: tilt ? [{ rotate: `${tilt}deg` }] : undefined,
      }}
    >
      {icon ? <Ionicons name={icon} size={ICON.sm} color={fg} /> : null}
      <Text variant={variant === 'neutral' ? 'label' : 'tag'} color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
