import '../global.css';

import { needsConsent } from '@shared/consent.ts';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useProfile } from '@/features/account/useProfile';
import { startSessionSync, useSessionStore } from '@/features/auth/session';
import { configureNotifications } from '@/features/push/push';
import { UpdateRequired } from '@/features/update/UpdateRequired';
import { useUpdateGate, watchUpdateGate } from '@/features/update/updateGate';
import { pingUpdateGate } from '@/lib/api';
import { initErrorReporting } from '@/lib/errorReporting';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

initErrorReporting();

function RootNavigator() {
  const updateRequired = useUpdateGate((s) => s.required);
  const initialized = useSessionStore((s) => s.initialized);
  const signedIn = useSessionStore((s) => s.session !== null);
  const profile = useProfile();
  const theme = useTheme();

  if (updateRequired) return <UpdateRequired />;

  if (!initialized || (signedIn && profile.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={theme.colors.muted} />
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
  useEffect(() => {
    startSessionSync();
    configureNotifications();
    return watchUpdateGate(pingUpdateGate);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootNavigator />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
