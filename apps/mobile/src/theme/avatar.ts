import { THEME } from './theme';

// An anonymous table's avatar: the snail on a disc. Its colour comes from the table alias, so the
// tables in a chat tell apart and one alias looks the same everywhere. Eight light palette colours
// the ink-outlined snail reads on, in both schemes (the disc is an object, not a surface).
const L = THEME.palettes.light;
const D = THEME.palettes.dark;
export const AVATAR_COLORS = [
  L.lively,
  L.calm,
  L.surface2,
  D.danger,
  D.success,
  L.divider,
  D.accent,
  L.surface,
] as const;

// Sum of the alias's UTF-16 code units, mod the colour count (the canvas's rule).
export function aliasColor(alias: string): string {
  let sum = 0;
  for (let i = 0; i < alias.length; i++) sum += alias.charCodeAt(i);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length] ?? L.surface;
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
