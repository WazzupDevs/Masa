import type { Concept } from '@shared/rooms.ts';
import type { ReactNode } from 'react';
import { Image, type ImageSourcePropType, Pressable, View } from 'react-native';

import { useDepth } from '@/components/Depth';
import { GAME_TONES, type GameGlyph } from '@/components/Glyph';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

// Each game's icon and colour pair (canvas: Aşama 6 · Oyunlar → Oyun ikonları).
export const GAME_GLYPH: Record<Concept, GameGlyph> = {
  tabu: 'tabu',
  sohbet: 'sohbet',
  sahtekar: 'impostor',
  harf: 'letters',
  sarki: 'song',
  ibre: 'needle',
};

// The games in the order every list shows them.
export const GAME_ORDER: readonly Concept[] = [
  'tabu',
  'sahtekar',
  'harf',
  'sarki',
  'ibre',
  'sohbet',
];

// Each game's picture (scripts/icon/art.ts, `pnpm icons`): a sticker scene in fixed colours.
const ART: Record<GameGlyph, ImageSourcePropType> = {
  tabu: require('../../../assets/art/tabu.png'),
  sohbet: require('../../../assets/art/sohbet.png'),
  impostor: require('../../../assets/art/impostor.png'),
  letters: require('../../../assets/art/letters.png'),
  song: require('../../../assets/art/song.png'),
  needle: require('../../../assets/art/needle.png'),
};

const CARD_HEIGHT = TOUCH.large + SPACING[7];
const ART_SIZE = SPACING[14] + SPACING[1.5];

type Props = {
  concept: Concept;
  onPress: () => void;
  // Faded and not pressable, with a short reason on it ("En az 3 kişi"). Which game is open comes
  // from the game's own rule (headcount), never from the card.
  disabled?: boolean;
  reason?: string;
  // What the reader hears; the card shows only the game's name.
  accessibilityLabel?: string;
  testID?: string;
};

// A game on a game list (canvas: Aşama 8 · Saha → Oyun listesi): a rectangle in the game's colour,
// its name on top and its picture in the corner, 3D like the buttons.
export function GameCard({
  concept,
  onPress,
  disabled,
  reason,
  accessibilityLabel,
  testID,
}: Props) {
  const { colors, shape } = useTheme();
  const depth = useDepth();
  const glyph = GAME_GLYPH[concept];
  const [bg, fg] = GAME_TONES[glyph];
  const name = tr.concepts[concept];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel ?? name}${reason ? `, ${reason}` : ''}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
    >
      {({ pressed }) => (
        <View
          style={[
            {
              height: CARD_HEIGHT,
              borderRadius: shape.radius.md,
              backgroundColor: colors[bg],
              overflow: 'hidden',
              opacity: disabled ? 0.5 : 1,
            },
            depth({ pressed, inactive: disabled }),
          ]}
        >
          <Image
            source={ART[glyph]}
            accessible={false}
            style={{
              position: 'absolute',
              right: -SPACING[1],
              bottom: -SPACING[1.5],
              width: ART_SIZE,
              height: ART_SIZE,
            }}
          />
          <View style={{ padding: SPACING[2.5], paddingRight: SPACING[10] }}>
            <Text variant="heading" color={colors[fg]} numberOfLines={2}>
              {name}
            </Text>
          </View>
          {reason ? (
            <View
              className="absolute"
              style={{
                left: SPACING[2],
                bottom: SPACING[2],
                paddingHorizontal: SPACING[2],
                paddingVertical: SPACING[0.5],
                borderRadius: shape.radius.pill,
                backgroundColor: colors.surface,
              }}
            >
              <Text variant="caption">{reason}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const GAP = SPACING[1.5];

// Six game cards in two columns: they fit without scrolling. Each cell keeps half the gap around
// its card, so the 3D shadow has room.
export function GameGrid({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row flex-wrap" style={{ marginHorizontal: -GAP, rowGap: GAP * 3 }}>
      {children}
    </View>
  );
}

export function GameCell({ children }: { children: ReactNode }) {
  return <View style={{ width: '50%', paddingHorizontal: GAP }}>{children}</View>;
}
