// Turkish text matching (MVP_SPEC §6). Dependency-free; used by the app and Edge Functions.
// The only place for text matching (CLAUDE.md rule 7).

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

// fold: false keeps ç ğ ı ö ş ü. Profanity matching uses it, because folding makes everyday words
// collide with listed ones (sık → sik, got → göt).
export type TextOptions = { fold?: boolean };

// Turkish lowercase, fold ç ğ ı ö ş ü (unless fold: false), and turn everything but letters and
// digits into spaces.
export function normalize(s: string, { fold = true }: TextOptions = {}): string {
  const lower = s.toLocaleLowerCase('tr-TR');
  const folded = fold ? lower.replace(/[çğıöşü]/g, (c) => FOLD[c] ?? c) : lower;
  return folded.replace(/[^\p{L}\p{N}]/gu, ' ');
}

// Splits a normalized string into words and joins runs of single letters ("d e n i z" → "deniz").
export function tokenize(s: string, options: TextOptions = {}): string[] {
  const tokens: string[] = [];
  let letters = '';
  for (const token of normalize(s, options).split(' ')) {
    if (token === '') continue;
    if ([...token].length === 1) {
      letters += token;
      continue;
    }
    if (letters) tokens.push(letters);
    letters = '';
    tokens.push(token);
  }
  if (letters) tokens.push(letters);
  return tokens;
}
