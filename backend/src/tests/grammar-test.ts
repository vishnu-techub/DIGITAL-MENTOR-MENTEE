import { checkGrammarWithSapling } from '../modules/counselling/sapling.service.js';

async function run() {
  const tests = [
    {
      name: 'Test 1: Subject-verb agreement (don\'t -> doesn\'t)',
      input: "He don't attend the classes regularly.",
      expected: "He doesn't attend the classes regularly.",
    },
    {
      name: 'Test 2: Infinitive verb tense (wanted to developed -> develop)',
      input: 'She wanted to developed her knowledge.',
      expected: 'She wanted to develop her knowledge.',
    },
    {
      name: 'Test 3: Gerund and subject agreement (have difficulty in understand -> has difficulty understanding)',
      input: 'Student have difficulty in understand programming concepts.',
      expected: 'Student has difficulty understanding programming concepts.',
    },
    {
      name: 'Test 4: Third person singular verb (need -> needs)',
      input: 'She need to improve her communication skills.',
      expected: 'She needs to improve her communication skills.',
    },
    {
      name: 'Test 5: Compound clause agreement (have/need -> has/needs)',
      input: 'He have good technical skills but need more practice.',
      expected: 'He has good technical skills but needs more practice.',
    },
    {
      name: 'Critical Requirement Test: Already correct sentence should have hasErrors = false',
      input: "He doesn't attend the classes regularly.",
      expected: "He doesn't attend the classes regularly.",
      expectNoErrors: true,
    },
  ];

  console.log('Running Sapling AI & Institutional Grammar Test Suite...\n');
  let failed = false;

  for (const { name, input, expected, expectNoErrors } of tests) {
    const res = await checkGrammarWithSapling(input);
    const textMatches = res.correctedText.trim() === expected.trim();
    const errorFlagMatches = expectNoErrors ? !res.hasErrors : res.hasErrors;

    if (!textMatches || !errorFlagMatches) {
      console.error(`FAIL: [${name}]`);
      console.error(`  Input:         "${input}"`);
      console.error(`  Expected Text: "${expected}"`);
      console.error(`  Actual Text:   "${res.correctedText}"`);
      console.error(`  hasErrors:     ${res.hasErrors} (Expected: ${!expectNoErrors})`);
      console.error(`  explanation:   "${res.explanation}"`);
      failed = true;
    } else {
      console.log(`PASS: [${name}]`);
      console.log(`  "${input}"`);
      console.log(`  -> "${res.correctedText}" (hasErrors: ${res.hasErrors}, explanation: "${res.explanation}")\n`);
    }
  }

  if (failed) {
    console.error('One or more grammar tests failed.');
    process.exit(1);
  } else {
    console.log('All 5 prompt test cases and critical validation passed successfully!');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

