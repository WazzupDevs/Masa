import { type ReactNode, useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { GameDisc, type GameGlyph } from '@/components/Glyph';
import { Text } from '@/components/Text';
import { FirstGameIntro } from '@/features/games/FirstGameIntro';
import { ClockPill, TeamScore } from '@/features/games/GameBits';
import { RematchButton } from '@/features/games/RematchButton';
import { TimeUpOverlay } from '@/features/games/TimeUpOverlay';
import { tabuStats, TurnReady } from '@/features/games/TurnReady';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

// Sample data for the component preview (Ayarlar → Tasarım (test) → Bileşen önizleme): the game
// components that screens wire later, shown with made-up props so E2E can photograph them in both
// schemes. Test builds only.
export type PreviewSet = { key: string; label: string; render: () => ReactNode };

const STAGE = 560;
const GAMES: GameGlyph[] = ['tabu', 'sohbet', 'impostor', 'letters', 'song', 'needle'];

// A labelled block of the preview.
export function PreviewBlock({ title, children }: { title: string; children: ReactNode }) {
  const { colors, shape } = useTheme();
  return (
    <View
      className="gap-3"
      style={{
        padding: SPACING[3],
        borderRadius: shape.radius.lg,
        borderWidth: shape.stroke.hairline,
        borderColor: colors.divider,
      }}
    >
      <Text variant="overline" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function GamesSet() {
  const [score, setScore] = useState(8);
  const [intro, setIntro] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <View className="gap-4">
      <PreviewBlock title="GameDisc">
        <View className="flex-row flex-wrap gap-3">
          {GAMES.map((g) => (
            <GameDisc key={g} name={g} size={SPACING[14]} />
          ))}
        </View>
      </PreviewBlock>
      <PreviewBlock title="ClockPill · TeamScore">
        <View className="flex-row gap-3">
          <ClockPill seconds={42} />
          <ClockPill seconds={7} />
        </View>
        <View className="flex-row gap-2.5">
          <TeamScore name="Sakin Martı" note="siz" score={9} active={false} />
          <TeamScore name="Yaratıcı Lokma" note="anlatıyor" score={score} active />
        </View>
        <Button
          variant="secondary"
          testID="preview-score"
          label="+1"
          onPress={() => setScore((s) => s + 1)}
        />
      </PreviewBlock>
      <PreviewBlock title="TurnReady · anlatan">
        <View style={{ height: STAGE }}>
          <TurnReady
            summary={{
              eyebrow: tr.games.turnDone(2),
              alias: 'Sakin Martı',
              title: 'Sakin Martı anlattı',
              points: '+4',
              stats: tabuStats(5, 1, 2),
            }}
            describing
            describingAlias="Yaratıcı Lokma"
            secondsLeft={12}
            totalSeconds={15}
            onStart={() => undefined}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="TurnReady · diğer masa">
        <View style={{ height: STAGE }}>
          <TurnReady
            describing={false}
            describingAlias="Yaratıcı Lokma"
            secondsLeft={12}
            totalSeconds={15}
          />
        </View>
      </PreviewBlock>
      <PreviewBlock title="TimeUpOverlay">
        <View style={{ height: STAGE / 1.4 }}>
          <TimeUpOverlay visible detail="Yaratıcı Lokma bu turda +5" brand="Kabuk · Sesli Tabu" />
        </View>
      </PreviewBlock>
      <PreviewBlock title="RematchButton · ConfirmSheet · FirstGameIntro">
        <RematchButton onPress={() => undefined} />
        <Button
          variant="secondary"
          testID="preview-confirm"
          label={tr.games.endGame}
          onPress={() => setConfirm(true)}
        />
        <Button
          variant="secondary"
          testID="preview-intro"
          label={tr.games.introTitle}
          onPress={() => setIntro(true)}
        />
      </PreviewBlock>
      <ConfirmSheet
        visible={confirm}
        testID="preview-confirm-ok"
        title={tr.games.endGameConfirmTitle}
        body={tr.games.endGameConfirmBody}
        confirmLabel={tr.games.endGameConfirm}
        cancelLabel={tr.games.keepPlaying}
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => setConfirm(false)}
      />
      <FirstGameIntro visible={intro} onClose={() => setIntro(false)} />
    </View>
  );
}

export const PREVIEW_SETS: PreviewSet[] = [
  { key: 'games', label: 'Oyun', render: () => <GamesSet /> },
];
