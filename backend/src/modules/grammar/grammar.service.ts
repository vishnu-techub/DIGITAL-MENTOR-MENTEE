/**
 * Dataset-based grammar-correction service (no external AI required).
 * -----------------------------------------------------------------
 * The engine is deliberately conservative. It corrects what it can prove and
 * otherwise returns the user's text untouched with an explicit status. It never
 * rewrites a sentence into a new statement and never invents facts.
 *
 * Pipeline (in order):
 *   1. Exact match  - the safely-normalised input equals a curated whole-sentence
 *                     dataset entry. The stored correction is applied verbatim.
 *   2. Approximate  - a very close typo-level variant of a curated sentence, at
 *                     or above a similarity threshold and only when official
 *                     values survive. Below the threshold it is reported as
 *                     ambiguous instead of guessed.
 *   3. Word level   - curated misspelling / proper-noun dictionary, boundary
 *                     matched and skipped for official codes.
 *   4. Phrase rules - ordered fixes for subject-verb agreement, articles,
 *                     prepositions, sentence structure and contraction
 *                     punctuation.
 *   5. Mechanical   - safe capitalisation and terminal punctuation.
 *
 * Status contract:
 *   EXACT_MATCH | APPROXIMATE_MATCH | RULES_APPLIED  -> a reliable correction
 *   NO_RELIABLE_CORRECTION                            -> nothing changed
 *   AMBIGUOUS_INPUT                                   -> close to a correction
 *                                                        but not safe to apply
 */

import {
  AMBIGUOUS_THRESHOLD,
  APPROX_MATCH_CONFIDENCE,
  APPROX_MATCH_THRESHOLD,
  APPROX_TOPIC_FLOOR,
  EXACT_CORRECTIONS,
  EXACT_MATCH_CONFIDENCE,
  PHRASE_RULES,
  RULES_CONFIDENCE,
  WORD_CORRECTIONS,
  type ExactCorrection,
  type GrammarCategory,
} from './grammar.dataset.js';
import {
  contentTokens,
  normalizeForMatching,
  tokenSetSimilarity,
} from './grammar.normalize.js';
import { fixMissingAuxiliaryVerbs } from './grammar.structure.js';
import { applyAdvancedRules } from './grammar.rules.js';
import { correctSpelling } from './grammar.spelling.js';
import { isOfficialToken, preservesProtectedValues } from './protected-values.js';

export type GrammarStatus =
  | 'EXACT_MATCH'
  | 'APPROXIMATE_MATCH'
  | 'RULES_APPLIED'
  | 'NO_RELIABLE_CORRECTION'
  | 'AMBIGUOUS_INPUT'
  | 'EXTERNAL_AI';

export interface GrammarNote {
  category: GrammarCategory;
  label: string;
}

export interface GrammarCorrection {
  /** The caller's exact input, never trimmed or altered. */
  original: string;
  /** The suggestion. Equals `original` when nothing reliable was found. */
  corrected: string;
  hasCorrections: boolean;
  status: GrammarStatus;
  /** 0..1 confidence in the suggestion (0 when nothing was corrected). */
  confidence: number;
  /** What was changed, for display / tests. */
  notes: GrammarNote[];
}

/** A candidate approximate match and its similarity to the input. */
interface ApproximateCandidate {
  entry: ExactCorrection;
  score: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Correct a block of prose. Blank input is returned untouched (never an error),
 * which matches how the writing-assistant endpoint has always behaved.
 */
export function correctText(text: string): GrammarCorrection {
  const original = text ?? '';

  if (!original.trim()) {
    return unchanged(original, 'NO_RELIABLE_CORRECTION');
  }

  // 1. Exact curated sentence match.
  const exact = findExactMatch(original);
  if (exact && preservesProtectedValues(original, exact.right)) {
    const suggested = ensureWellFormed(exact.right);
    if (suggested.trim() !== original.trim()) {
      return {
        original,
        corrected: suggested,
        hasCorrections: true,
        status: 'EXACT_MATCH',
        confidence: EXACT_MATCH_CONFIDENCE,
        notes: [{ category: 'exact', label: exact.note || 'curated sentence correction' }],
      };
    }
  }

  // 2. Approximate sentence match (only near-identical, topic-preserving pairs).
  const approximate = findApproximateMatch(original);
  const approximateAccepted =
    approximate !== null &&
    approximate.score >= APPROX_MATCH_THRESHOLD &&
    preservesProtectedValues(original, approximate.entry.right);

  if (approximateAccepted && approximate) {
    const suggested = ensureWellFormed(approximate.entry.right);
    if (suggested.trim() !== original.trim()) {
      return {
        original,
        corrected: suggested,
        hasCorrections: true,
        status: 'APPROXIMATE_MATCH',
        confidence: APPROX_MATCH_CONFIDENCE,
        notes: [
          {
            category: 'exact',
            label: `close match (${Math.round(approximate.score * 100)}%) to a curated sentence`,
          },
        ],
      };
    }
  }

  // 3-5. Deterministic rules.
  const { corrected, notes } = applyDeterministicRules(original);

  // A sentence that is close to a curated correction but below the accept
  // threshold is ambiguous: return the original rather than guess a rewrite.
  if (
    approximate !== null &&
    approximate.score >= AMBIGUOUS_THRESHOLD &&
    approximate.score < APPROX_MATCH_THRESHOLD
  ) {
    return unchanged(original, 'AMBIGUOUS_INPUT');
  }

  if (corrected.trim() !== original.trim()) {
    return {
      original,
      corrected,
      hasCorrections: true,
      status: 'RULES_APPLIED',
      confidence: RULES_CONFIDENCE,
      notes,
    };
  }

  return unchanged(original, 'NO_RELIABLE_CORRECTION');
}

/** Convenience wrapper used by the HTTP layer / AI fallback. */
export function correctToSuggestion(text: string): string {
  return correctText(text).corrected;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

function unchanged(original: string, status: GrammarStatus): GrammarCorrection {
  return {
    original,
    corrected: original,
    hasCorrections: false,
    status,
    confidence: 0,
    notes: [],
  };
}

function findExactMatch(text: string): ExactCorrection | undefined {
  const key = normalizeForMatching(text);
  if (!key) return undefined;
  return EXACT_CORRECTIONS.find((entry) => normalizeForMatching(entry.wrong) === key);
}

/**
 * Best curated sentence for a typo-level variant of the input. Only entries that
 * opt in via `allowApproximate` are considered, and entries whose own correction
 * changes the topic too much are ignored, so an approximate match can never swap
 * one subject for an unrelated one.
 */
function findApproximateMatch(text: string): ApproximateCandidate | null {
  const inputTokens = contentTokens(text);
  if (inputTokens.length < 3) return null;

  let best: ApproximateCandidate | null = null;

  for (const entry of EXACT_CORRECTIONS) {
    if (!entry.allowApproximate) continue;

    // The curated pair itself must stay on the same topic.
    const topicSimilarity = tokenSetSimilarity(contentTokens(entry.wrong), contentTokens(entry.right));
    if (topicSimilarity < APPROX_TOPIC_FLOOR) continue;

    const score = tokenSetSimilarity(inputTokens, contentTokens(entry.wrong));
    if (score > 0 && (!best || score > best.score)) {
      best = { entry, score };
    }
  }

  return best;
}

/**
 * Word dictionary + ordered phrase rules + safe mechanical fixes. Returns the
 * text and the list of changes so the caller can report what happened.
 */
function applyDeterministicRules(raw: string): { corrected: string; notes: GrammarNote[] } {
  let str = raw.trim();
  const notes: GrammarNote[] = [];

  // --- word-level corrections ---
  const wordHits = new Set<string>();
  str = str.replace(/[A-Za-z][A-Za-z']*/g, (match) => {
    const right = WORD_CORRECTIONS[match.toLowerCase()];
    if (!right) return match;
    // Never rewrite a token that looks like official record data.
    if (isOfficialToken(match)) return match;
    const replacement =
      match[0] === match[0].toUpperCase() && match[0] !== match[0].toLowerCase()
        ? right.charAt(0).toUpperCase() + right.slice(1)
        : right;
    if (replacement !== match) wordHits.add(match.toLowerCase());
    return replacement;
  });
  for (const hit of wordHits) {
    notes.push({ category: 'spelling', label: `${hit} -> ${WORD_CORRECTIONS[hit]}` });
  }

  // --- dictionary-gated spelling correction for unknown words ---
  // Runs after the curated dictionary so a curated fix always wins, and only
  // touches clearly misspelled lowercase words (never names or record data).
  const spellingFix = correctSpelling(str);
  str = spellingFix.corrected;
  for (const fix of spellingFix.fixes) {
    notes.push({ category: 'spelling', label: `${fix.from} -> ${fix.to}` });
  }

  // --- missing auxiliary verb ("student not attending class" -> "The student
  //     is not attending class"). Runs before the phrase rules so the
  //     pluralisation / spacing rules clean up the rebuilt clause afterwards. ---
  const structureFix = fixMissingAuxiliaryVerbs(str);
  str = structureFix.corrected;
  if (structureFix.changed) {
    notes.push({
      category: 'sentence-structure',
      label: 'missing auxiliary verb (is/are) + article',
    });
  }

  // --- ordered phrase / structure rules ---
  for (const rule of PHRASE_RULES) {
    const before = str;
    str = str.replace(rule.pattern, rule.replace);
    if (str !== before) notes.push({ category: rule.category, label: rule.label });
  }

  // --- broad, reusable grammar rules (agreement, verb forms, articles,
  //     quantifier plurals, prepositions). Run after the curated phrase rules so
  //     those keep priority. ---
  const advanced = applyAdvancedRules(str);
  str = advanced.corrected;
  for (const note of advanced.notes) {
    notes.push({ category: note.category, label: note.label });
  }

  // --- whitespace cleanup (keep the original single-space contract) ---
  const beforeSpacing = str;
  str = str.replace(/[ \t]+/g, ' ');
  if (str !== beforeSpacing) notes.push({ category: 'punctuation', label: 'collapse extra spaces' });

  // --- capitalisation ---
  const beforeI = str;
  str = str.replace(/\bi\b/g, 'I');
  if (str !== beforeI) notes.push({ category: 'capitalization', label: 'standalone i -> I' });

  const beforeCap = str;
  if (str.length > 0) {
    str = str.charAt(0).toUpperCase() + str.slice(1);
  }
  str = str.replace(/([.!?]\s+)([a-z])/g, (_m, p1: string, p2: string) => p1 + p2.toUpperCase());
  if (str !== beforeCap) notes.push({ category: 'capitalization', label: 'sentence capitalisation' });

  // --- terminal punctuation ---
  if (str.length > 5 && !/[.!?]$/.test(str)) {
    str += '.';
    notes.push({ category: 'punctuation', label: 'add terminal punctuation' });
  }

  return { corrected: str, notes };
}

/** Make sure a stored correction starts with a capital and ends cleanly. */
function ensureWellFormed(text: string): string {
  let out = text.trim();
  if (out.length === 0) return out;
  out = out.replace(/\bi\b/g, 'I');
  out = out.charAt(0).toUpperCase() + out.slice(1);
  if (out.length > 5 && !/[.!?]$/.test(out)) out += '.';
  return out;
}
