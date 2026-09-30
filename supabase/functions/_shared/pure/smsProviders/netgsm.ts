// Netgsm OTP service adapter (docs/SPEC_V3.md §2.2): the request body and the reading of the
// answer. The network call is in the sms function.
//
// Compared with the official Netgsm OTP package (github.com/netgsm1/otp, src/otp.php): endpoint,
// XML fields (usercode, password, msgheader, msg, no) and the answer (<main> with <code> and
// <jobID>). A real send is tried once the account is open; the hook stays disabled until then
// (docs/DECISIONS.md → "SMS: Send SMS Hook").
//
// Documented codes: 0 sent (with jobID); 20 message text or length; 30 username/password, API
// permission or IP restriction; 40, 41 sender name; 50 number; 60 no OTP SMS package on the
// account; 70 input parameters; 80 query limit (100 per minute); 100 system error.
import type { SendOutcome } from '../sms.ts';

export const NETGSM_OTP_URL = 'https://api.netgsm.com.tr/sms/send/otp';

export type NetgsmCredentials = { usercode: string; password: string; header: string };

function xmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// +905xxxxxxxxx → 5xxxxxxxxx (Netgsm takes the national number without 0).
export function netgsmNumber(e164: string): string {
  return e164.replace(/^\+90/, '');
}

export function netgsmOtpBody(creds: NetgsmCredentials, e164: string, message: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<mainbody>',
    '<header>',
    `<usercode>${xmlText(creds.usercode)}</usercode>`,
    `<password>${xmlText(creds.password)}</password>`,
    `<msgheader>${xmlText(creds.header)}</msgheader>`,
    '</header>',
    '<body>',
    `<msg>${xmlText(message)}</msg>`,
    `<no>${xmlText(netgsmNumber(e164))}</no>`,
    '</body>',
    '</mainbody>',
  ].join('');
}

// Codes that mean "try again later": the query limit (80) and a system error (100). Everything else that is not
// success is a setup or input problem that a retry does not fix.
const RETRY_CODES = new Set(['80', '100']);

// The <code> of the answer, or null if the answer is not the expected XML.
export function netgsmResultCode(responseText: string): string | null {
  const match = /<code>\s*(\d+)\s*<\/code>/i.exec(responseText);
  return match ? (match[1] ?? null) : null;
}

export function netgsmOutcome(httpStatus: number, responseText: string): SendOutcome {
  if (httpStatus >= 500) return 'retry';
  if (httpStatus !== 200) return 'failed';
  const code = netgsmResultCode(responseText);
  if (code === null) return 'retry';
  if (code === '0' || code === '00') return 'sent';
  return RETRY_CODES.has(code) ? 'retry' : 'failed';
}
