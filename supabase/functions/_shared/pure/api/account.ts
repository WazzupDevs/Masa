// Request and response shapes of the `account` Edge Function, shared with the mobile app.
export type CompleteOnboardingRequest = {
  action: 'complete-onboarding';
  ageConfirmed: true;
  termsVersion: string;
  kvkkVersion: string;
};

export type DeleteAccountRequest = { action: 'delete' };

// null clears the token (sign-out).
export type RegisterPushRequest = { action: 'register-push'; token: string | null };

export type AccountRequest = CompleteOnboardingRequest | DeleteAccountRequest | RegisterPushRequest;

export type AccountResponse = { ok: true };
