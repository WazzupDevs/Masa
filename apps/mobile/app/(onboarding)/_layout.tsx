import { Stack } from 'expo-router';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'consents' };

export default function GroupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
