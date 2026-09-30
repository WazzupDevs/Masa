// The sign-in code SMS sent by the Send SMS Hook (docs/SPEC_V3.md §2). Only the app name and the
// code: no link, no other content. Plain ASCII so every provider sends it as one GSM-7 segment.
import { APP_NAME } from './brand.ts';
import { toTrMobileE164 } from './phone.ts';

export const SMS_PROVIDERS = ['netgsm', 'local'] as const;
export type SmsProvider = (typeof SMS_PROVIDERS)[number];

const ASCII: Record<string, string> = {
  ç: 'c',
  Ç: 'C',
  ğ: 'g',
  Ğ: 'G',
  ı: 'i',
  İ: 'I',
  ö: 'o',
  Ö: 'O',
  ş: 's',
  Ş: 'S',
  ü: 'u',
  Ü: 'U',
};

export function toSmsAscii(text: string): string {
  return text.replace(/[çÇğĞıİöÖşŞüÜ]/g, (ch) => ASCII[ch] ?? ch);
}

export function otpMessage(otp: string): string {
  return toSmsAscii(`${APP_NAME} kodun: ${otp}. Kimseyle paylaşma.`);
}

// A Turkish mobile number from the hook payload ("905…" or "+905…"); null for anything else, so
// the hook never sends abroad even if the auth hook were bypassed.
export function hookRecipient(phone: unknown): string | null {
  return typeof phone === 'string' ? toTrMobileE164(phone) : null;
}

export function isOtp(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4,10}$/.test(value);
}

export function parseSmsProvider(value: string | undefined): SmsProvider | null {
  return SMS_PROVIDERS.find((p) => p === value) ?? null;
}

// What the hook answers Supabase Auth after the provider call.
export type SendOutcome = 'sent' | 'retry' | 'failed';

// The local stack (functions serve reaches it as kong:8000). The `local` provider and the test
// hook secret work only there; a hosted project refuses both.
const LOCAL_HOSTS = new Set(['kong', '127.0.0.1', 'localhost', 'host.docker.internal']);

export function isLocalSupabaseUrl(url: string | undefined): boolean {
  if (!url) return false;
  const match = /^https?:\/\/([^/:]+)/.exec(url);
  return match !== null && LOCAL_HOSTS.has(match[1] ?? '');
}

// Signing secret of the local stack only (config.toml's commented [auth.hook.send_sms] and the
// integration tests). Public on purpose: it opens nothing outside the local stack.
export const LOCAL_HOOK_SECRET = 'v1,whsec_bG9jYWwtb25seS1rYWJ1ay1zbXMtaG9vay10ZXN0LXNlY3JldA==';
