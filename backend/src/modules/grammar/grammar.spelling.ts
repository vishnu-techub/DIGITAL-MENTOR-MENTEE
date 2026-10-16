/**
 * Conservative dictionary-backed spelling correction.
 * ---------------------------------------------------
 * The curated `WORD_CORRECTIONS` dictionary (in `grammar.dataset.ts`) is the
 * first line of defence and is always applied. This module adds *general*
 * typo detection for words that are not in that dictionary, using the licensed
 * word list in `vocabulary/`.
 *
 * It is intentionally timid. A token is only corrected when ALL of these hold:
 *   - it is all lowercase (so proper nouns and sentence-initial names are safe);
 *   - it is not official record data (codes, numbers, dates);
 *   - it is not a dictionary word, domain word, or a recognised inflection of
 *     one (so "submitted", "mentees" are never touched);
 *   - the lexicon can name exactly ONE common word within edit distance 1
 *     (or, failing that, a single, genuinely common distance-2 word).
 *
 * When in doubt it returns the word unchanged. A wrong "correction" of a name
 * or a technical term is far worse than leaving a typo alone.
 */

import { isOfficialToken } from './protected-values.js';
import { isKnownWord, suggestSpelling } from './vocabulary/lexicon.js';
import { baseVerbOf } from './vocabulary/morphology.js';

export interface SpellingFix {
  from: string;
  to: string;
}

export interface SpellingResult {
  corrected: string;
  fixes: SpellingFix[];
}

/** Never rewrite more than this many words in one pass. */
const MAX_FIXES = 25;

/** True when the token is a plausible inflection of a word we already know. */
function looksLikeKnownInflection(word: string): boolean {
  if (baseVerbOf(word)) return true;

  const tryStems = (stems: string[]): boolean => stems.some((stem) => stem.length >= 3 && isKnownWord(stem));

  // Undo a doubled final consonant ("submitted" -> "submitt" -> "submit").
  const withDeDoubled = (stem: string): string[] => {
    const stems = [stem, `${stem}e`];
    if (stem.length >= 3 && stem.slice(-1) === stem.slice(-2, -1)) stems.push(stem.slice(0, -1));
    return stems;
  };

  if (word.endsWith('ies')) return tryStems([`${word.slice(0, -3)}y`]);
  if (word.endsWith('es')) return tryStems([word.slice(0, -2)]);
  if (word.endsWith('s')) return tryStems([word.slice(0, -1)]);
  if (word.endsWith('iness')) return tryStems([`${word.slice(0, -5)}y`]);
  if (word.endsWith('ness')) return tryStems([word.slice(0, -4)]);
  if (word.endsWith('ment')) return tryStems([word.slice(0, -4), `${word.slice(0, -4)}e`]);
  if (word.endsWith('ing')) return tryStems(withDeDoubled(word.slice(0, -3)));
  if (word.endsWith('ed')) return tryStems(withDeDoubled(word.slice(0, -2)));
  if (word.endsWith('ly')) return tryStems([word.slice(0, -2)]);
  if (word.endsWith('ier') || word.endsWith('iest')) return true; // comparative
  return false;
}

/**
 * Correct clearly misspelled lowercase words. Returns the text plus the list of
 * substitutions, so the caller can report exactly what changed.
 */
export function correctSpelling(text: string): SpellingResult {
  const fixes: SpellingFix[] = [];
  if (!text) return { corrected: text, fixes };

  const corrected = text.replace(/[A-Za-z][A-Za-z']*/g, (token) => {
    if (fixes.length >= MAX_FIXES) return token;
    if (token.length < 4 || token.length > 24) return token;
    if (token.includes("'")) return token; // contraction / possessive
    if (token !== token.toLowerCase()) return token; // proper noun or sentence start

    const lower = token.toLowerCase();
    if (isOfficialToken(token)) return token;
    if (isKnownWord(lower)) return token;
    if (looksLikeKnownInflection(lower)) return token;

    const suggestion = suggestSpelling(lower);
    if (!suggestion || suggestion === lower) return token;

    fixes.push({ from: lower, to: suggestion });
    return suggestion;
  });

  return { corrected, fixes };
}
