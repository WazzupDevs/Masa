// Request and response shapes of the `account` Edge Function, shared with the mobile app.
// Consents and the profile in one call (docs/SPEC_V3.md §3.1). The display name and the birth date
// may be left out only when the profile already has them (re-consent after a text change); a set
// birth date cannot be changed. Under 18 the account is deleted and the answer is under_age.
export type CompleteOnboardingRequest = {
  action: 'complete-onboarding';
  termsVersion: string;
  kvkkVersion: string;
  displayName?: string;
  birthDate?: string;
};

export type DeleteAccountRequest = { action: 'delete' };

// null clears the token (sign-out).
export type RegisterPushRequest = { action: 'register-push'; token: string | null };

export type AccountRequest = CompleteOnboardingRequest | DeleteAccountRequest | RegisterPushRequest;

export type AccountResponse = { ok: true };
