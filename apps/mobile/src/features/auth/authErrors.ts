import type { AuthError } from '@supabase/supabase-js';

import { tr } from '@/i18n/tr';

// Messages from the before_user_created hook and Supabase Auth.
export function authErrorMessage(error: AuthError): string {
  if (error.message === 'phone_banned') return tr.auth.errors.banned;
  if (error.message === 'unsupported_phone') return tr.auth.errors.unsupportedPhone;
  if (error.status === 429 || error.code === 'over_sms_send_rate_limit') {
    return tr.auth.errors.tooManyRequests;
  }
  if (error.code === 'otp_expired' || error.code === 'invalid_otp') {
    return tr.auth.errors.invalidCode;
  }
  return tr.common.genericError;
}
