/**
 * Grammar & Spelling Assistant - protection and API-behaviour suite.
 *
 * Covers the safety rules the feature promises:
 *   - spelling and grammar are actually corrected
 *   - official values (names, register numbers, subject codes, marks, CGPA/SGPA,
 *     dates, IDs) are never altered, not even by a hostile "correction"
 *   - an empty or unchanged input is not reported as corrected
 *   - no API key, model name or provider error can reach the client
 *
 * Run with:  npm --prefix backend run test:grammar-safety
 */
import {
  correctGrammarAndSpelling,
  extractProtectedValues,
  preservesProtectedValues,
  sanitizeLlmOutput,
} from '../modules/counselling/ai-assistant.service';

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

async function section(title: string, fn: () => Promise<void> | void) {
  console.log(`\n${title}`);
  await fn();
}

async function run() {
  console.log('\n=== Grammar & Spelling Assistant safety ===');

  // -------------------------------------------------------------------------
  await section('Spelling correction', async () => {
    const res = await correctGrammarAndSpelling('student has attendence problem in second semester');
    check('misspelling "attendence" is corrected', !/attendence/i.test(res.corrected), res.corrected);
    check('spelling fix is reported as a correction', res.hasCorrections === true);
    check('"attendance" appears in the result', /attendance/i.test(res.corrected), res.corrected);

    const res2 = await correctGrammarAndSpelling('he have poor comunication skill');
    check('misspelling "comunication" is corrected', !/comunication/i.test(res2.corrected), res2.corrected);
    check('"communication" appears in the result', /communication/i.test(res2.corrected), res2.corrected);
  });

  // -------------------------------------------------------------------------
  await section('Grammar correction', async () => {
    const res = await correctGrammarAndSpelling('student need improve communication skill');
    check('subject-verb agreement is fixed', /student needs to improve/i.test(res.corrected), res.corrected);
    check('sentence is capitalised', /^[A-Z]/.test(res.corrected.trim()), res.corrected);
    check('sentence is terminated', /[.!?]$/.test(res.corrected.trim()), res.corrected);

    const res2 = await correctGrammarAndSpelling('she wanted to developed her knowledge');
    check('"to developed" becomes "to develop"', /wanted to develop\b/.test(res2.corrected), res2.corrected);

    const res3 = await correctGrammarAndSpelling('practice presentation every week');
    check('"presentation" is pluralised to "presentations"', /presentations/.test(res3.corrected), res3.corrected);
  });

  // -------------------------------------------------------------------------
  await section('Meaning is preserved, nothing invented', async () => {
    const input = 'mentor told student to submit project before friday';
    const res = await correctGrammarAndSpelling(input);
    check('the word "project" survives', /project/i.test(res.corrected), res.corrected);
    check('the word "submit" survives', /submit/i.test(res.corrected), res.corrected);
    check('the day "friday" survives', /friday/i.test(res.corrected), res.corrected);
    check('no new CGPA figure is invented', !/\b\d+\.\d+\b/.test(res.corrected), res.corrected);

    const empty = await correctGrammarAndSpelling('   ');
    check('blank input is returned untouched', empty.corrected === '   ' && empty.hasCorrections === false);
  });

  // -------------------------------------------------------------------------
  await section('Official values are protected', () => {
    const withValues =
      'Kavitha R (731523104999) of 24ITT36 scored 8.75 CGPA and 91.4% attendance on 14-03-2026 in CSE department.';
    const values = extractProtectedValues(withValues);
    for (const expected of ['731523104999', '24ITT36', '8.75', '91.4', '14-03-2026', 'CSE']) {
      check(`"${expected}" is recognised as a protected value`, values.includes(expected), values.join(', '));
    }
    check('"attendance" is NOT protected (it is ordinary prose)', !values.includes('attendance'), values.join(', '));
    check(
      'capitals used as emphasis are not protected',
      !extractProtectedValues('THE STUDENT MUST SUBMIT THE FORM').includes('THE'),
      extractProtectedValues('THE STUDENT MUST SUBMIT THE FORM').join(', ')
    );

    check(
      'a correction that keeps every value is accepted',
      preservesProtectedValues(
        withValues,
        'Kavitha R (731523104999) of CSE scored an 8.75 CGPA with 91.4% attendance on 14-03-2026 in 24ITT36.'
      )
    );
    check(
      'a correction that drops the register number is rejected',
      !preservesProtectedValues(withValues, 'Kavitha R scored a good CGPA.')
    );
    check(
      'a correction that alters the CGPA is rejected',
      !preservesProtectedValues(withValues, 'Kavitha R (731523104999) scored 9.75 CGPA.')
    );
    check(
      'a correction that rewrites the subject code is rejected',
      !preservesProtectedValues(withValues, 'Kavitha R (731523104999) of 24ITT55 scored 8.75 CGPA.')
    );
    check(
      'a correction that changes the date is rejected',
      !preservesProtectedValues(withValues, 'Kavitha R (731523104999) on 15-03-2026 scored 8.75 CGPA.')
    );
    check(
      'a correction that drops the attendance figure is rejected',
      !preservesProtectedValues(
        withValues,
        'Kavitha R (731523104999) of CSE scored an 8.75 CGPA on 14-03-2026 in 24ITT36.'
      )
    );
    check(
      'prose with no official values is never blocked',
      preservesProtectedValues('student need improve skill', 'The student needs to improve their skills.')
    );
  });

  // -------------------------------------------------------------------------
  await section('The rule engine never edits official codes', async () => {
    const res = await correctGrammarAndSpelling(
      'student attend 24ITT36 lab and give presentation on comunication'
    );
    check('subject code 24ITT36 is untouched', res.corrected.includes('24ITT36'), res.corrected);
    check('prose around it is still corrected', !/comunication/i.test(res.corrected), res.corrected);
  });

  // -------------------------------------------------------------------------
  await section('Model output is sanitised before it is shown', () => {
    check('fenced output is unwrapped', sanitizeLlmOutput('```\nShe wanted to develop.\n```') === 'She wanted to develop.');
    check('fenced output with a language tag is unwrapped', sanitizeLlmOutput('```text\nFixed text.\n```') === 'Fixed text.');
    check('surrounding quotes are removed', sanitizeLlmOutput('"She wanted to develop."') === 'She wanted to develop.');
    check('a leading "Corrected text:" label is removed', sanitizeLlmOutput('Corrected text: She wanted to develop.') === 'She wanted to develop.');
    check('a leading "Corrected:" label is removed', sanitizeLlmOutput('Corrected: She wanted to develop.') === 'She wanted to develop.');
    check('clean prose is passed through unchanged', sanitizeLlmOutput('She wanted to develop.') === 'She wanted to develop.');
    check(
      'a long multi-paragraph commentary reply is discarded',
      sanitizeLlmOutput('Here is my analysis:\n\n1. Point one\n2. Point two\n3. Point three\n4. Point four\n5. Point five\n6. Six') === ''
    );
  });

  // -------------------------------------------------------------------------
  await section('No secret can reach the client', async () => {
    const res = await correctGrammarAndSpelling('student need improve communication skill');
    const serialised = JSON.stringify(res);
    check('the API key never appears in the response', !/AI_API_KEY|apiKey|sk-|AIza/i.test(serialised), serialised);
    check('the model name never appears in the response', !/gemini|gpt|openai/i.test(serialised), serialised);
    check(
      'only the four documented fields are returned',
      Object.keys(res).sort().join(',') === 'corrected,hasCorrections,original,source',
      Object.keys(res).join(',')
    );
    check('source is a fixed enum value', res.source === 'LLM' || res.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', res.source);
  });

  // -------------------------------------------------------------------------
  await section('Deterministic output', async () => {
    const input = 'student have difficulty in communication';
    const a = await correctGrammarAndSpelling(input);
    const b = await correctGrammarAndSpelling(input);
    check('the same input yields the same correction', a.corrected === b.corrected, `${a.corrected} vs ${b.corrected}`);
  });

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});