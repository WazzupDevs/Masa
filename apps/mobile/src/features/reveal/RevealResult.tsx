import { isRevealToken, REVEAL } from '@shared/reveal.ts';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Quiet } from '@/components/Quiet';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/Text';
import { tr } from '@/i18n/tr';
import { trackOnce } from '@/lib/analytics';
import { withAlpha } from '@/theme/contrast';
import { revealForeground, REVEAL_FOREGROUNDS } from '@/theme/reveal';
import { useTheme } from '@/theme/ThemeProvider';
import { SPACING } from '@/theme/tokens';

import { AddFriendButton } from './AddFriendButton';

type Props = { roomId: string; isOwner: boolean; result: 'mutual' | 'none'; token: unknown };

// The mockup's mark: a 180 disc around the emoji (type variant `signalMark`).
const MARK = { size: 180 } as const;

// On a mutual yes both screens show the same full-screen color and emoji for 60 seconds; in every
// other case both tables see the same "Güzel oyundu" (MVP_SPEC §4.6). v2: the mutual signal also
// offers "Arkadaş ekle" (docs/SPEC_V2.md §6.5). The colour is the server's, not the theme's: two
// pairs in one venue must tell their signals apart, and both phones must match.
export function RevealResult({ roomId, isOwner, result, token }: Props) {
  const { shape } = useTheme();
  const mutual = result === 'mutual' && isRevealToken(token);

  useEffect(() => {
    // Counted once per room, from the owner's phone.
    if (isOwner) trackOnce(`reveal:${roomId}`, mutual ? 'reveal_mutual' : 'reveal_none', {});
  }, [isOwner, roomId, mutual]);

  useEffect(() => {
    if (!mutual) return;
    const timer = setTimeout(() => router.replace('/venue'), REVEAL.signalSeconds * 1000);
    return () => clearTimeout(timer);
  }, [mutual]);

  if (mutual) {
    const bg = token.color;
    const fg = revealForeground(bg);
    const lightText = fg === REVEAL_FOREGROUNDS[0];
    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <StatusBar style={lightText ? 'light' : 'dark'} />
        <SafeAreaView style={{ flex: 1, backgroundColor: bg }}>
          <Quiet value>
            <View
              className="flex-1 items-center justify-center"
              style={{ paddingHorizontal: SPACING[7], paddingBottom: SPACING[8] }}
            >
              <Text variant="label" color={fg} align="center" className="mb-7">
                {tr.reveal.signalTop}
              </Text>
              <View
                className="items-center justify-center"
                style={{
                  width: MARK.size,
                  height: MARK.size,
                  borderRadius: shape.radius.pill,
                  backgroundColor: withAlpha(fg, 0.16),
                  boxShadow: `0px 0px 0px 12px ${withAlpha(fg, 0.08)}`,
                }}
              >
                <Text variant="signalMark" color={fg}>
                  {token.emoji}
                </Text>
              </View>
              <Text variant="display" color={fg} align="center" className="mb-2 mt-7">
                {tr.reveal.signal}
              </Text>
              <Text variant="bodyStrong" color={fg} align="center">
                {tr.reveal.signalSame}
              </Text>
              <View className="mt-7 gap-2.5 self-stretch">
                <AddFriendButton roomId={roomId} background={bg} foreground={fg} />
                <Button
                  label={tr.reveal.backToVenue}
                  tint={{ background: fg, foreground: bg, outline: true }}
                  onPress={() => router.replace('/venue')}
                />
              </View>
              <Text variant="fine" color={fg} align="center" className="mt-3">
                {tr.friends.addFriendHint}
              </Text>
            </View>
          </Quiet>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Screen>
      <View className="flex-1 justify-center gap-6">
        <Text variant="display" align="center">
          {tr.reveal.goodGame}
        </Text>
        <Button label={tr.reveal.backToVenue} onPress={() => router.replace('/venue')} />
      </View>
    </Screen>
  );
}
