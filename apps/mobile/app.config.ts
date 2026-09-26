// Dynamic Expo config on top of app.json.
// - EAS_PROJECT_ID: the Expo project (@wazzupdevs/masa), fixed here rather than read from the
//   environment. The runtime version is the native fingerprint, which covers this config: EAS
//   computes it once on the machine that starts the build and again on the build server, and the
//   two must match. With the id from the environment they differed (the server had it, a laptop
//   without `EAS_PROJECT_ID` did not) and "Configure expo-updates" failed.
// - GOOGLE_SERVICES_JSON: path to Firebase's google-services.json (default ./google-services.json);
//   added to the Android build only when the file exists.
// OTA updates (expo-updates) use the same project id; an update only reaches builds with the same
// native code.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ConfigContext, ExpoConfig } from 'expo/config';

const EAS_PROJECT_ID = '9692ae9b-7826-4f6b-a41e-a0506d5992c2';

export default ({ config }: ConfigContext): ExpoConfig => {
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
      eas: { projectId: EAS_PROJECT_ID },
    },
    runtimeVersion: { policy: 'fingerprint' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, enabled: true },
  };
};
