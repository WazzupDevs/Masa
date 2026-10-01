import { describe, expect, it } from 'vitest';

import { DEV_PROJECT_HOST, isDevProjectUrl, isLocalUrl, locationCheck } from './devProject.ts';

const DEV = `https://${DEV_PROJECT_HOST}`;

describe('locationCheck', () => {
  it('is enforced unless the secret is exactly 1', () => {
    for (const flag of [undefined, '', '0', 'true', 'yes', ' 1']) {
      expect(locationCheck(flag, DEV)).toBe('enforced');
    }
  });

  it('skips only on the local stack and the dev project', () => {
    expect(locationCheck('1', DEV)).toBe('skipped');
    expect(locationCheck('1', 'http://kong:8000')).toBe('skipped');
    expect(locationCheck('1', 'http://127.0.0.1:54321')).toBe('skipped');
  });

  it('ignores the secret on any other project (the pilot)', () => {
    expect(locationCheck('1', 'https://abcdefghijklmnopqrst.supabase.co')).toBe('ignored');
    expect(locationCheck('1', `http://${DEV_PROJECT_HOST}`)).toBe('ignored');
    expect(locationCheck('1', `https://${DEV_PROJECT_HOST}.evil.example`)).toBe('ignored');
    expect(locationCheck('1', undefined)).toBe('ignored');
    expect(locationCheck('1', 'not a url')).toBe('ignored');
  });
});

describe('project urls', () => {
  it('tells the dev project and the local stack apart from everything else', () => {
    expect(isDevProjectUrl(DEV)).toBe(true);
    expect(isDevProjectUrl('https://x.supabase.co')).toBe(false);
    expect(isLocalUrl('http://10.0.2.2:54321')).toBe(true);
    expect(isLocalUrl(DEV)).toBe(false);
  });
});
