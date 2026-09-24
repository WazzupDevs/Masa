// Profanity filter for chat, clues and guesses (MVP_SPEC §6). The list comes from
// content/profanity-tr.json (via the database). Matching lowercases with tr-TR rules but does NOT
// fold Turkish letters: folding makes everyday words collide with listed ones (sık → sik,
// "got it" → göt). ASCII spellings that collide with nothing are listed explicitly instead.
import { tokenize } from './trText.ts';

// Words of this many letters or more also match with suffixes ("orospular"); shorter ones only
// as whole words ("göt" but not "götürdüm"). `wholeWords` are longer terms that also match only
// as whole words because an everyday word starts with them ("ananı" but not "ananın").
const PREFIX_MIN_LENGTH = 5;
const UNFOLDED = { fold: false } as const;

export type PreparedTerms = { prefixes: string[]; exact: string[]; phrases: string[] };

export function prepareTerms(
  terms: readonly string[],
  wholeWords: readonly string[] = [],
): PreparedTerms {
  const prepared: PreparedTerms = { prefixes: [], exact: [], phrases: [] };
  const add = (term: string, wholeWord: boolean) => {
    const tokens = tokenize(term, UNFOLDED);
    const [word] = tokens;
    if (tokens.length > 1) prepared.phrases.push(tokens.join(' '));
    else if (word && !wholeWord && [...word].length >= PREFIX_MIN_LENGTH) {
      prepared.prefixes.push(word);
    } else if (word) prepared.exact.push(word);
  };
  for (const term of terms) add(term, false);
  for (const term of wholeWords) add(term, true);
  return prepared;
}

export function containsProfanity(text: string, terms: PreparedTerms): boolean {
  // tokenize also joins spaced-out letters ("o r o s p u").
  const tokens = tokenize(text, UNFOLDED);
  const joined = ` ${tokens.join(' ')} `;
  if (terms.phrases.some((p) => joined.includes(` ${p} `))) return true;
  return tokens.some(
    (token) => terms.exact.includes(token) || terms.prefixes.some((p) => token.startsWith(p)),
  );
}
