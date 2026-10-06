import { Image, type ImageSourcePropType, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { ICON, type PaletteKey } from '@/theme/tokens';

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

// The games' icons (canvas: Aşama 6 · Oyunlar → Oyun ikonları): Aktiviteler cards and "Oyun öner".
// Each game has its own colour pair from the palette.
export type GameGlyph = 'tabu' | 'sohbet' | 'impostor' | 'letters' | 'song' | 'needle';

const GAME: Record<GameGlyph, ImageSourcePropType> = {
  tabu: require('../../assets/glyph/game-tabu.png'),
  sohbet: require('../../assets/glyph/game-sohbet.png'),
  impostor: require('../../assets/glyph/game-impostor.png'),
  letters: require('../../assets/glyph/game-letters.png'),
  song: require('../../assets/glyph/game-song.png'),
  needle: require('../../assets/glyph/game-needle.png'),
};

export const GAME_TONES: Record<GameGlyph, readonly [PaletteKey, PaletteKey]> = {
  tabu: ['violet', 'onViolet'],
  sohbet: ['signal', 'onSignal'],
  impostor: ['lively', 'onLively'],
  letters: ['calm', 'onCalm'],
  song: ['buzz', 'onBuzz'],
  needle: ['event', 'onEvent'],
};

export function GameIcon({
  name,
  color,
  size = ICON.lg,
}: {
  name: GameGlyph;
  color: string;
  size?: number;
}) {
  return (
    <Image
      source={GAME[name]}
      accessible={false}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
    />
  );
}

// The game's icon on its colour disc. Decorative.
export function GameDisc({ name, size = 56 }: { name: GameGlyph; size?: number }) {
  const { colors, shape } = useTheme();
  const [bg, fg] = GAME_TONES[name];
  return (
    <View
      accessible={false}
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: shape.radius.pill,
        backgroundColor: colors[bg],
      }}
    >
      <GameIcon name={name} color={colors[fg]} size={Math.round(size * 0.56)} />
    </View>
  );
}
