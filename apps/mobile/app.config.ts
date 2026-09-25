// Dynamic Expo config on top of app.json. Push setup comes from the environment so the build
// never depends on accounts that may not exist yet:
// - EAS_PROJECT_ID: Expo project id; without it the app skips push token registration.
// - GOOGLE_SERVICES_JSON: path to Firebase's google-services.json (default ./google-services.json);
//   added to the Android build only when the file exists.
// OTA updates (expo-updates) use the same project id; the runtime version is the native
// fingerprint, so an update only reaches builds with the same native code. Without a project id
// updates are off.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const projectId = process.env.EAS_PROJECT_ID;
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? './google-services.json';
  const hasGoogleServices = existsSync(resolve(__dirname, googleServicesFile));

  return {
    ...config,
    name: config.name ?? 'Masa',
    slug: config.slug ?? 'masa',
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile } : {}),
    },
    extra: {
      ...config.extra,
      ...(projectId ? { eas: { projectId } } : {}),
    },
    runtimeVersion: { policy: 'fingerprint' },
    updates: projectId
      ? { url: `https://u.expo.dev/${projectId}`, enabled: true }
      : { enabled: false },
  };
};
