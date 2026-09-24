// Turkish text matching (MVP_SPEC §6). Dependency-free; used by the app and Edge Functions.
// The only place for text matching (CLAUDE.md rule 7).

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

// Turkish lowercase, fold ç ğ ı ö ş ü, and turn everything but letters and digits into spaces.
export function normalize(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşü]/g, (c) => FOLD[c] ?? c)
    .replace(/[^\p{L}\p{N}]/gu, ' ');
}
