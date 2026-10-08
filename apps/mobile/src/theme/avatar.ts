import { tableAvatar } from '../../../../supabase/functions/_shared/pure/tableAvatar.ts';

import { THEME } from './theme';

// An anonymous table's face (canvas: Aşama 8 · Saha → Masa avatarları): one of twelve game-night
// icons (scripts/icon/glyphs.ts → TABLE_AVATARS) on one of eight discs.
// Aşama 8 · Saha: the discs of the icon avatars (src/components/Avatar.tsx). Stronger than the old
// set so a disc reads on a white card; the ink icon is AA on each (brand.test.ts). Fixed values,
// the same in both schemes: the disc is an object, not a surface.
export const TABLE_AVATAR_COLORS = [
  '#FF8B75',
  '#7FE08F',
  '#A98BFF',
  '#D7F75B',
  '#FFD24D',
  '#8FD3FF',
  '#FF9ACB',
  '#FFB570',
] as const;
// The icon's ink on every disc (the light scheme's text colour).
export const TABLE_AVATAR_INK = THEME.palettes.light.text;

// A table's avatar: icon and disc colour from its alias, the same on every phone (the session id
// never reaches the lobby or the venue chat, and one table must not wear two faces).
export function tableAvatarOf(alias: string): { icon: number; color: string } {
  const { icon, color } = tableAvatar(alias, TABLE_AVATAR_COLORS.length);
  return { icon, color: TABLE_AVATAR_COLORS[color] ?? TABLE_AVATAR_COLORS[0] };
}

// A profile's initials: the first letters of its first two words, upper-cased the Turkish way.
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase('tr-TR') ?? '')
    .join('');
}
