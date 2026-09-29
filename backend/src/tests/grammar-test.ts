import { correctGrammarAndSpelling } from '../modules/counselling/ai-assistant.service';

async function run() {
  const tests = [
    {
      input: 'she wanted to developed her knowledge',
      expected: 'She wanted to develop her knowledge.',
    },
    {
      input: 'student have difficulty in communication',
      expected: 'Student has difficulty in communication.',
    },
    {
      input: 'improve communication skill',
      expected: 'Improve communication skills.',
    },
    {
      input: 'practice presentation every week',
      expected: 'Practice presentations every week.',
    },
  ];

  console.log('Running Grammar Engine Test Suite...');
  let failed = false;

  for (const { input, expected } of tests) {
    const res = await correctGrammarAndSpelling(input);
    if (res.corrected !== expected) {
      console.error(`FAIL: "${input}"\n  Expected: "${expected}"\n  Actual:   "${res.corrected}"`);
      failed = true;
    } else {
      console.log(`PASS: "${input}" -> "${res.corrected}"`);
    }
  }

  if (failed) {
    console.error('One or more grammar tests failed.');
    process.exit(1);
  } else {
    console.log('All grammar engine test cases passed successfully!');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

