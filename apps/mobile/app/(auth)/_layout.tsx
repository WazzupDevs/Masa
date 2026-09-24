import { Stack } from 'expo-router';

export const unstable_settings = { initialRouteName: 'phone' };

export default function GroupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
