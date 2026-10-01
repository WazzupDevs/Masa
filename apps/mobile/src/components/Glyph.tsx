import { Image, type ImageSourcePropType } from 'react-native';

import { ICON } from '@/theme/tokens';

// The app's own icon family (canvas: Aşama 5 · Geri bildirim → İkonlar A): drawn in
// scripts/icon/glyphs.ts, rasterised white by `pnpm icons` (1×/2×/3×) and tinted here, since
// react-native-svg is a native module the installed builds do not have.
export type TabGlyph = 'explore' | 'activities' | 'messages' | 'profile' | 'bell';

const TAB: Record<TabGlyph, { line: ImageSourcePropType; solid: ImageSourcePropType }> = {
  explore: {
    line: require('../../assets/glyph/tab-explore.png'),
    solid: require('../../assets/glyph/tab-explore-active.png'),
  },
  activities: {
    line: require('../../assets/glyph/tab-activities.png'),
    solid: require('../../assets/glyph/tab-activities-active.png'),
  },
  messages: {
    line: require('../../assets/glyph/tab-messages.png'),
    solid: require('../../assets/glyph/tab-messages-active.png'),
  },
  profile: {
    line: require('../../assets/glyph/tab-profile.png'),
    solid: require('../../assets/glyph/tab-profile-active.png'),
  },
  bell: {
    line: require('../../assets/glyph/tab-bell.png'),
    solid: require('../../assets/glyph/tab-bell-active.png'),
  },
};

type Props = {
  name: TabGlyph;
  color: string;
  // Solid when its tab is selected, a line drawing otherwise.
  active?: boolean;
  size?: number;
};

// A tab or header icon. Decorative: the tab or button around it carries the label.
export function TabIcon({ name, color, active = false, size = ICON.lg }: Props) {
  return (
    <Image
      source={active ? TAB[name].solid : TAB[name].line}
      accessible={false}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}

// Map marker glyphs as signed distance fields (ExploreMap colours them per bucket).
export const MARKER_IMAGES = {
  cafe: require('../../assets/glyph/marker-cafe.png') as ImageSourcePropType,
  campus: require('../../assets/glyph/marker-campus.png') as ImageSourcePropType,
};

export const FADE_IMAGE: ImageSourcePropType = require('../../assets/glyph/fade.png');
