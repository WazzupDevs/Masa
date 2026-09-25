import { Stack } from 'expo-router';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'phone' };

export default function GroupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
