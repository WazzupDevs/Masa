import { THEME } from './theme';

// An anonymous table's avatar: the snail on a disc. Its colour comes from the table alias, so the
// tables in a chat tell apart and one alias looks the same everywhere. Eight light colours the
// ink-outlined snail reads on, in both schemes (the disc is an object, not a surface). Fixed values:
// a palette change must not recolour every table.
const L = THEME.palettes.light;
export const AVATAR_COLORS = [
  '#FFE3F1',
  '#E4F4FF',
  '#FFF0CC',
  '#FF8B75',
  '#7FE08F',
  '#DDD5EA',
  '#A98BFF',
  '#FFFFFF',
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
