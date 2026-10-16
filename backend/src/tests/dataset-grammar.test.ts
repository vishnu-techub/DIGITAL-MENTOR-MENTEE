/**
 * Dataset-based grammar engine - focused verification suite.
 * ----------------------------------------------------------
 * Exercises the deterministic engine directly (no server, no external AI) and
 * covers the behaviours the feature promises:
 *
 *   - exact curated sentence matches
 *   - punctuation and capitalization
 *   - subject-verb agreement, articles and prepositions
 *   - unknown but well-formed text -> "no reliable correction found"
 *   - ambiguous text -> returned unchanged, explicit status
 *   - meaning preservation: official values survive, no topic substitution
 *   - deterministic output
 *   - dataset integrity (no duplicate keys, no broken entries)
 *
 * Run with:  npm --prefix backend run test:grammar-dataset
 */
import { correctText, type GrammarStatus } from '../modules/grammar/grammar.service';
import {
  APPROX_MATCH_THRESHOLD,
  APPROX_TOPIC_FLOOR,
  EXACT_CORRECTIONS,
  FINITE_VERB_MARKERS,
  MISSING_AUX_GERUNDS,
  MISSING_AUX_NOUN_SUBJECTS,
  MISSING_AUX_SUBJECTS,
  PHRASE_RULES,
  WORD_CORRECTIONS,
} from '../modules/grammar/grammar.dataset';
import { contentTokens, normalizeForMatching, tokenSetSimilarity } from '../modules/grammar/grammar.normalize';
import { preservesProtectedValues } from '../modules/grammar/protected-values';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${requirement}`);
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

const VALID_STATUSES: GrammarStatus[] = [
  'EXACT_MATCH',
  'APPROXIMATE_MATCH',
  'RULES_APPLIED',
  'NO_RELIABLE_CORRECTION',
  'AMBIGUOUS_INPUT',
  'EXTERNAL_AI',
];

function run() {
  console.log('\n=== Dataset-based grammar engine ===');

  // -------------------------------------------------------------------------
  section('Exact curated sentence matches');
  for (const entry of EXACT_CORRECTIONS) {
    const res = correctText(entry.wrong);
    check(
      `"${entry.wrong.slice(0, 42)}..." matches exactly`,
      res.status === 'EXACT_MATCH' && res.corrected === entry.right,
      `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
    );
  }

  {
    // Case, extra whitespace and trailing punctuation must not defeat a match.
    const noisy = '  Student   is not good in communication and he need improve presentation skill!! ';
    const res = correctText(noisy);
    check(
      'exact match tolerates case/whitespace/punctuation noise',
      res.status === 'EXACT_MATCH' && res.corrected === EXACT_CORRECTIONS[0].right,
      `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
    );
    check('the original is echoed back verbatim', res.original === noisy, JSON.stringify(res.original));

    // A sentence typed entirely in capitals is treated conservatively by the
    // whole-sentence dataset path (an all-caps token may be an official code),
    // but the case-insensitive structural rule still produces the full fix.
    const shouted = 'STUDENT IS NOT GOOD IN COMMUNICATION AND HE NEED IMPROVE PRESENTATION SKILL';
    const shoutedRes = correctText(shouted);
    check(
      'all-caps prose is still corrected without losing words',
      shoutedRes.hasCorrections && shoutedRes.corrected === EXACT_CORRECTIONS[0].right,
      `status=${shoutedRes.status} corrected=${JSON.stringify(shoutedRes.corrected)}`
    );
  }

  // -------------------------------------------------------------------------
  section('Approximate match with a similarity threshold');
  {
    // One stop-word differs ("on" vs "in"); content and meaning are identical.
    const near = 'student has low attendance and not concentrating on class';
    const res = correctText(near);
    check(
      'a near-identical variant is corrected',
      res.status === 'APPROXIMATE_MATCH' &&
        res.corrected === 'The student has low attendance and is not concentrating in class.',
      `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
    );
    check('approximate corrections still report hasCorrections', res.hasCorrections === true);
    check(
      'threshold is a real, documented number',
      APPROX_MATCH_THRESHOLD > 0.8 && APPROX_MATCH_THRESHOLD <= 1
    );
  }

  // -------------------------------------------------------------------------
  section('Ambiguous input is never rewritten');
  {
    // Very close to a curated sentence, but "clearly" adds information the
    // curated correction would drop -> refuse and surface the status.
    const ambiguous = 'student is very poor in english and not able to communicate clearly';
    const res = correctText(ambiguous);
    check(
      'ambiguous input is returned unchanged',
      res.corrected === ambiguous && res.hasCorrections === false,
      `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
    );
    check('ambiguous input reports the ambiguous status', res.status === 'AMBIGUOUS_INPUT', res.status);
    check('nothing is fabricated for ambiguous input', res.notes.length === 0, JSON.stringify(res.notes));
  }

  // -------------------------------------------------------------------------
  section('Unknown but well-formed text');
  {
    const alreadyCorrect = 'The student has good communication skills.';
    const res = correctText(alreadyCorrect);
    check(
      'a clean sentence reports no reliable correction',
      res.status === 'NO_RELIABLE_CORRECTION' && res.corrected === alreadyCorrect && res.hasCorrections === false,
      `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
    );
    check('the original is preserved byte for byte', res.corrected === res.original);

    const blank = correctText('   ');
    check(
      'blank input is returned untouched with no correction',
      blank.corrected === '   ' && blank.hasCorrections === false && blank.status === 'NO_RELIABLE_CORRECTION',
      `status=${blank.status} corrected=${JSON.stringify(blank.corrected)}`
    );

    const noNumbers = correctText('this observation should stay exactly the same');
    check(
      'a plain sentence is corrected only mechanically and invents nothing',
      res.corrected === alreadyCorrect && !/\d/.test(noNumbers.corrected),
      JSON.stringify(noNumbers.corrected)
    );
  }

  // -------------------------------------------------------------------------
  section('Punctuation');
  {
    const res = correctText('the student doesnt attend regularly');
    check(
      'missing contraction apostrophe is fixed',
      res.corrected === "The student doesn't attend regularly.",
      JSON.stringify(res.corrected)
    );
    check('the correction is tagged as punctuation/capitalization', res.notes.length > 0, JSON.stringify(res.notes));

    const spaced = correctText('the student is weak in maths , and needs practice');
    check(
      'space before punctuation is removed',
      !/\s,/.test(spaced.corrected) && spaced.corrected.endsWith('.'),
      JSON.stringify(spaced.corrected)
    );

    const noStop = correctText('she will improve');
    check('terminal punctuation is added to a sentence', noStop.corrected.endsWith('.'), JSON.stringify(noStop.corrected));
  }

  // -------------------------------------------------------------------------
  section('Capitalization');
  {
    const first = correctText('student needs to improve communication skills');
    check('the first letter is capitalised', /^[A-Z]/.test(first.corrected), first.corrected);

    const pronoun = correctText('i will meet the student');
    check('standalone lowercase i becomes I', /\bI\b/.test(pronoun.corrected), pronoun.corrected);

    const afterPeriod = correctText('the meeting ended. student was attentive');
    check(
      'a sentence after a period is capitalised',
      /\.\s+Student\b/.test(afterPeriod.corrected),
      afterPeriod.corrected
    );

    const proper = correctText('we discussed it on friday');
    check('weekday proper noun is capitalised', /\bFriday\b/.test(proper.corrected), proper.corrected);
  }

  // -------------------------------------------------------------------------
  section('Spelling, subject-verb, articles and prepositions');
  {
    const spelling = correctText('he has poor comunication skill and low attendence');
    check(
      'misspellings are corrected and skills pluralised',
      spelling.corrected === 'He has poor communication skills and low attendance.',
      spelling.corrected
    );

    const sva = correctText('student have difficulty in communication and he need improve');
    check(
      'subject-verb agreement is fixed',
      /student has/i.test(sva.corrected) && /he needs to improve/i.test(sva.corrected),
      sva.corrected
    );

    const article = correctText('he is an student with a apple');
    check(
      'articles are corrected before vowel/consonant sounds',
      /\ba student\b/.test(article.corrected) && /\ban apple\b/.test(article.corrected),
      article.corrected
    );

    const preposition = correctText('the parents are not aware about the progress and we discuss about it');
    check(
      'fixed-expression prepositions are corrected',
      /\baware of\b/.test(preposition.corrected) && !/discuss about/i.test(preposition.corrected),
      preposition.corrected
    );
  }

  // -------------------------------------------------------------------------
  section('Missing auxiliary verb (fragment) repair');
  {
    const fragmentCases: Array<[string, string]> = [
      ['student not attending class regularly', 'The student is not attending classes regularly.'],
      ['he not attending classes regularly', 'He is not attending classes regularly.'],
      ['she not submitting assignments', 'She is not submitting assignments.'],
      ['student facing difficulty in mathematics', 'The student is facing difficulty in mathematics.'],
      // Reported failure from the running Mentoring form: "coming" was missing
      // from the curated participle set, so subject + "not" + "coming" was never
      // repaired.
      ['he not coming tomorrow', 'He is not coming tomorrow.'],
      ['student not coming tomorrow', 'The student is not coming tomorrow.'],
      // A bare, clause-final object is only given its missing auxiliary (the
      // object itself is left exactly as typed).
      ['she not attending class', 'She is not attending class.'],
      ['they not submitting assignments', 'They are not submitting assignments.'],
    ];
    for (const [input, expected] of fragmentCases) {
      const res = correctText(input);
      check(
        `"${input}" -> "${expected}"`,
        res.corrected === expected,
        `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
      );
    }

    const repaired = correctText('student not attending class regularly');
    check(
      'the repair is reported as a structural change',
      repaired.notes.some((n) => n.category === 'sentence-structure'),
      JSON.stringify(repaired.notes)
    );
    check(
      'a plural subject takes "are", not "is"',
      correctText('they not attending classes').corrected === 'They are not attending classes.',
      correctText('they not attending classes').corrected
    );

    // A subject already carrying an auxiliary must never be rewritten.
    const alreadyCorrect = 'The student is attending class regularly.';
    const already = correctText(alreadyCorrect);
    check(
      'an already-correct clause is not rewritten',
      already.corrected === alreadyCorrect,
      `status=${already.status} corrected=${JSON.stringify(already.corrected)}`
    );

    // A reduced relative clause must be left completely alone.
    const reduced = 'Students facing difficulty should approach the mentor.';
    const reducedRes = correctText(reduced);
    check(
      'a reduced relative clause is not mistaken for a fragment',
      reducedRes.corrected === reduced,
      `status=${reducedRes.status} corrected=${JSON.stringify(reducedRes.corrected)}`
    );

    // Names, codes, marks and dates in the tail survive verbatim.
    const withValuesInput = 'student not attending classes regularly since 14-03-2026';
    const withValues = correctText(withValuesInput);
    check(
      'official values after the participle survive the repair',
      withValues.corrected.includes('14-03-2026') && preservesProtectedValues(withValuesInput, withValues.corrected),
      withValues.corrected
    );

    // A correct plural clause is returned exactly as typed.
    const correctPlural = 'The student is not attending classes regularly.';
    check(
      'a correct plural clause is returned unchanged',
      correctText(correctPlural).corrected === correctPlural,
      correctText(correctPlural).corrected
    );

    // Now that "coming" is a known participle, an existing auxiliary must still
    // never be rewritten.
    for (const already of [
      'He is not coming tomorrow.',
      'She is attending class.',
      'They are submitting assignments.',
      'The student is not coming tomorrow.',
    ]) {
      const res = correctText(already);
      check(
        `already-correct "${already}" is returned unchanged`,
        res.corrected === already,
        `status=${res.status} corrected=${JSON.stringify(res.corrected)}`
      );
    }

    // A reduced relative clause (a finite verb / modal follows the participle) is
    // still left completely alone now that "coming" is a known participle.
    const reducedComing = 'Students coming late should report to the mentor.';
    check(
      'a reduced relative with "coming" + modal is not mistaken for a fragment',
      correctText(reducedComing).corrected === reducedComing,
      correctText(reducedComing).corrected
    );

    // Punctuation variants must stay stable.
    check(
      '"he not coming tomorrow" gains only the auxiliary and a period',
      correctText('he not coming tomorrow').corrected === 'He is not coming tomorrow.'
    );
    check(
      'an already-punctuated fragment stays stable',
      correctText('he not coming tomorrow.').corrected === 'He is not coming tomorrow.'
    );
    check(
      'a question form keeps its "?"',
      correctText('he not coming tomorrow?').corrected === 'He is not coming tomorrow?',
      correctText('he not coming tomorrow?').corrected
    );
  }

  // -------------------------------------------------------------------------
  section('Meaning preservation and no unrelated substitution');
  {
    const input = 'Kavitha R (731523104999) of 24ITT36 scored 8.75 CGPA on 14-03-2026 and she dont attend classes';
    const res = correctText(input);
    for (const value of ['Kavitha R', '731523104999', '24ITT36', '8.75', '14-03-2026']) {
      check(`"${value}" survives the correction`, res.corrected.includes(value), res.corrected);
    }
    check('the correction is a real change', res.hasCorrections === true, res.status);
    check(
      'protected values pass the shared guard',
      preservesProtectedValues(input, res.corrected),
      res.corrected
    );

    // A short, similar-looking sentence must NOT be rewritten into a different topic.
    const attendanceOnly = correctText('student has poor attendance');
    check(
      'a sentence about attendance is not rewritten into a sentence about communication',
      !/communication/i.test(attendanceOnly.corrected) && /attendance/i.test(attendanceOnly.corrected),
      attendanceOnly.corrected
    );

    // No numbers or facts may be invented where none existed.
    const noFacts = correctText('the student needs motivation and guidance');
    check(
      'no number or date is invented',
      !/\d/.test(noFacts.corrected) && !/\b(?:CGPA|arrear)\b/i.test(noFacts.corrected),
      noFacts.corrected
    );
  }

  // -------------------------------------------------------------------------
  section('Deterministic and well-formed output');
  {
    const input = 'student have difficulty in comunication';
    const a = correctText(input);
    const b = correctText(input);
    check('the same input yields the same correction', a.corrected === b.corrected, `${a.corrected} vs ${b.corrected}`);
    check('a non-empty correction is always capitalised and terminated', /^[A-Z]/.test(a.corrected) && /[.!?]$/.test(a.corrected), a.corrected);
    check('the returned status is always a documented value', VALID_STATUSES.includes(a.status), a.status);
    check('confidence is within [0, 1]', a.confidence >= 0 && a.confidence <= 1, String(a.confidence));
  }

  // -------------------------------------------------------------------------
  section('Dataset integrity');
  {
    const keys = EXACT_CORRECTIONS.map((e) => normalizeForMatching(e.wrong));
    check('exact-correction keys are unique after normalisation', new Set(keys).size === keys.length, keys.join(' | '));
    check(
      'every exact correction is non-empty',
      EXACT_CORRECTIONS.every((e) => e.wrong.trim().length > 0 && e.right.trim().length > 0)
    );
    check(
      'every approximate pair keeps the same topic',
      EXACT_CORRECTIONS.filter((e) => e.allowApproximate).every(
        (e) => tokenSetSimilarity(contentTokens(e.wrong), contentTokens(e.right)) >= APPROX_TOPIC_FLOOR
      )
    );
    check(
      'every word correction maps to a different, non-empty word',
      Object.entries(WORD_CORRECTIONS).every(([k, v]) => v.trim().length > 0 && v !== k)
    );
    check('the rule list is non-empty and each rule has a label', PHRASE_RULES.length > 0 && PHRASE_RULES.every((r) => r.label.length > 0));

    check(
      'every missing-auxiliary subject maps to is/are',
      Object.values(MISSING_AUX_SUBJECTS).every((v) => v === 'is' || v === 'are')
    );
    check(
      'every curated participle is an -ing verb form',
      MISSING_AUX_GERUNDS.size > 0 && [...MISSING_AUX_GERUNDS].every((g) => /^[a-z]+ing$/.test(g))
    );
    check(
      'noun subjects are a subset of the repair subjects',
      [...MISSING_AUX_NOUN_SUBJECTS].every((s) => s in MISSING_AUX_SUBJECTS)
    );
    check(
      'no finite-verb guard word is also a curated participle',
      [...FINITE_VERB_MARKERS].every((v) => !MISSING_AUX_GERUNDS.has(v))
    );
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

run();
