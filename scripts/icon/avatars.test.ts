import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { TABLE_AVATAR_ICONS } from '../../supabase/functions/_shared/pure/tableAvatar.ts';
import { TABLE_AVATARS } from './glyphs.ts';

const glyphTsx = readFileSync(
  resolve(import.meta.dirname, '../../apps/mobile/src/components/Glyph.tsx'),
  'utf8',
);

describe('table avatars', () => {
  it('has as many drawings as tableAvatar picks from', () => {
    expect(TABLE_AVATARS).toHaveLength(TABLE_AVATAR_ICONS);
    expect(new Set(TABLE_AVATARS.map((a) => a.id)).size).toBe(TABLE_AVATARS.length);
  });

  it('are listed in the app in the drawings’ order (the pick is an index)', () => {
    const block = glyphTsx.slice(glyphTsx.indexOf('TABLE_AVATAR_IMAGES'));
    const ids = [...block.matchAll(/assets\/glyph\/avatar-([a-z]+)\.png/g)].map((m) => m[1]);
    expect(ids).toEqual(TABLE_AVATARS.map((a) => a.id));
  });
});
