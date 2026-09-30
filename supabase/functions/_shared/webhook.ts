// WebCrypto HMAC-SHA256 for pure/webhookSignature.ts (Standard Webhooks, the auth hooks' signing).
import type { HmacSha256 } from './pure/webhookSignature.ts';

export const hmacSha256: HmacSha256 = async (key, message) => {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new Uint8Array(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
};
