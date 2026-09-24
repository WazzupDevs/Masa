import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'consents' };

export default function GroupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
