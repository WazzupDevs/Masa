import type { ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { useQuiet } from './Quiet';

type DepthState = {
  pressed?: boolean;
  // Disabled or closed: no shadow, a quiet outline in the divider colour (the face sits flat).
  inactive?: boolean;
};

// The 3D look of every button and game control (canvas: Aşama 8 · Saha → 3D düğme sistemi): an
// outline in the border colour and a hard shadow down and right. Pressed, the shadow goes and the
// face moves into its place. Trust screens (`Quiet`) stay flat: no outline, no shadow. Pass the
// result into the style of the View inside a Pressable (a Pressable's function style is dropped by
// NativeWind).
export function useDepth(): (state?: DepthState) => ViewStyle {
  const { colors, shape } = useTheme();
  const quiet = useQuiet();
  const { stroke, offset } = shape.depth;
  return ({ pressed = false, inactive = false } = {}) => {
    if (quiet) return {};
    if (inactive) return { borderWidth: stroke, borderColor: colors.divider };
    if (pressed) {
      return {
        borderWidth: stroke,
        borderColor: colors.border,
        transform: [{ translateX: offset }, { translateY: offset }],
      };
    }
    return { borderWidth: stroke, borderColor: colors.border, boxShadow: shape.shadow.depth };
  };
}
