/**
 * Official record values that a writing assistant must NEVER alter.
 * -----------------------------------------------------------------
 * The grammar engine corrects *prose*. Register numbers, subject codes, marks,
 * CGPA/SGPA, dates, department acronyms and identifiers are record data that
 * merely happens to share a paragraph with the prose. If a correction would
 * drop, reorder or restate any of them, it is not a correction - it is data
 * corruption.
 *
 * This module is deliberately dependency-free and shared by the dataset engine
 * and the optional external-LLM guard, so both apply exactly the same rule.
 */

/**
 * Capitals used as emphasis rather than as codes. Excluded from the protected
 * set so that shouting prose ("THE STUDENT MUST SUBMIT") is still normalised.
 */
export const ENGLISH_STOPWORDS_UPPER: ReadonlySet<string> = new Set([
  'THE', 'AND', 'FOR', 'NOT', 'BUT', 'YOU', 'ALL', 'CAN', 'WAS', 'ARE', 'HAS', 'HAD',
  'HIS', 'HER', 'ITS', 'OUR', 'WHO', 'WHY', 'HOW', 'MAY', 'MUST', 'SHOULD', 'WILL',
  'WITH', 'FROM', 'THIS', 'THAT', 'THEY', 'THEM', 'THEN', 'THAN', 'VERY', 'MUCH',
  'MANY', 'SOME', 'ONLY', 'ALSO', 'JUST', 'LIKE', 'WELL', 'DUE', 'YES', 'OK',
]);

export const PROTECTED_VALUE_PATTERNS: readonly RegExp[] = [
  /\b\d{1,4}[-/]\d{1,2}[-/]\d{2,4}\b/g, // dates
  // Alphanumeric codes: letters plus at least one digit, in any arrangement, so
  // 24ITT36 / CS101 / NPTEL-2024 all match. Starts with a letter or digit because
  // institutional codes are commonly year-prefixed (24ITT36).
  /\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{3,}\b/g,
  /\b[A-Z]{2,6}\b/g, // short uppercase codes: CSE, ECE, NPTEL, CGPA
  /\b\d+\.\d+\b/g, // decimals: 8.5, 91.4
  /\b\d{4,}\b/g, // long digit runs: register numbers, IDs
];

/**
 * Every protected official value present in `text`, de-duplicated.
 * Order is preserved so the result is stable and easy to assert on.
 */
export function extractProtectedValues(text: string): string[] {
  const found = new Set<string>();

  // Dates are matched first and then masked out, so the year inside
  // "14-03-2026" is not additionally reported as a bare 4-digit ID. Requiring
  // the full date to survive is the stronger and less surprising rule.
  const dates = text.match(PROTECTED_VALUE_PATTERNS[0]) || [];
  const masked = text.replace(PROTECTED_VALUE_PATTERNS[0], (d) => ' '.repeat(d.length));

  for (const date of dates) {
    if (!ENGLISH_STOPWORDS_UPPER.has(date)) found.add(date);
  }

  for (const pattern of PROTECTED_VALUE_PATTERNS.slice(1)) {
    for (const match of masked.match(pattern) || []) {
      // Ordinary words typed in capitals ("THE", "AND") are emphasis, not record
      // data, so they are not protected and remain free to be recased.
      if (!ENGLISH_STOPWORDS_UPPER.has(match)) found.add(match);
    }
  }

  return [...found];
}

/**
 * True when every protected value from `original` still appears verbatim in
 * `candidate`. This is the last line of defence for any correction source, not
 * just an LLM: a candidate that dropped a register number is unsafe.
 */
export function preservesProtectedValues(original: string, candidate: string): boolean {
  const protectedValues = extractProtectedValues(original);
  if (protectedValues.length === 0) return true;
  return protectedValues.every((value) => candidate.includes(value));
}

/**
 * A token that looks like official record data rather than prose: an all-caps
 * word (CSE, CGPA, NPTEL) or a token containing a digit (24ITT36). Such tokens
 * are passed through untouched by the word-level correction step.
 */
export function isOfficialToken(token: string): boolean {
  if (!token || !/[A-Z]/.test(token)) return false;
  return token === token.toUpperCase() || /\d/.test(token);
}
