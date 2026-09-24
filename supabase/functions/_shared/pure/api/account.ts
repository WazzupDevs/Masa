// Request and response shapes of the `account` Edge Function, shared with the mobile app.
export type CompleteOnboardingRequest = {
  action: 'complete-onboarding';
  ageConfirmed: true;
  termsVersion: string;
  kvkkVersion: string;
};

export type DeleteAccountRequest = { action: 'delete' };

export type AccountRequest = CompleteOnboardingRequest | DeleteAccountRequest;

export type AccountResponse = { ok: true };
