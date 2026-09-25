import { type ErrorBoundaryProps, router } from 'expo-router';
import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { tr } from '@/i18n/tr';
import { reportError } from '@/lib/errorReporting';

// Error boundary of every route group (expo-router `ErrorBoundary` export): a short message
// instead of a white screen, a retry, and a way back home. The error goes to Sentry only.
export function RouteError({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Text className="text-2xl font-bold text-black">{tr.errorScreen.title}</Text>
        <Text className="text-base text-neutral-600">{tr.errorScreen.body}</Text>
        <Button label={tr.errorScreen.retry} onPress={() => void retry()} />
        <Button
          variant="secondary"
          label={tr.errorScreen.home}
          onPress={() => {
            router.replace('/');
            void retry();
          }}
        />
      </View>
    </Screen>
  );
}
