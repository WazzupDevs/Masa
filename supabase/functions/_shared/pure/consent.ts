// Bump a version when its text changes; users with an older accepted version are asked again.
export const CURRENT_TERMS_VERSION = 'draft-0';
export const CURRENT_KVKK_VERSION = 'draft-0';
// Explicit consent for location use at check-in (stored on the first check-in).
export const CURRENT_LOCATION_CONSENT_VERSION = 'draft-0';

export type ConsentState = { terms_version: string; kvkk_version: string };

export function needsConsent(profile: ConsentState | null): boolean {
  return (
    profile === null ||
    profile.terms_version !== CURRENT_TERMS_VERSION ||
    profile.kvkk_version !== CURRENT_KVKK_VERSION
  );
}
