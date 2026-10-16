/**
 * Grammar engine benchmark.
 * -------------------------
 * Measures the things the design promises and reports them honestly:
 *   - the one-time vocabulary load time, entry counts and heap cost;
 *   - steady-state throughput (corrections per second) over a mixed corpus;
 *   - per-call latency for short sentences and a long paragraph;
 *   - that the large dictionary is loaded ONCE, not per request.
 *
 * Run with:  npm --prefix backend run bench:grammar
 */
import os from 'os';
import { correctText } from '../modules/grammar/grammar.service';
import { getLexiconStats, warmUpLexicon } from '../modules/grammar/vocabulary/lexicon';

function mb(bytes: number): number {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

const CORPUS: string[] = [
  'he go to college daily',
  'she study in third semester',
  'they goes to workshop',
  'we has completed the project',
  'i is ready for seminar',
  'students is attending class',
  'many student have arrears',
  'he has go to centre',
  'i have wrote the report',
  'to submitted the assignment',
  'he want improve communication skill',
  'a apple a day',
  'an student came late',
  'he is interested about research',
  'student depend of teacher',
  'statemnet was wrong',
  'definately he will come',
  'untill tomorrow',
  'student not attending class regularly',
  'he not coming tomorrow',
  'there is many students in class',
  'each of the student has a book',
  'he is having two arrears',
  'the the student came',
  'Ravi is my mentee and he have arrears',
  'Kavitha R (731523104999) of 24ITT36 scored 8.75 CGPA in CSE.',
  'The student has completed the assignment.',
  'She is attending classes regularly.',
  'One of the students has an arrear.',
  'The mentor advised the student to improve communication skills.',
];

function buildLongParagraph(words: number): string {
  const sentences = [
    'The student has been attending classes regularly and submitting assignments on time.',
    'However he have some arrears in the third semester and he want improve his performance.',
    'The mentor discussed about the project and advised the student to focus in the main topics.',
    'She is good in mathematics but needs more practice in communication skill.',
    'The department is organizing a seminar on 24ITT36 and many student are expected to attend.',
    'Each of the mentee should submit the report before the deadline.',
    'Ravi scored 8.5 CGPA in the previous semester and he is having two arrears now.',
    'Inspite of the difficulties the student is committed to improve.',
  ];
  const out: string[] = [];
  let count = 0;
  while (count < words) {
    const s = sentences[out.length % sentences.length];
    out.push(s);
    count += s.split(/\s+/).length;
  }
  return out.join(' ');
}

function main() {
  console.log('\n=== Grammar engine benchmark ===\n');
  console.log(`  node        : ${process.version}`);
  console.log(`  platform    : ${process.platform} ${os.arch()}`);
  console.log(`  cpus        : ${os.cpus().length} logical`);
  console.log(`  total memory: ${mb(os.totalmem())} MB`);

  // --- one-time load -------------------------------------------------------
  const heapBefore = process.memoryUsage().heapUsed;
  const loadStart = Date.now();
  const stats = warmUpLexicon();
  const coldLoadMs = Date.now() - loadStart;
  console.log('\nLexicon (one-time load)');
  console.log(`  available        : ${stats.available}`);
  console.log(`  dictionary words : ${stats.wordCount.toLocaleString()}`);
  console.log(`  ranked words     : ${stats.frequencyCount.toLocaleString()}`);
  console.log(`  reported loadMs  : ${stats.loadMs}`);
  console.log(`  wall loadMs      : ${coldLoadMs}`);
  console.log(`  data directory   : ${stats.sourceDir}`);
  const heapAfterLoad = process.memoryUsage().heapUsed;

  // --- warm-up -------------------------------------------------------------
  for (let i = 0; i < 5; i++) for (const s of CORPUS) correctText(s);

  // --- proof the load is not repeated -------------------------------------
  const statsAgain = getLexiconStats();
  console.log('\nRepeated access');
  console.log(`  dictionary words unchanged : ${statsAgain.wordCount === stats.wordCount}`);
  console.log(`  loadMs unchanged           : ${statsAgain.loadMs === stats.loadMs}`);

  // --- throughput ----------------------------------------------------------
  const ITERATIONS = 5000;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) {
    correctText(CORPUS[i % CORPUS.length]);
  }
  const throughputMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const perSec = Math.round((ITERATIONS / throughputMs) * 1000);
  console.log('\nThroughput (steady state)');
  console.log(`  iterations       : ${ITERATIONS.toLocaleString()}`);
  console.log(`  total ms         : ${throughputMs.toFixed(1)}`);
  console.log(`  corrections/sec  : ${perSec.toLocaleString()}`);
  console.log(`  avg ms/call      : ${(throughputMs / ITERATIONS).toFixed(4)}`);

  // --- latency: short ------------------------------------------------------
  const shortInput = 'he go to college daily';
  const shortTimes: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const s = process.hrtime.bigint();
    correctText(shortInput);
    shortTimes.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  shortTimes.sort((a, b) => a - b);

  // --- latency: long paragraph --------------------------------------------
  const longParagraph = buildLongParagraph(400);
  console.log(`\nLong paragraph length: ${longParagraph.length} chars (< 4000 limit)`);
  const longTimes: number[] = [];
  for (let i = 0; i < 200; i++) {
    const s = process.hrtime.bigint();
    const r = correctText(longParagraph);
    longTimes.push(Number(process.hrtime.bigint() - s) / 1e6);
    if (i === 0) console.log(`  sample output chars: ${r.corrected.length} (status=${r.status})`);
  }
  longTimes.sort((a, b) => a - b);

  console.log('\nLatency (ms)');
  console.log(`  short  avg ${(shortTimes.reduce((a, b) => a + b, 0) / shortTimes.length).toFixed(4)}  ` +
    `p50 ${percentile(shortTimes, 50).toFixed(4)}  p95 ${percentile(shortTimes, 95).toFixed(4)}  max ${shortTimes[shortTimes.length - 1].toFixed(4)}`);
  console.log(`  long   avg ${(longTimes.reduce((a, b) => a + b, 0) / longTimes.length).toFixed(3)}  ` +
    `p50 ${percentile(longTimes, 50).toFixed(3)}  p95 ${percentile(longTimes, 95).toFixed(3)}  max ${longTimes[longTimes.length - 1].toFixed(3)}`);

  // --- memory --------------------------------------------------------------
  const heapAfter = process.memoryUsage().heapUsed;
  console.log('\nMemory');
  console.log(`  heap before load : ${mb(heapBefore)} MB`);
  console.log(`  heap after load  : ${mb(heapAfterLoad)} MB`);
  console.log(`  lexicon cost     : ~${mb(heapAfterLoad - heapBefore)} MB`);
  console.log(`  heap after runs  : ${mb(heapAfter)} MB`);
  console.log(`  cached suggestions: ${getLexiconStats().cachedSuggestions}`);
  console.log('');
}

main();
