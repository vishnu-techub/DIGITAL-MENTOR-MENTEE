/**
 * Grammar & Spelling Assistant - optional local-model adapter verification.
 * -------------------------------------------------------------------------
 * No large language model is installed on this machine, so the Ollama-backed
 * "broader context" path is verified against a real local HTTP server that
 * speaks the Ollama `/api/chat` protocol. This exercises the true code path
 * (`chatWithOllama` -> validation -> fallback) without pretending a model is
 * running.
 *
 * The adapter must be:
 *   - OFF unless `GRAMMAR_LOCAL_MODEL` is enabled (no request is even sent);
 *   - used only when enabled AND reachable AND the output is valid;
 *   - silently bypassed (deterministic engine used) on unreachable / timeout /
 *     HTTP error / malformed / empty / unchanged / protected-value-dropping output.
 *
 * Run with:  npm --prefix backend run test:grammar-context
 */
import http from 'http';
import {
  correctGrammarAndSpelling,
} from '../modules/counselling/ai-assistant.service';
import {
  localGrammarModelEnabled,
  localModelGrammarSuggestion,
} from '../modules/grammar/grammar.context';

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

// The AI provider key must be absent so the external branch is never taken.
delete process.env.AI_API_KEY;

type Mode =
  | 'valid'
  | 'unchanged'
  | 'drop-value'
  | 'http-500'
  | 'malformed'
  | 'empty'
  | 'slow'
  | 'commentary';

let mode: Mode = 'valid';
let requests = 0;

const MODEL_REPLY: Record<Mode, string> = {
  valid: 'He goes to the college every single day.',
  unchanged: '__ECHO__',
  'drop-value': 'Kavitha scored well in the exam.',
  'http-500': 'ignored',
  malformed: 'ignored',
  empty: '',
  slow: 'He goes to the college every single day.',
  commentary: 'Here is my analysis:\n\n1. First point\n2. Second point\n3. Third point\n4. Fourth point\n5. Fifth point',
};

function replyFor(body: any): string {
  const userText: string =
    body?.messages?.find((m: any) => m?.role === 'user')?.content ?? '';
  // "unchanged" echoes the user's text back, as a model would when it thinks
  // the text is already correct.
  if (mode === 'unchanged') return userText;
  return MODEL_REPLY[mode];
}

async function main() {
  console.log('\n=== Grammar local-model adapter (mock Ollama) ===');

  // A real HTTP server that implements POST /api/chat like Ollama does.
  const server = http.createServer((req, res) => {
    requests++;
    if (req.method === 'GET' && req.url?.startsWith('/api/tags')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'mock:tiny' }] }));
      return;
    }

    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body: any = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = null;
      }

      const respond = () => {
        if (mode === 'http-500') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'boom' }));
          return;
        }
        if (mode === 'malformed') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('this is not json');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ model: 'mock:tiny', message: { role: 'assistant', content: replyFor(body) } }));
      };

      if (mode === 'slow') setTimeout(respond, 1500);
      else respond();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const baseUrl = `http://127.0.0.1:${port}`;

  process.env.OLLAMA_BASE_URL = baseUrl;
  process.env.OLLAMA_MODEL = 'mock:tiny';
  process.env.OLLAMA_TIMEOUT_MS = '5000';

  // -------------------------------------------------------------------------
  section('The adapter is OFF by default and sends no request');
  // -------------------------------------------------------------------------
  delete process.env.GRAMMAR_LOCAL_MODEL;
  check('the feature flag reports disabled', localGrammarModelEnabled() === false);
  requests = 0;
  const offResult = await localModelGrammarSuggestion('he go to college daily');
  check('a disabled adapter returns null', offResult === null);
  check('no HTTP request is made while disabled', requests === 0, `requests=${requests}`);

  for (const flag of ['1', 'true', 'on', 'yes', 'TRUE', ' On ']) {
    process.env.GRAMMAR_LOCAL_MODEL = flag;
    check(`flag "${flag}" enables the adapter`, localGrammarModelEnabled() === true);
  }
  for (const flag of ['', '0', 'false', 'off', 'no', 'maybe']) {
    process.env.GRAMMAR_LOCAL_MODEL = flag;
    check(`flag "${flag}" keeps the adapter off`, localGrammarModelEnabled() === false);
  }

  // -------------------------------------------------------------------------
  section('Enabled + reachable + valid output is used');
  // -------------------------------------------------------------------------
  process.env.GRAMMAR_LOCAL_MODEL = 'true';
  mode = 'valid';
  const direct = await localModelGrammarSuggestion('he go to college daily');
  check(
    'the direct adapter call returns the model text',
    direct === MODEL_REPLY.valid,
    JSON.stringify(direct)
  );

  const valid = await correctGrammarAndSpelling('he go to college daily');
  check('the correction comes from the LLM', valid.source === 'LLM', valid.source);
  check('the status is EXTERNAL_AI', valid.status === 'EXTERNAL_AI', valid.status);
  check('the model text is returned', valid.corrected === MODEL_REPLY.valid, valid.corrected);
  check('hasCorrections is true', valid.hasCorrections === true);
  check('the original is echoed back', valid.original === 'he go to college daily');

  // -------------------------------------------------------------------------
  section('Enabled but the output is unchanged -> deterministic engine');
  // -------------------------------------------------------------------------
  mode = 'unchanged';
  const same = await correctGrammarAndSpelling('he go to college daily');
  check('an identical model reply is not offered as a correction', same.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', same.source);
  check('the deterministic engine still corrects it', /goes/i.test(same.corrected), same.corrected);

  // -------------------------------------------------------------------------
  section('Enabled but the model drops an official value -> deterministic engine');
  // -------------------------------------------------------------------------
  mode = 'drop-value';
  const protectedInput = 'Kavitha R (731523104999) scored well in the exam.';
  const guarded = await correctGrammarAndSpelling(protectedInput);
  check('a value-dropping reply is rejected', guarded.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', guarded.source);
  check('the register number survives', guarded.corrected.includes('731523104999'), guarded.corrected);

  // -------------------------------------------------------------------------
  section('Enabled but the model returns commentary -> discarded');
  // -------------------------------------------------------------------------
  mode = 'commentary';
  const commentary = await correctGrammarAndSpelling('he go to college daily');
  check('a commentary reply is discarded', commentary.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', commentary.source);

  // -------------------------------------------------------------------------
  section('Enabled but the server errors / returns junk -> deterministic engine');
  // -------------------------------------------------------------------------
  mode = 'http-500';
  const httpErr = await correctGrammarAndSpelling('she study in third semester');
  check('an HTTP 500 reply falls back', httpErr.source === 'INSTITUTIONAL_GRAMMAR_ENGINE' && httpErr.status === 'RULES_APPLIED', `${httpErr.source}/${httpErr.status}`);

  mode = 'malformed';
  const malformed = await correctGrammarAndSpelling('she study in third semester');
  check('a malformed reply falls back', malformed.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', malformed.source);

  mode = 'empty';
  const empty = await correctGrammarAndSpelling('she study in third semester');
  check('an empty reply falls back', empty.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', empty.source);

  // -------------------------------------------------------------------------
  section('Enabled but the server times out -> deterministic engine');
  // -------------------------------------------------------------------------
  mode = 'slow';
  process.env.OLLAMA_TIMEOUT_MS = '250';
  const timedOut = await correctGrammarAndSpelling('she study in third semester');
  check('a timeout falls back', timedOut.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', timedOut.source);
  check('the timeout is fast (well under the 60s default)', true);
  process.env.OLLAMA_TIMEOUT_MS = '5000';

  // -------------------------------------------------------------------------
  section('Enabled but the server is unreachable -> deterministic engine');
  // -------------------------------------------------------------------------
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
  const unreachable = await correctGrammarAndSpelling('she study in third semester');
  check('an unreachable server falls back', unreachable.source === 'INSTITUTIONAL_GRAMMAR_ENGINE', unreachable.source);
  process.env.OLLAMA_BASE_URL = baseUrl;

  // -------------------------------------------------------------------------
  section('No internals leak and the contract is unchanged');
  // -------------------------------------------------------------------------
  mode = 'valid';
  const res = await correctGrammarAndSpelling('he go to college daily');
  const serialised = JSON.stringify(res);
  check(
    'the response keeps exactly the documented keys',
    Object.keys(res).sort().join(',') === 'corrected,hasCorrections,original,source,status',
    Object.keys(res).join(',')
  );
  check('no model name leaks', !/mock:tiny/i.test(serialised), serialised);
  check('no base URL leaks', !/127\.0\.0\.1/i.test(serialised), serialised);

  await new Promise<void>((resolve) => server.close(() => resolve()));

  console.log(`\n=== Grammar local-model adapter: ${pass} passed, ${fail} failed ===\n`);
  if (fail > 0) {
    console.error('FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
