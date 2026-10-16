/**
 * Dictionary-backed vocabulary layer.
 * -----------------------------------
 * Loads two licensed word lists once (lazily, then cached for the process) and
 * exposes a *conservative* API:
 *
 *   - `isKnownWord`     : "is this a real English word?" used only to avoid
 *                         flagging / correcting legitimate text.
 *   - `suggestSpelling` : a single, high-confidence correction for an unknown
 *                         word, or `undefined` when the answer is not certain.
 *
 * The load is a one-time synchronous read of ~4.6 MB of text at first use; the
 * resulting `Set`/`Map` are reused for every request, so no per-request disk
 * access and no repeated parsing happen. See `data/SOURCES.md` for provenance
 * and licences.
 *
 * Sources (documented in data/SOURCES.md):
 *   words_alpha.txt  - dwyl/english-words, The Unlicense (public domain)
 *   en_50k.txt       - hermitdave/FrequencyWords, MIT
 */

import fs from 'fs';
import path from 'path';
import { DOMAIN_WORDS } from './domain-vocabulary.js';

interface Lexicon {
  available: boolean;
  words: Set<string>;
  frequency: Map<string, number>;
  /** For diagnostics / benchmarks. */
  wordCount: number;
  frequencyCount: number;
  loadMs: number;
  sourceDir: string | null;
}

let lexicon: Lexicon | null = null;
let warnedOnce = false;
const suggestionCache = new Map<string, string | null>();

/**
 * Very short words are left alone. Below five letters a single edit is too
 * likely to be a real-but-unknown word ("qubit" -> "quit"), so the corrector
 * only reasons about words long enough for an edit to be a genuine typo. This
 * also blocks any suggestion whose target is shorter than five letters.
 */
const MIN_SUGGEST_LENGTH = 5;
const MAX_SUGGEST_LENGTH = 24;

/**
 * Archaic / obsolete spellings that the general dictionary still lists but that
 * are recorded as errors in modern writing ("untill", "enviroment"). Removing
 * them makes the dictionary-gated spelling corrector able to offer the modern
 * spelling. The set is deliberately tiny and only names forms that are never
 * intended.
 */
const NON_WORD_ENTRIES: ReadonlySet<string> = new Set(['untill', 'tommorrow', 'enviroment']);

function candidateDirs(): string[] {
  const fromModule = __dirname;
  return [
    path.join(fromModule, 'data'),
    path.resolve(fromModule, '..', '..', '..', '..', 'src', 'modules', 'grammar', 'vocabulary', 'data'),
    path.join(process.cwd(), 'src', 'modules', 'grammar', 'vocabulary', 'data'),
    path.join(process.cwd(), 'backend', 'src', 'modules', 'grammar', 'vocabulary', 'data'),
  ];
}

function findDataDir(): string | null {
  for (const dir of candidateDirs()) {
    try {
      if (
        fs.existsSync(path.join(dir, 'words_alpha.txt')) &&
        fs.existsSync(path.join(dir, 'en_50k.txt'))
      ) {
        return dir;
      }
    } catch {
      // ignore and try the next candidate
    }
  }
  return null;
}

function parseFrequencyFile(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const space = line.indexOf(' ');
    if (space <= 0) continue;
    const word = line.slice(0, space).trim().toLowerCase();
    const count = Number(line.slice(space + 1).trim());
    if (word && Number.isFinite(count)) map.set(word, count);
  }
  return map;
}

function ensureLoaded(): Lexicon {
  if (lexicon) return lexicon;

  const started = Date.now();
  const dir = findDataDir();

  if (!dir) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn(
        '[grammar] Vocabulary data not found; dictionary-backed spelling/validation is disabled. ' +
          'Expected words_alpha.txt and en_50k.txt in modules/grammar/vocabulary/data.'
      );
    }
    lexicon = {
      available: false,
      words: new Set(),
      frequency: new Map(),
      wordCount: 0,
      frequencyCount: 0,
      loadMs: 0,
      sourceDir: null,
    };
    return lexicon;
  }

  let words = new Set<string>();
  let frequency = new Map<string, number>();
  try {
    const wordsRaw = fs.readFileSync(path.join(dir, 'words_alpha.txt'), 'utf8');
    for (const line of wordsRaw.split(/\r?\n/)) {
      const word = line.trim().toLowerCase();
      if (word) words.add(word);
    }
    for (const nonWord of NON_WORD_ENTRIES) words.delete(nonWord);
    frequency = parseFrequencyFile(fs.readFileSync(path.join(dir, 'en_50k.txt'), 'utf8'));
  } catch (err) {
    if (!warnedOnce) {
      warnedOnce = true;
      console.warn('[grammar] Failed to read vocabulary data:', (err as Error).message);
    }
    words = new Set();
    frequency = new Map();
  }

  lexicon = {
    available: words.size > 0,
    words,
    frequency,
    wordCount: words.size,
    frequencyCount: frequency.size,
    loadMs: Date.now() - started,
    sourceDir: words.size > 0 ? dir : null,
  };
  return lexicon;
}

/** True when the word (lowercase, letters only) is in the dictionary. */
export function isDictionaryWord(word: string): boolean {
  const lex = ensureLoaded();
  if (!lex.available) return false;
  return lex.words.has(word.toLowerCase());
}

/** True when a token is a known word, either domain vocabulary or dictionary. */
export function isKnownWord(word: string): boolean {
  const lower = word.toLowerCase();
  if (DOMAIN_WORDS.has(lower)) return true;
  return isDictionaryWord(lower);
}

/** Generate all words one edit away from `word` (deletes/transposes/replaces/inserts). */
function edits1(word: string): Set<string> {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const result = new Set<string>();
  for (let i = 0; i <= word.length; i += 1) {
    if (i < word.length) {
      result.add(word.slice(0, i) + word.slice(i + 1)); // delete
      if (i + 1 < word.length) {
        result.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)); // transpose
      }
    }
    for (let j = 0; j < letters.length; j += 1) {
      const ch = letters[j];
      if (i < word.length) result.add(word.slice(0, i) + ch + word.slice(i + 1)); // replace
      result.add(word.slice(0, i) + ch + word.slice(i)); // insert
    }
  }
  return result;
}

/**
 * A single, high-confidence spelling suggestion, or `undefined` when the input
 * is unknown and the correction is not unambiguous. Only candidates that are
 * themselves common (present in the 50k frequency list) are ever offered.
 */
export function suggestSpelling(word: string): string | undefined {
  const lex = ensureLoaded();
  if (!lex.available) return undefined;

  const w = word.toLowerCase();
  if (w.length < MIN_SUGGEST_LENGTH || w.length > MAX_SUGGEST_LENGTH) return undefined;
  if (!/^[a-z]+$/.test(w)) return undefined;
  if (lex.words.has(w) || DOMAIN_WORDS.has(w)) return undefined;

  const cached = suggestionCache.get(w);
  if (cached !== undefined) return cached ?? undefined;

  // Only an *unambiguous* one-edit correction is offered: exactly one common
  // dictionary word must exist at edit distance 1. Two or more candidates (or
  // none) means the answer is not certain, so the word is left alone. A
  // distance-2 fallback was trialled and removed: it turned unknown coinages
  // ("xyzzy" -> "dizzy") into wrong corrections, which the safety model forbids.
  const distanceOne = new Set<string>();
  for (const candidate of edits1(w)) {
    if (candidate.length < MIN_SUGGEST_LENGTH) continue;
    if (lex.words.has(candidate) && lex.frequency.has(candidate)) distanceOne.add(candidate);
  }

  const answer = distanceOne.size === 1 ? [...distanceOne][0] : undefined;

  suggestionCache.set(w, answer ?? null);
  return answer;
}

export interface LexiconStats {
  available: boolean;
  wordCount: number;
  frequencyCount: number;
  loadMs: number;
  sourceDir: string | null;
  cachedSuggestions: number;
  heapUsedMb: number;
}

/** Load the lexicon on demand and report memory / size statistics. */
export function getLexiconStats(): LexiconStats {
  const lex = ensureLoaded();
  return {
    available: lex.available,
    wordCount: lex.wordCount,
    frequencyCount: lex.frequencyCount,
    loadMs: lex.loadMs,
    sourceDir: lex.sourceDir,
    cachedSuggestions: suggestionCache.size,
    heapUsedMb: Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10,
  };
}

/** Ensure the dictionary is loaded (used by the startup warm-up / benchmarks). */
export function warmUpLexicon(): LexiconStats {
  ensureLoaded();
  return getLexiconStats();
}
