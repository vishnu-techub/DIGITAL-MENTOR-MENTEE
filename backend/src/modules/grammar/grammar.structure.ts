/**
 * Missing-auxiliary-verb repair for fragmentary mentoring clauses.
 * -----------------------------------------------------------------
 * Mentors frequently write clauses that have a subject and a participle but no
 * finite verb, for example:
 *
 *     "student not attending class regularly"
 *     "he not attending classes regularly"
 *     "she not submitting assignments"
 *     "student facing difficulty in mathematics"
 *
 * The ordered phrase rules only capitalised and punctuated these, which is not a
 * grammatical correction. This module inserts the missing article and auxiliary
 * so the clause becomes a well-formed sentence:
 *
 *     "The student is not attending classes regularly."
 *
 * Safety rules (data in `grammar.dataset.ts`):
 *   - only a curated list of subjects is touched, and only at a sentence start
 *     (optionally after "the");
 *   - only a curated list of "-ing" *verbs* is touched, so noun/adjective
 *     "-ing" words (during, morning, building, ceiling, ...) are never mistaken
 *     for verbs;
 *   - if another finite verb or modal appears after the participle the clause is
 *     a reduced relative ("Students facing difficulty should approach ...") and
 *     is left completely untouched;
 *   - a subject already followed by an auxiliary ("student is attending ...")
 *     never matches, so correct sentences are not rewritten;
 *   - only the article and the auxiliary are inserted. The rest of the clause
 *     (names, dates, marks, identifiers) is copied through verbatim;
 *   - the optional object-plural normalisation runs only when the clause
 *     continues past the object, so a bare clause-final object is never reworded
 *     just for style.
 */

import {
  FINITE_VERB_MARKERS,
  MISSING_AUX_GERUNDS,
  MISSING_AUX_NOUN_SUBJECTS,
  MISSING_AUX_OBJECT_PLURALS,
  MISSING_AUX_SUBJECTS,
} from './grammar.dataset.js';

export interface MissingAuxiliaryFix {
  corrected: string;
  changed: boolean;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Longest-first alternation so "students" is preferred over "student". */
function alternation(values: readonly string[]): string {
  return [...values]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
}

const SUBJECT_ALTERNATION = alternation(Object.keys(MISSING_AUX_SUBJECTS));
const GERUND_ALTERNATION = alternation([...MISSING_AUX_GERUNDS]);

/**
 * A sentence start (string start or just after sentence punctuation), then an
 * optional article, a curated subject, an optional "not", a curated participle,
 * and the remainder of that clause. The tail stops at the next sentence
 * punctuation so a following clause is never part of the match.
 */
const MISSING_AUX_PATTERN = new RegExp(
  `(^|[.!?]\\s+)(the\\s+)?(${SUBJECT_ALTERNATION})\\s+(not\\s+)?(${GERUND_ALTERNATION})\\b([^.!?]*)`,
  'gi'
);

/**
 * Insert a missing article/auxiliary into fragmentary subject + participle
 * clauses. Returns the text unchanged (with `changed === false`) when no safe
 * repair applies.
 */
export function fixMissingAuxiliaryVerbs(text: string): MissingAuxiliaryFix {
  if (!text) return { corrected: text, changed: false };

  let changed = false;

  const corrected = text.replace(
    MISSING_AUX_PATTERN,
    (
      match: string,
      prefix: string,
      _article: string | undefined,
      subject: string,
      neg: string | undefined,
      gerund: string,
      tail: string | undefined
    ) => {
      const lower = subject.toLowerCase();
      const be = MISSING_AUX_SUBJECTS[lower];
      if (!be) return match;

      const rest = tail ?? '';

      // A finite verb / modal after the participle means the "-ing" word is a
      // modifier of a following main verb, not the missing predicate.
      const restTokens = rest.toLowerCase().match(/[a-z']+/g) ?? [];
      if (restTokens.some((token) => FINITE_VERB_MARKERS.has(token))) return match;

      const isNoun = MISSING_AUX_NOUN_SUBJECTS.has(lower);
      const subjectOut = isNoun
        ? lower
        : subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
      const articleOut = isNoun ? 'The ' : '';
      const negOut = neg ? 'not ' : '';

      let rebuilt = `${prefix}${articleOut}${subjectOut} ${be} ${negOut}${gerund}${rest}`;

      // The tail begins with the participle's object. Normalise the object only
      // when the clause continues *beyond* that bare object ("attending class
      // regularly" -> "attending classes regularly"). A bare, clause-final
      // object ("she not attending class") is left exactly as typed, so a short,
      // already-acceptable fragment only receives its missing auxiliary and no
      // other phrase is reworded just for style.
      const tailTokens = rest.trim() ? rest.trim().split(/\s+/) : [];
      if (tailTokens.length > 1) {
        for (const [pattern, replacement] of MISSING_AUX_OBJECT_PLURALS) {
          rebuilt = rebuilt.replace(pattern, replacement);
        }
      }

      if (rebuilt !== match) changed = true;
      return rebuilt;
    }
  );

  return { corrected, changed };
}
