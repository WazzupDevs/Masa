// Bump a version when its text changes; users with an older accepted version are asked again.
// draft-1: Kabuk v1 (docs/SPEC_V3.md §3.3): birth date, required display name, venue chat.
export const CURRENT_TERMS_VERSION = 'draft-1';
export const CURRENT_KVKK_VERSION = 'draft-1';
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

// Sign-up = profile (docs/SPEC_V3.md §3): current consents, a display name and a birth date. The
// client reads has_birth_date, never the date itself.
export type OnboardingState = ConsentState & {
  display_name: string | null;
  has_birth_date: boolean | null;
};

export function needsProfile(profile: OnboardingState): boolean {
  return !profile.display_name || profile.has_birth_date !== true;
}

export function needsOnboarding(profile: OnboardingState | null): boolean {
  return profile === null || needsConsent(profile) || needsProfile(profile);
}
