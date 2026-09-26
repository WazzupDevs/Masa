// Dynamic Expo config on top of app.json.
// - EAS_PROJECT_ID: the Expo project (@wazzupdevs/masa), fixed here rather than read from the
//   environment (push token registration and OTA updates use it).
// - GOOGLE_SERVICES_JSON: path to Firebase's google-services.json (default ./google-services.json);
//   added to the Android build only when the file exists.
// - runtimeVersion follows app.json's `version` (appVersion policy): an OTA update reaches only builds
//   of the same version. A change to native code (native dependency, config plugin, native field in
//   app.json) therefore bumps `version` and ships as a new build. The native fingerprint was dropped:
//   computed on Windows (where builds and updates start) and on the Linux build server it differed
//   (docs/DECISIONS.md, "runtimeVersion").
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
    runtimeVersion: { policy: 'appVersion' },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}`, enabled: true },
  };
};
