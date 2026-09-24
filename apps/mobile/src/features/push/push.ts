import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { callAccount } from '@/lib/api';

// In the app, requests and answers show in the UI; system banners are for the background.
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

function easProjectId(): string | null {
  const extra: unknown = Constants.expoConfig?.extra;
  if (typeof extra !== 'object' || extra === null || !('eas' in extra)) return null;
  const eas: unknown = extra.eas;
  if (typeof eas !== 'object' || eas === null || !('projectId' in eas)) return null;
  return typeof eas.projectId === 'string' && eas.projectId !== '' ? eas.projectId : null;
}

// Asked at the first meaningful moment (opening a room to the venue, sending a join request),
// never during onboarding (MVP_SPEC §9 Push). Without an EAS project id, or on any failure, it
// silently does nothing: push is optional and must never block the flow.
export async function registerForPush(): Promise<void> {
  try {
    const projectId = easProjectId();
    if (!projectId) return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let { granted } = await Notifications.getPermissionsAsync();
    if (!granted) ({ granted } = await Notifications.requestPermissionsAsync());
    if (!granted) return;

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await callAccount({ action: 'register-push', token });
  } catch {
    // Optional feature: ignore.
  }
}

// On sign-out the token must stop receiving this account's pushes.
export async function unregisterPush(): Promise<void> {
  try {
    await callAccount({ action: 'register-push', token: null });
  } catch {
    // The session may already be gone.
  }
}
