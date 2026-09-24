// Profanity filter for chat and clues (MVP_SPEC §6). The list comes from content/profanity-tr.json
// (via the database); matching uses the same normalize as trText.
import { tokenize } from './trText.ts';

// Words of this many letters or more also match with suffixes ("orospular"); shorter ones only
// as whole words, because Turkish letter folding makes short roots collide with everyday words.
const PREFIX_MIN_LENGTH = 5;

export type PreparedTerms = { words: string[]; phrases: string[] };

export function prepareTerms(terms: readonly string[]): PreparedTerms {
  const words: string[] = [];
  const phrases: string[] = [];
  for (const term of terms) {
    const tokens = tokenize(term);
    if (tokens.length === 1 && tokens[0]) words.push(tokens[0]);
    else if (tokens.length > 1) phrases.push(tokens.join(' '));
  }
  return { words, phrases };
}

export function containsProfanity(text: string, terms: PreparedTerms): boolean {
  // tokenize also joins spaced-out letters ("o r o s p u").
  const tokens = tokenize(text);
  const joined = ` ${tokens.join(' ')} `;
  if (terms.phrases.some((p) => joined.includes(` ${p} `))) return true;
  return tokens.some((token) =>
    terms.words.some((word) =>
      word.length >= PREFIX_MIN_LENGTH ? token.startsWith(word) : token === word,
    ),
  );
}
