/**
 * Safe text normalisation for *matching only*.
 * --------------------------------------------
 * Nothing in this module ever produces the text that is offered back to the
 * user. It only builds lookup keys and similarity inputs, so aggressive folding
 * (lowercasing, quote/dash folding, whitespace collapsing, punctuation
 * trimming) cannot change the meaning of what the user typed.
 */

/** Characters that are safe to fold away for matching. */
const QUOTE_FOLDS: Array<[RegExp, string]> = [
  [/[\u2018\u2019\u201A\u201B]/g, "'"],
  [/[\u201C\u201D\u201E\u201F]/g, '"'],
  [/[\u2013\u2014\u2015]/g, '-'],
  [/[\u2026]/g, '...'],
  [/\u00A0/g, ' '],
];

/**
 * Build a key for exact dataset lookup. Case, surrounding whitespace, quotes,
 * dashes and trailing sentence punctuation are folded away so that
 * "He dont have interest in studies" and "he dont have interest in studies!!"
 * resolve to the same dataset entry.
 */
export function normalizeForMatching(text: string): string {
  let out = text ?? '';
  for (const [pattern, replacement] of QUOTE_FOLDS) {
    out = out.replace(pattern, replacement);
  }
  return out
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;,:\s]+$/g, '')
    .replace(/^[.!?;,:\s]+/g, '')
    .toLowerCase();
}

/** Split into lowercase word tokens, dropping everything that is not a letter,
 *  digit or internal apostrophe. */
export function tokenize(text: string): string[] {
  return (text ?? '')
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * Very small stop-word list used only to decide which tokens carry meaning when
 * comparing two sentences. Keeping it short avoids accidentally discarding a
 * content word.
 */
export const MATCH_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'but', 'as', 'by',
  'from', 'that', 'this', 'these', 'those', 'it', 'its', 'he', 'she', 'they',
  'we', 'you', 'i', 'his', 'her', 'their', 'our', 'your', 'my', 'him', 'them',
  'us', 'do', 'does', 'did', 'has', 'have', 'had', 'not', 'no', 'so', 'too',
  'very', 'than', 'then', 'there', 'here', 'who', 'whom', 'which', 'will',
  'would', 'can', 'could', 'should', 'may', 'might', 'must', 'shall',
]);

/** Content tokens: lowercased word tokens with stop-words and 1-char noise removed. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length > 1 && !MATCH_STOPWORDS.has(t));
}

/** Jaccard similarity of two token sets (0 when either set is empty). */
export function tokenSetSimilarity(aTokens: readonly string[], bTokens: readonly string[]): number {
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr.slice();
  }
  return prev[b.length];
}

/** Normalised similarity ratio in [0, 1] derived from edit distance. */
export function similarityRatio(a: string, b: string): number {
  const longest = Math.max(a.length, b.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(a, b) / longest;
}
