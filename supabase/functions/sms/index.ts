// Send SMS Hook target (docs/SPEC_V3.md §2): Supabase Auth posts { user, sms: { otp } } signed
// with Standard Webhooks; this sends the code through the provider named by SMS_PROVIDER. While
// the hook is disabled in the dashboard, Supabase's built-in Twilio Verify sends instead.
//
// The phone number and the code are never logged, stored or reported. Answers follow the auth
// hook contract: 200 sent; 503 + retry-after for a transient provider error; 4xx otherwise, as
// { error: { http_code, message } }.
import { hmacSha256 } from '../_shared/webhook.ts';
import {
  hookRecipient,
  isLocalSupabaseUrl,
  isOtp,
  LOCAL_HOOK_SECRET,
  otpMessage,
  parseSmsProvider,
  type SendOutcome,
  type SmsProvider,
} from '../_shared/pure/sms.ts';
import {
  NETGSM_OTP_URL,
  netgsmOtpBody,
  netgsmOutcome,
} from '../_shared/pure/smsProviders/netgsm.ts';
import { parseHookSecrets, verifyWebhook } from '../_shared/pure/webhookSignature.ts';

const RETRY_AFTER_SECONDS = '10';
const PROVIDER_TIMEOUT_MS = 4000;

function hookError(status: number, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function env(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

const local = isLocalSupabaseUrl(env('SUPABASE_URL'));
// The local test secret only on the local stack; a hosted project needs SEND_SMS_HOOK_SECRETS.
const secrets = parseHookSecrets(env('SEND_SMS_HOOK_SECRETS') ?? (local ? LOCAL_HOOK_SECRET : ''));

async function sendNetgsm(e164: string, message: string): Promise<SendOutcome> {
  const usercode = env('NETGSM_USERCODE');
  const password = env('NETGSM_PASSWORD');
  const header = env('NETGSM_HEADER');
  if (!usercode || !password || !header) return 'failed';
  try {
    const response = await fetch(NETGSM_OTP_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/xml; charset=utf-8' },
      body: netgsmOtpBody({ usercode, password, header }, e164, message),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    return netgsmOutcome(response.status, await response.text());
  } catch {
    return 'retry';
  }
}

function send(provider: SmsProvider, e164: string, message: string): Promise<SendOutcome> {
  switch (provider) {
    case 'netgsm':
      return sendNetgsm(e164, message);
    case 'local':
      // Sends nothing; refused outside the local stack (below).
      return Promise.resolve('sent');
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed.');
  const body = await req.text();
  const verified = await verifyWebhook(
    {
      id: req.headers.get('webhook-id'),
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
    },
    body,
    secrets,
    Math.floor(Date.now() / 1000),
    hmacSha256,
  );
  if (!verified) return hookError(401, 'Invalid signature.');

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return hookError(400, 'Invalid payload.');
  }
  const { user, sms } = (payload ?? {}) as { user?: { phone?: unknown }; sms?: { otp?: unknown } };
  const recipient = hookRecipient(user?.phone);
  const otp = sms?.otp;
  if (!recipient || !isOtp(otp)) return hookError(400, 'Only Turkish mobile numbers.');

  // The local stack defaults to `local`; a hosted project must name its provider.
  const provider = parseSmsProvider(env('SMS_PROVIDER') ?? (local ? 'local' : undefined));
  if (!provider || (provider === 'local' && !local)) {
    console.error('sms: no usable SMS_PROVIDER');
    return hookError(500, 'SMS provider is not configured.');
  }

  const outcome = await send(provider, recipient, otpMessage(otp));
  if (outcome === 'sent')
    return new Response('{}', { headers: { 'content-type': 'application/json' } });
  // Provider name and outcome only: never the number or the code.
  console.error(`sms: ${provider} ${outcome}`);
  if (outcome === 'retry') {
    return hookError(503, 'SMS provider unavailable.', { 'retry-after': RETRY_AFTER_SECONDS });
  }
  return hookError(400, 'SMS could not be sent.');
});
