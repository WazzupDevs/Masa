import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_NAME } from '../supabase/functions/_shared/pure/brand.ts';

// app.config.ts may not import brand.ts (Node before 22.18 cannot load a .ts import), so the launcher
// and store name is written in app.json; this keeps the two equal.
describe('app name', () => {
  it('app.json name is APP_NAME', () => {
    const appJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../apps/mobile/app.json'), 'utf8'),
    ) as { expo: { name?: string } };
    expect(appJson.expo.name).toBe(APP_NAME);
  });

  it('app.config.ts imports no .ts file', () => {
    const config = readFileSync(
      resolve(import.meta.dirname, '../apps/mobile/app.config.ts'),
      'utf8',
    );
    expect(config).not.toMatch(/from\s+['"][^'"]+\.ts['"]/);
  });
});
