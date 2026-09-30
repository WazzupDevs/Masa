import { create } from 'zustand';

// Sign-up = profile (docs/SPEC_V3.md §3), state that lives only on the phone:
// - extrasPending: complete-onboarding succeeded and the optional photo/bio step is still open,
//   so the gate keeps the onboarding screens until it is done or skipped. After an app restart the
//   step is simply skipped.
// - underAge: the server deleted the account (under 18); the phone screen says why once.
type OnboardingState = { extrasPending: boolean; underAge: boolean };

export const useOnboardingStore = create<OnboardingState>(() => ({
  extrasPending: false,
  underAge: false,
}));
