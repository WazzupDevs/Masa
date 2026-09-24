import type { AuthError } from '@supabase/supabase-js';

import { tr } from '@/i18n/tr';

// Messages from the before_user_created hook and Supabase Auth.
export function authErrorMessage(error: AuthError): string {
  // The sign-up hook rejects unsupported and banned numbers alike; the reason is never shown.
  if (error.message === 'signup_not_allowed') return tr.auth.errors.signupNotAllowed;
  if (error.status === 429 || error.code === 'over_sms_send_rate_limit') {
    return tr.auth.errors.tooManyRequests;
  }
  if (error.code === 'otp_expired' || error.code === 'invalid_otp') {
    return tr.auth.errors.invalidCode;
  }
  return tr.common.genericError;
}
