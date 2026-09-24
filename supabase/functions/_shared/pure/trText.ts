// Turkish text matching (MVP_SPEC §6). Dependency-free; used by the app and Edge Functions.
// The only place for text matching (CLAUDE.md rule 7).

const FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

// fold: false keeps ç ğ ı ö ş ü. Profanity matching uses it, because folding makes everyday words
// collide with listed ones (sık → sik, got → göt); Tabu clue and guess checks fold.
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

// Roots of this length or longer match with suffixes; shorter ones only as whole words, so a
// forbidden "kar" does not block "kara" (§6; known trade-off: "karda" is not caught).
const ROOT_PREFIX_MIN_LENGTH = 4;

// True when the clue uses any of the words (the target or a forbidden word) or their roots.
export function containsForbidden(clue: string, words: readonly string[]): boolean {
  const clueTokens = tokenize(clue);
  // A multi-word word also counts written as one ("d i ş f ı r ç a s ı" → "disfircasi").
  const roots = words.flatMap((word) => {
    const tokens = tokenize(word);
    return tokens.length > 1 ? [...tokens, tokens.join('')] : tokens;
  });
  return roots.some((root) =>
    clueTokens.some((token) =>
      [...root].length >= ROOT_PREFIX_MIN_LENGTH ? token.startsWith(root) : token === root,
    ),
  );
}

const MAX_GUESS_SUFFIX = 4;

// Correct when the normalized guess equals the target or starts with it and is at most 4 letters
// longer ("denizde" for "deniz").
export function isCorrectGuess(guess: string, target: string): boolean {
  const g = tokenize(guess).join(' ');
  const t = tokenize(target).join(' ');
  if (!g || !t) return false;
  return g === t || (g.startsWith(t) && [...g].length - [...t].length <= MAX_GUESS_SUFFIX);
}
