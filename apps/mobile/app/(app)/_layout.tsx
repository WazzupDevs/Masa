import { Stack } from 'expo-router';

import { usePushNavigation } from '@/features/push/push';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: '(tabs)' };

export default function GroupLayout() {
  usePushNavigation();
  return <Stack screenOptions={{ headerShown: false }} />;
}
