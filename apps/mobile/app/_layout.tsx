import '../global.css';

import { needsConsent } from '@shared/consent.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useProfile } from '@/features/account/useProfile';
import { startSessionSync, useSessionStore } from '@/features/auth/session';
import { queryClient } from '@/lib/queryClient';

function RootNavigator() {
  const initialized = useSessionStore((s) => s.initialized);
  const signedIn = useSessionStore((s) => s.session !== null);
  const profile = useProfile();

  if (!initialized || (signedIn && profile.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  const onboarded = signedIn && profile.isSuccess && !needsConsent(profile.data);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !onboarded}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={onboarded}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  useEffect(startSessionSync, []);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <RootNavigator />
    </QueryClientProvider>
  );
}
