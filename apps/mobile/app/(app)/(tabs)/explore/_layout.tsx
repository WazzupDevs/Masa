import { Stack } from 'expo-router';

export { RouteError as ErrorBoundary } from '@/components/RouteError';

export const unstable_settings = { initialRouteName: 'index' };

export default function ExploreLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
