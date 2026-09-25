import { APP_BUILD_HEADER } from '@shared/appVersion.ts';
import * as Application from 'expo-application';

// The native build number (Android versionCode) of the installed binary. It comes from the native
// side, so an over-the-air update cannot change it: this is what the forced update gate compares.
export const appBuild: string | null = Application.nativeBuildVersion;

export const appBuildHeaders: Record<string, string> = appBuild
  ? { [APP_BUILD_HEADER]: appBuild }
  : {};

// Where "Güncelle" leads: EXPO_PUBLIC_UPDATE_URL while testers install APKs from a link, else the
// Play Store page of this app.
export function updateUrl(): string {
  const override = process.env.EXPO_PUBLIC_UPDATE_URL;
  if (override) return override;
  const id = Application.applicationId ?? 'app.masa.mobile';
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(id)}`;
}
