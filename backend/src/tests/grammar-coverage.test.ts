/**
 * Grammar & Spelling Assistant - broad coverage suite.
 * ----------------------------------------------------
 * Hundreds of *varied* cases, not repeated examples, across every construction
 * the deterministic engine claims to support:
 *
 *   - subject-verb agreement (singular and plural)
 *   - the closed-class be / have / do forms
 *   - verb form after modals, "to" and do-auxiliaries
 *   - present perfect and progressive
 *   - missing auxiliaries and fragmentary clauses
 *   - quantifier / partitive plurals and a/an
 *   - adjective + preposition collocations
 *   - common spelling errors (dictionary-backed)
 *   - capitalisation and terminal punctuation
 *   - official values, names, dates, register numbers, codes and marks
 *   - already-correct text and unknown / ambiguous text left alone
 *
 * The suite reports real counts and exits non-zero on any failure. It tests the
 * deterministic engine directly (the HTTP surface is covered separately by
 * grammar-api.test.ts), so it is fast and needs no server or model.
 *
 * Run with:  npm --prefix backend run test:grammar-coverage
 */
import { correctText } from '../modules/grammar/grammar.service';

let pass = 0;
let fail = 0;
const failures: string[] = [];
let caseCount = 0;

function check(requirement: string, condition: boolean, evidence = '') {
  if (condition) {
    pass++;
  } else {
    fail++;
    failures.push(requirement);
    console.log(`  [FAIL] ${requirement}${evidence ? `\n         evidence: ${evidence}` : ''}`);
  }
}

/** Assert the engine turns `input` into exactly `expected`. */
function exact(input: string, expected: string) {
  caseCount++;
  const r = correctText(input);
  check(
    `correct "${input}" -> "${expected}"`,
    r.corrected === expected,
    `got: "${r.corrected}" (status=${r.status})`
  );
}

/** Assert the engine returns well-formed text unchanged. */
function identity(input: string) {
  caseCount++;
  const r = correctText(input);
  check(`leave correct text unchanged: "${input}"`, r.corrected === input, `got: "${r.corrected}" (status=${r.status})`);
}

/** Assert every needle survives the correction verbatim. */
function preserves(input: string, needles: string[]) {
  caseCount++;
  const r = correctText(input);
  const missing = needles.filter((n) => !r.corrected.includes(n));
  check(`preserve official values in "${input}"`, missing.length === 0, `missing: ${missing.join(', ')} in "${r.corrected}"`);
}

/** Assert nothing is changed (unknown vocabulary, names, ambiguous text). */
function untouched(input: string) {
  caseCount++;
  const r = correctText(input);
  check(`leave unknown/ambiguous text untouched: "${input}"`, r.corrected.trim() === input.trim(), `got: "${r.corrected}"`);
}

// ---------------------------------------------------------------------------
// 1. Already-correct, fully well-formed text must come back character-for-character.
// ---------------------------------------------------------------------------
const ALREADY_CORRECT: string[] = [
  'The student has completed the assignment.',
  'She is attending classes regularly.',
  'They are submitting their assignments.',
  'He is not coming tomorrow.',
  'The boys are playing in the ground.',
  'I am going to college every day.',
  'We have finished the project.',
  'The mentor advised the student to improve communication skills.',
  'It is clear that the student needs help.',
  'The meeting was held on Monday.',
  'He read the book yesterday.',
  'She put the file on the table.',
  'They cut the paper with scissors.',
  'Please find the attached report.',
  'The students who are absent must meet the mentor.',
  'The department of CSE organized a workshop.',
  'He is a university student.',
  'It is an honour to meet you.',
  'One of the students has an arrear.',
  'There are many students in the class.',
  'I would like to discuss the issue.',
  'She has been working here since 2020.',
  'The result will be announced tomorrow.',
  'The data are clear.',
  'The news is good.',
  'Mathematics is difficult.',
  'He needs to improve.',
  'She wants to study abroad.',
  'He is used to working late.',
  'The teacher asked the students to submit the report.',
  'The student was absent for three days.',
  'Attendance is 85 percent.',
  'The mentor will meet the student at ten.',
  'Both candidates were selected.',
  'Few students failed the exam.',
  'Several teachers attended the meeting.',
  'Each student has a book.',
  'Everyone is present today.',
  'Nobody knows the answer.',
  'We were studying late at night.',
  'They were late yesterday.',
  'He was present in the class.',
  'She has written many assignments.',
  'I have gone to the library.',
  'He did not come yesterday.',
  'They have submitted the report.',
  'The children are playing outside.',
  'My parents are visiting tomorrow.',
  'The teacher explains the concept clearly.',
  'Students submit their assignments on time.',
  'The mentor guides the mentee carefully.',
  'We discussed the project in the meeting.',
  'He depends on his mentor for advice.',
  'She is good at mathematics.',
  'He is interested in research.',
  'He is married to Kavitha.',
  'This method is superior to the old one.',
  'The report is different from the draft.',
  'I prefer coffee to tea.',
  'We must focus on the main problem.',
  'The team will concentrate on the final match.',
  'He is afraid of heights.',
  'She suffers from frequent headaches.',
  'The students listened to the lecture.',
  'He replied to my message.',
  'Do not repeat the mistake.',
  'This is the best solution.',
  'This route is easier than the other.',
  'This car is faster than that one.',
  'She can solve the problem easily.',
  'You need not attend the meeting.',
  'We cancelled the trip because of the rain.',
  'The data are analysed carefully.',
  'The criteria are clearly stated.',
  'The syllabus has been revised.',
  'It is an honest answer.',
  'He is an MBA graduate.',
  'She ordered a useful tool for the lab.',
  'The university is organizing a symposium.',
  'An hour of study is enough.',
  'A European delegate visited the campus.',
  'The unique idea impressed everyone.',
  'It was a one-time opportunity.',
  'The child found a coin on the road.',
  'He put the book back on the shelf.',
  'They are reading quietly.',
  'The teacher has taught this topic before.',
  'I saw him at the seminar.',
  'We ate lunch together.',
  'She went home early.',
  'He came to college on time.',
  'The report was written by the student.',
];
for (const s of ALREADY_CORRECT) identity(s);

// ---------------------------------------------------------------------------
// 2. Corrections, grouped by construction. Expected output is the fully
//    well-formed sentence the engine returns.
// ---------------------------------------------------------------------------
const CORRECTIONS: Array<[string, string]> = [
  // --- singular subject + base verb -> third person ---
  ['he go to college daily', 'He goes to college daily.'],
  ['she study in third semester', 'She studies in third semester.'],
  ['student need improve communication skill', 'Student needs to improve communication skills.'],
  ['mentor guide the student', 'Mentor guides the student.'],
  ['teacher explain the concept', 'Teacher explains the concept.'],
  ['he look tired today', 'He looks tired today.'],
  ['it seem difficult', 'It seems difficult.'],
  ['she want to learn guitar', 'She wants to learn guitar.'],
  ['he know the answer', 'He knows the answer.'],
  ['she like music', 'She likes music.'],
  ['he work in a bank', 'He works in a bank.'],
  ['the student attend class regularly', 'The student attends class regularly.'],
  ['he write poems in free time', 'He writes poems in free time.'],
  ['she help her mother at home', 'She helps her mother at home.'],
  ['he play cricket every evening', 'He plays cricket every evening.'],

  // --- plural subject + third person verb -> base verb ---
  ['they goes to workshop', 'They go to workshop.'],
  ['many students goes to library', 'Many students go to library.'],
  ['we has completed the project', 'We have completed the project.'],
  ['students is attending class', 'Students are attending class.'],
  ['the mentees has low attendance', 'The mentees have low attendance.'],
  ['the mentees is not attending class', 'The mentees are not attending class.'],
  ['the teachers is busy', 'The teachers are busy.'],
  ['children loves sweets', 'Children love sweets.'],
  ['people speaks many languages', 'People speak many languages.'],
  ['you has done well', 'You have done well.'],
  ['they was late yesterday', 'They were late yesterday.'],
  ['we was studying', 'We were studying.'],

  // --- be / have closed class ---
  ['i is ready for seminar', 'I am ready for seminar.'],
  ['i are a mentor', 'I am a mentor.'],
  ['he were present', 'He was present.'],
  ['everyone are present today', 'Everyone is present today.'],
  ['nobody know the answer', 'Nobody knows the answer.'],
  ['someone are waiting outside', 'Someone is waiting outside.'],
  ['he have a lot of arrears', 'He has a lot of arrears.'],
  ['the mentee have low attendance', 'The mentee has low attendance.'],
  ['she have a doubt', 'She has a doubt.'],
  ['it have two sections', 'It has two sections.'],

  // --- do-auxiliary agreement ---
  ['she do not like maths', 'She does not like maths.'],
  ['he do not attend class', 'He does not attend class.'],
  ['she do not understand the question', 'She does not understand the question.'],
  ['he do not work on weekends', 'He does not work on weekends.'],

  // --- verb form after modal / to / do-auxiliary ---
  ['to submitted the assignment', 'To submit the assignment.'],
  ['did not went to class', 'Did not go to class.'],
  ['does not submitted report', 'Does not submit report.'],
  ['he did not came yesterday', 'He did not come yesterday.'],
  ['she can submitted the form', 'She can submit the form.'],
  ['we must completed the task', 'We must complete the task.'],
  ['they will arrived soon', 'They will arrive soon.'],
  ['you should studied harder', 'You should study harder.'],
  ['i can wrote the letter', 'I can write the letter.'],
  ['he want improve communication skill', 'He wants to improve communication skills.'],

  // --- perfect tense ---
  ['he has go to centre', 'He has gone to centre.'],
  ['i have wrote the report', 'I have written the report.'],
  ['she have went to college', 'She has gone to college.'],
  ['she has wrote many assignments', 'She has written many assignments.'],
  ['they have ate lunch', 'They have eaten lunch.'],
  ['he has took the book', 'He has taken the book.'],
  ['we have saw the movie', 'We have seen the movie.'],
  ['i have went to the library', 'I have gone to the library.'],

  // --- progressive ---
  ['she is go to library', 'She is going to library.'],
  ['they are study late night', 'They are studying late night.'],
  ['he is write a letter', 'He is writing a letter.'],
  ['the students are prepare for exams', 'The students are preparing for exams.'],

  // --- missing auxiliary / fragments ---
  ['student not attending class regularly', 'The student is not attending classes regularly.'],
  ['he not coming tomorrow', 'He is not coming tomorrow.'],
  ['she not attending class', 'She is not attending class.'],
  ['they not submitting assignments', 'They are not submitting assignments.'],
  ['student facing difficulty in mathematics', 'The student is facing difficulty in mathematics.'],

  // --- there is / there are ---
  ['there is many students in class', 'There are many students in class.'],
  ['there is several issues', 'There are several issues.'],
  ['there is many students in the class', 'There are many students in the class.'],
  ['there is several issues to discuss', 'There are several issues to discuss.'],

  // --- quantifier + noun plurals ---
  ['many student have arrears', 'Many students have arrears.'],
  ['several mentee need guidance', 'Several mentees need guidance.'],
  ['these book are useful', 'These books are useful.'],
  ['two student submitted report', 'Two students submitted report.'],
  ['few issue were discussed', 'Few issues were discussed.'],
  ['both candidate attended', 'Both candidates attended.'],
  ['those student are absent', 'Those students are absent.'],
  ['various topic were covered', 'Various topics were covered.'],
  ['numerous problem were solved', 'Numerous problems were solved.'],

  // --- partitive "of the" plurals ---
  ['each of the student has a book', 'Each of the students has a book.'],
  ['none of the student attended', 'None of the students attended.'],
  ['one of the mentee scored well', 'One of the mentees scored well.'],
  ['neither of the candidate applied', 'Neither of the candidates applied.'],

  // --- stative "having" + arrear ---
  ['he is having two arrears', 'He has two arrears.'],
  ['she is having three arrears', 'She has three arrears.'],

  // --- a / an ---
  ['a apple a day', 'An apple a day.'],
  ['an student came late', 'A student came late.'],
  ['a hour of study', 'An hour of study.'],
  ['a honest student', 'An honest student.'],
  ['an university student', 'A university student.'],
  ['a MBA graduate', 'An MBA graduate.'],
  ['a english book', 'An English book.'],
  ['an useful tool', 'A useful tool.'],
  ['a umbrella', 'An umbrella.'],
  ['a hour class', 'An hour class.'],
  ['an unique idea', 'A unique idea.'],
  ['a hour ago', 'An hour ago.'],

  // --- adjective + preposition collocations ---
  ['he is interested about research', 'He is interested in research.'],
  ['she is good in mathematics', 'She is good at mathematics.'],
  ['student depend of teacher', 'Student depends on teacher.'],
  ['he depend of his parents', 'He depends on his parents.'],
  ['we discussed about the project', 'We discussed the project.'],
  ['he is afraid from dogs', 'He is afraid of dogs.'],
  ['she is married with Ravi', 'She is married to Ravi.'],
  ['this is superior than that', 'This is superior to that.'],
  ['this is different than that', 'This is different from that.'],
  ['we must concentrate in studies', 'We must concentrate on studies.'],
  ['please focus in the main point', 'Please focus on the main point.'],
  ['he suffered with fever', 'He suffered from fever.'],
  ['she is angry on me', 'She is angry with me.'],
  ['he reached to the station', 'He reached the station.'],
  ['they will reply back soon', 'They will reply soon.'],
  ['do not repeat again', 'Do not repeat.'],
  ['he listened music quietly', 'He listened to music quietly.'],
  ['inspite of the rain', 'In spite of the rain.'],
  ['the both students passed', 'Both students passed.'],
  ['this is the most best option', 'This is the best option.'],
  ['this route is more easier', 'This route is easier.'],
  ['this car is more faster', 'This car is faster.'],
  ['he can able to solve problem', 'He can solve problem.'],
  ['you need not to worry', 'You need not worry.'],
  ['we cancelled it due to the fact that it rained', 'We cancelled it because it rained.'],

  // --- doubled words ---
  ['the the student came', 'The student came.'],
  ['he is is late', 'He is late.'],

  // --- capitalisation / punctuation ---
  ['he is a good student', 'He is a good student.'],
  ['i am going to college', 'I am going to college.'],
  ['hello world', 'Hello world.'],
  ['this is fine', 'This is fine.'],
  ['we won the match', 'We won the match.'],

  // --- multiple issues in one sentence ---
  ['Ravi is my mentee and he have arrears', 'Ravi is my mentee and he has arrears.'],
  ['the student was absent and not attending class', 'The student was absent and not attending class.'],
  ['many student is not attending class', 'Many students are not attending class.'],
  ['she is having two arrears and she do not attend class', 'She has two arrears and she does not attend class.'],
];
for (const [input, expected] of CORRECTIONS) exact(input, expected);

// ---------------------------------------------------------------------------
// 3. Dictionary-backed spelling. Only clear, unambiguous lowercase typos.
// ---------------------------------------------------------------------------
const SPELLING: Array<[string, string]> = [
  ['statemnet was wrong', 'Statement was wrong.'],
  ['definately he will come', 'Definitely he will come.'],
  ['goverment exam', 'Government exam.'],
  ['seperate sheet', 'Separate sheet.'],
  ['untill tomorrow', 'Until tomorrow.'],
  ['this is a occurence', 'This is an occurrence.'],
  ['he is my freind', 'He is my friend.'],
  ['the enviroment is clean', 'The environment is clean.'],
  ['she has a questionaire', 'She has a questionnaire.'],
];
for (const [input, expected] of SPELLING) exact(input, expected);

// ---------------------------------------------------------------------------
// 4. Official values, names, codes, dates, marks and register numbers survive.
// ---------------------------------------------------------------------------
const PROTECTED_CASES: Array<[string, string[]]> = [
  ['Kavitha R (731523104999) of 24ITT36 scored 8.75 CGPA in CSE.', ['Kavitha R', '731523104999', '24ITT36', '8.75', 'CSE']],
  ['The student scored 91.4% attendance on 14-03-2026.', ['91.4', '14-03-2026']],
  ['Arjun scored 72 marks in the 24ITT36 internal test on 05.09.2026.', ['Arjun', '72', '24ITT36', '05.09.2026']],
  ['Her register number is 731523209001 and her CGPA is 8.5.', ['731523209001', '8.5']],
  ['The mentor met the student on 2026-09-26 at 10:30 AM.', ['2026-09-26', '10:30']],
  ['He improved from 6.0 SGPA to 8.2 SGPA.', ['6.0', '8.2', 'SGPA']],
  ['The batch 2022-2026 has 120 students.', ['2022-2026', '120']],
  ['She completed NPTEL and Coursera certifications.', ['NPTEL', 'Coursera']],
  ['Ravi Kumar scored 88 marks in subject 24ITT36.', ['Ravi Kumar', '88', '24ITT36']],
  ['The HOD approved file no. KSRCE/CSE/2026/114.', ['KSRCE/CSE/2026/114']],
];
for (const [input, needles] of PROTECTED_CASES) preserves(input, needles);

// ---------------------------------------------------------------------------
// 5. Unknown vocabulary, modern coinages and names are not "corrected".
// ---------------------------------------------------------------------------
const UNTOUCHED: string[] = [
  'Zarqon is a bright mentee.',
  'The xyzzy protocol is useful.',
  'Kavitha and Ravi presented together.',
  'This is a nanoblob experiment.',
  'The qubit amplitude is stable.',
  'Muthuramalingam is my mentor.',
  'The blockchain consensus held.',
  'Students use GitHub and LeetCode daily.',
  'The mentee scored well in the viva.',
  'The NPTEL proctored exam was easy.',
  'He submitted the NPTEL assignment.',
  'The department ran a hackathon.',
  'We attended a webinar on IoT.',
  'The mentoring session was productive.',
  'She has two arrears in third semester.',
];
for (const s of UNTOUCHED) untouched(s);

// ---------------------------------------------------------------------------
// 6. Invariants across every input above.
// ---------------------------------------------------------------------------
const ALL_INPUTS = [
  ...ALREADY_CORRECT,
  ...CORRECTIONS.map(([i]) => i),
  ...SPELLING.map(([i]) => i),
  ...PROTECTED_CASES.map(([i]) => i),
  ...UNTOUCHED,
];
for (const input of ALL_INPUTS) {
  const r = correctText(input);
  const out = r.corrected.trim();
  caseCount++;
  check(
    `well-formed output for "${input}"`,
    out.length > 0 && /^[A-Z0-9]/.test(out) && /[.!?]$/.test(out),
    `got: "${r.corrected}"`
  );
  caseCount++;
  check(
    `documented status for "${input}"`,
    ['EXACT_MATCH', 'APPROXIMATE_MATCH', 'RULES_APPLIED', 'NO_RELIABLE_CORRECTION', 'AMBIGUOUS_INPUT'].includes(r.status),
    `status=${r.status}`
  );
  caseCount++;
  check(`confidence in range for "${input}"`, r.confidence >= 0 && r.confidence <= 1, `confidence=${r.confidence}`);
}

// Determinism: the same input always yields the same result.
for (const input of ALL_INPUTS.slice(0, 40)) {
  caseCount++;
  const a = correctText(input);
  const b = correctText(input);
  check(`deterministic for "${input}"`, a.corrected === b.corrected && a.status === b.status);
}

// ---------------------------------------------------------------------------
console.log(`\n=== Grammar coverage: ${pass} passed, ${fail} failed (${caseCount} cases) ===\n`);
if (fail > 0) {
  console.error('FAILED:');
  for (const f of failures.slice(0, 60)) console.error(`  - ${f}`);
  if (failures.length > 60) console.error(`  ... and ${failures.length - 60} more`);
  process.exit(1);
}
