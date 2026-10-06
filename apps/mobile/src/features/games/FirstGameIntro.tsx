import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { GameDisc, GameIcon } from '@/components/Glyph';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING, TOUCH } from '@/theme/tokens';

const ART = SPACING[16];

type Props = {
  visible: boolean;
  // "Geç" and "Anladım" both close it; the parent remembers it was seen.
  onClose: () => void;
};

// Sesli Tabu's first-game intro (canvas: Aşama 6 · Oyunlar → İlk oyun tanıtımı): one screen, three
// steps (the describing table, the judging table, the buttons), skippable.
export function FirstGameIntro({ visible, onClose }: Props) {
  const { colors, shape } = useTheme();
  const art = [
    <GameIcon key="d" name="tabu" color={colors.text} size={SPACING[8]} />,
    <Text key="j" variant="title" tone="danger">
      !
    </Text>,
    <View key="b" className="flex-row gap-1">
      <View
        style={{
          width: SPACING[4],
          height: SPACING[7],
          borderRadius: shape.radius.sm / 2,
          backgroundColor: colors.success,
        }}
      />
      <View
        style={{
          width: SPACING[4],
          height: SPACING[7],
          borderRadius: shape.radius.sm / 2,
          backgroundColor: colors.danger,
        }}
      />
    </View>,
  ];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView testID="first-game-intro" style={{ flex: 1, backgroundColor: colors.canvas }}>
        <ScrollView contentContainerStyle={{ padding: shape.screenPadding, gap: SPACING[4] }}>
          <View className="flex-row items-center justify-between">
            <Text variant="overline" tone="muted">
              {tr.games.introEyebrow}
            </Text>
            <Pressable
              testID="intro-skip"
              accessibilityRole="button"
              onPress={onClose}
              style={{
                minHeight: TOUCH.min,
                minWidth: TOUCH.min,
                justifyContent: 'center',
                alignItems: 'flex-end',
              }}
            >
              <Text variant="label">{tr.games.introSkip}</Text>
            </Pressable>
          </View>
          <View className="flex-row items-center gap-3">
            <GameDisc name="tabu" size={SPACING[16]} />
            <Text variant="display" accessibilityRole="header" className="flex-1">
              {tr.games.introTitle}
            </Text>
          </View>
          {tr.games.introSteps.map((step, i) => (
            <Card key={step.title}>
              <View className="flex-row items-start gap-3">
                <View
                  className="items-center justify-center"
                  style={{
                    width: ART,
                    height: ART,
                    borderRadius: shape.radius.md,
                    backgroundColor: colors.surface2,
                  }}
                >
                  {art[i]}
                </View>
                <View className="flex-1 gap-1">
                  <Text variant="overline" tone="muted">
                    {tr.games.introStep(i + 1)}
                  </Text>
                  <Text variant="heading">{step.title}</Text>
                  <Text variant="fine">{step.body}</Text>
                </View>
              </View>
            </Card>
          ))}
        </ScrollView>
        {/* Pinned under the steps: reachable on short screens without scrolling. */}
        <View style={{ padding: shape.screenPadding, paddingTop: SPACING[3] }}>
          <Button testID="intro-done" label={tr.games.introDone} onPress={onClose} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
