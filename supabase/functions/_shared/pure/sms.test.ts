import { describe, expect, it } from 'vitest';

import { hookRecipient, isOtp, otpMessage, parseSmsProvider, toSmsAscii } from './sms.ts';
import {
  netgsmNumber,
  netgsmOtpBody,
  netgsmOutcome,
  netgsmResultCode,
} from './smsProviders/netgsm.ts';

describe('sms', () => {
  it('sends only the app name and the code, in ASCII', () => {
    expect(otpMessage('123456')).toBe('Kabuk kodun: 123456. Kimseyle paylasma.');
    expect(toSmsAscii('Çiğ şöİü')).toBe('Cig soIu');
    expect(otpMessage('123456')).toMatch(/^[\x20-\x7e]+$/);
  });

  it('only sends to Turkish mobile numbers', () => {
    expect(hookRecipient('905551112233')).toBe('+905551112233');
    expect(hookRecipient('+905551112233')).toBe('+905551112233');
    expect(hookRecipient('+15551112233')).toBeNull();
    expect(hookRecipient('902121112233')).toBeNull();
    expect(hookRecipient(undefined)).toBeNull();
  });

  it('checks the code and the provider name', () => {
    expect(isOtp('123456')).toBe(true);
    expect(isOtp('12a456')).toBe(false);
    expect(isOtp(123456)).toBe(false);
    expect(parseSmsProvider('netgsm')).toBe('netgsm');
    expect(parseSmsProvider('twilio')).toBeNull();
    expect(parseSmsProvider(undefined)).toBeNull();
  });
});

describe('netgsm', () => {
  const creds = { usercode: 'u&1', password: 'p<2>', header: 'KABUK' };

  it('builds the OTP body with the national number and escaped values', () => {
    const body = netgsmOtpBody(creds, '+905551112233', otpMessage('123456'));
    expect(netgsmNumber('+905551112233')).toBe('5551112233');
    expect(body).toContain('<no>5551112233</no>');
    expect(body).toContain('<usercode>u&amp;1</usercode>');
    expect(body).toContain('<password>p&lt;2&gt;</password>');
    expect(body).toContain('<msgheader>KABUK</msgheader>');
    expect(body).toContain('<msg>Kabuk kodun: 123456. Kimseyle paylasma.</msg>');
  });

  it('maps answers to sent, retry and failed', () => {
    const ok = '<?xml version="1.0"?><xml><main><code>0</code><jobID>123</jobID></main></xml>';
    expect(netgsmResultCode(ok)).toBe('0');
    expect(netgsmOutcome(200, ok)).toBe('sent');
    expect(netgsmOutcome(200, '<xml><main><code>30</code></main></xml>')).toBe('failed');
    expect(netgsmOutcome(200, '<xml><main><code>80</code></main></xml>')).toBe('retry');
    expect(netgsmOutcome(200, '<xml><main><code>100</code></main></xml>')).toBe('retry');
    expect(netgsmOutcome(200, 'garbage')).toBe('retry');
    expect(netgsmOutcome(503, '')).toBe('retry');
    expect(netgsmOutcome(403, '')).toBe('failed');
  });
});
