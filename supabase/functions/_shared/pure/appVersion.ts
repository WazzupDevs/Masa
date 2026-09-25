// Forced update gate. Every call from the app carries its native build number (Android
// versionCode) in this header; the server refuses calls from builds older than the configured
// minimum with `update_required`. The minimum comes from the environment (MIN_APP_BUILD); 0 or
// unset keeps the gate open, and then a missing header is fine too.
export const APP_BUILD_HEADER = 'x-app-build';

// A positive whole number, or null for anything else (missing, empty, "1.2", "abc").
export function parseBuild(value: string | null | undefined): number | null {
  if (!value || !/^\d{1,9}$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return n > 0 ? n : null;
}

export function minBuildFrom(value: string | null | undefined): number {
  return parseBuild(value) ?? 0;
}

export function needsUpdate(header: string | null | undefined, minBuild: number): boolean {
  if (minBuild <= 0) return false;
  const build = parseBuild(header);
  return build === null || build < minBuild;
}
