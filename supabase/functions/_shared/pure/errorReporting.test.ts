import { describe, expect, it } from 'vitest';

import { redact, scrubBreadcrumb, scrubEvent } from './errorReporting.ts';

describe('redact', () => {
  it('removes Turkish phone numbers in common spellings', () => {
    for (const phone of ['+905321234567', '905321234567', '0532 123 45 67', '532-123-45-67']) {
      expect(redact(`giriş ${phone} başarısız`), phone).toBe('giriş [telefon] başarısız');
    }
  });

  it('removes coordinate pairs', () => {
    expect(redact('konum 40.98819357, 28.66821245 alındı')).toBe('konum [konum] alındı');
  });

  it('leaves ordinary text alone', () => {
    expect(redact('rooms_end failed (500) after 30 sn')).toBe('rooms_end failed (500) after 30 sn');
  });
});

describe('scrubBreadcrumb', () => {
  it('drops console and typed-text breadcrumbs', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'mesaj: selam' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'TextInput' })).toBeNull();
  });

  it('keeps only method, status and the path of network breadcrumbs', () => {
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: {
          method: 'POST',
          status_code: 422,
          url: 'https://x.supabase.co/rest/v1/messages?room_id=eq.1',
          request_body: '{"body":"gizli mesaj"}',
        },
      }),
    ).toEqual({
      category: 'fetch',
      data: { method: 'POST', status_code: 422, url: 'https://x.supabase.co/rest/v1/messages' },
    });
  });
});

describe('scrubEvent', () => {
  it('keeps only the user id and drops request and extra data', () => {
    const event = scrubEvent({
      user: { id: 'u1', phone: '+905321234567', ip_address: '1.2.3.4' },
      request: { data: { body: 'gizli mesaj' } },
      extra: { lat: 41, lng: 28 },
      exception: { values: [{ value: 'OTP 905321234567 için başarısız' }] },
      breadcrumbs: [{ category: 'console', message: 'x' }, { category: 'navigation' }],
    });
    expect(event).toEqual({
      user: { id: 'u1' },
      exception: { values: [{ value: 'OTP [telefon] için başarısız' }] },
      breadcrumbs: [{ category: 'navigation' }],
    });
  });

  it('sends no user when there is no id', () => {
    expect(scrubEvent({ user: { email: 'a@b.c' } }).user).toBeUndefined();
  });
});
