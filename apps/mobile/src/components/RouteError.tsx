import { type ErrorBoundaryProps, router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
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
      <View className="flex-1 justify-center gap-3">
        <EmptyState
          icon="alert-circle-outline"
          title={tr.errorScreen.title}
          body={tr.errorScreen.body}
        />
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
