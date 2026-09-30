// Standard Webhooks signatures (https://www.standardwebhooks.com), as Supabase Auth signs HTTP
// hooks (docs/SPEC_V3.md §2). The HMAC itself is passed in: pure/ has no crypto global. The Deno
// side uses WebCrypto (`_shared/webhook.ts`), the tests use Node's crypto.

// Supabase shows the secret as "v1,whsec_<base64>"; several may be joined with "|".
const SECRET_PREFIX = 'v1,whsec_';
// Older or newer deliveries than this are rejected (replay window of the standard).
export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type HmacSha256 = (key: Uint8Array, message: string) => Promise<Uint8Array>;

export type WebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function base64Decode(text: string): Uint8Array | null {
  const clean = text.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return null;
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

// The signing keys in a SEND_SMS_HOOK_SECRETS value; empty if none is well formed.
export function parseHookSecrets(value: string): Uint8Array[] {
  const keys: Uint8Array[] = [];
  for (const part of value.split('|')) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(SECRET_PREFIX)) continue;
    const key = base64Decode(trimmed.slice(SECRET_PREFIX.length));
    if (key && key.length > 0) keys.push(key);
  }
  return keys;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// True if one of the "v1,<base64>" signatures matches one of the keys and the timestamp is within
// the tolerance of `nowSeconds`.
export async function verifyWebhook(
  headers: WebhookHeaders,
  body: string,
  keys: readonly Uint8Array[],
  nowSeconds: number,
  hmac: HmacSha256,
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || keys.length === 0) return false;
  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return false;

  const given = signature
    .split(' ')
    .filter((s) => s.startsWith('v1,'))
    .map((s) => s.slice(3));
  if (given.length === 0) return false;

  const content = `${id}.${timestamp}.${body}`;
  for (const key of keys) {
    const expected = base64Encode(await hmac(key, content));
    if (given.some((g) => constantTimeEqual(g, expected))) return true;
  }
  return false;
}
