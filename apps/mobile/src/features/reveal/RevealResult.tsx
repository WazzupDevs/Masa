import { isRevealToken, REVEAL } from '@shared/reveal.ts';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Modal, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { tr } from '@/i18n/tr';

type Props = { result: 'mutual' | 'none'; token: unknown };

// On a mutual yes both screens show the same full-screen color and emoji for 60 seconds; in every
// other case both tables see the same "Güzel oyundu" (MVP_SPEC §4.6).
export function RevealResult({ result, token }: Props) {
  const mutual = result === 'mutual' && isRevealToken(token);

  useEffect(() => {
    if (!mutual) return;
    const timer = setTimeout(() => router.replace('/'), REVEAL.signalSeconds * 1000);
    return () => clearTimeout(timer);
  }, [mutual]);

  if (mutual) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent>
        <View
          className="flex-1 items-center justify-center px-8"
          style={{ backgroundColor: token.color }}
        >
          <Text style={{ fontSize: 160 }}>{token.emoji}</Text>
          <Text className="mt-8 text-center text-3xl font-bold text-white">{tr.reveal.signal}</Text>
          <View className="mt-12 w-full">
            <Button
              variant="secondary"
              label={tr.reveal.backToVenue}
              onPress={() => router.replace('/')}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-6">
        <Text className="text-center text-3xl font-bold text-black">{tr.reveal.goodGame}</Text>
        <View className="w-full">
          <Button label={tr.reveal.backToVenue} onPress={() => router.replace('/')} />
        </View>
      </View>
    </Screen>
  );
}
