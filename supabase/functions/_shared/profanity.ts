import type { Db } from './auth.ts';
import { dbError } from './db.ts';
import { type PreparedTerms, prepareTerms } from './pure/profanity.ts';

// The list from content/profanity-tr.json, loaded once per function instance.
let cached: PreparedTerms | null = null;

export async function loadProfanity(db: Db): Promise<PreparedTerms> {
  if (cached) return cached;
  const { data, error } = await db.from('profanity_terms').select('term, whole_word');
  if (error) throw dbError('profanity_terms', error);
  cached = prepareTerms(
    data.filter((row) => !row.whole_word).map((row) => row.term),
    data.filter((row) => row.whole_word).map((row) => row.term),
  );
  return cached;
}
