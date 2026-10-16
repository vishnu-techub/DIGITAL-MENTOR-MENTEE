/**
 * GEMINI AI ASSISTANT — end-to-end integration.
 * ============================================================================
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives the existing `/api/ai/*` chatbot over HTTP, but with the
 * active provider switched to Google Gemini by setting GEMINI_API_KEY.
 *
 * A mock Gemini REST server (in-process Node http) emulates the two endpoints
 * the official @google/genai SDK calls:
 *   GET  /v1beta/models/{model}                    (availability probe)
 *   POST /v1beta/models/{model}:generateContent     (chat)
 *
 * It proves, without any live Google call:
 *   - the API key is sent only in the server-to-server `x-goog-api-key` header,
 *   - it is NEVER present in an HTTP response or in a captured console log,
 *   - each user message produces EXACTLY ONE upstream request (no auto-retry),
 *   - quota / invalid-key / HTTP-5xx / malformed / timeout all map to sane
 *     statuses and never fabricate an answer,
 *   - role-scoped verified context still reaches the model (own data only).
 *
 * Run: npm run test:gemini
 */
import assert from 'assert';
import bcrypt from 'bcryptjs';
import { createServer, type Server } from 'node:http';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('gemini-integration');

process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5301;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'gemini-integration-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';
process.env.AI_CHAT_RATE_LIMIT = '1000';

// The provider is chosen purely from this variable. A distinctive value lets the
// leak assertions be meaningful.
const TEST_KEY = 'TEST-GEMINI-KEY-DO-NOT-EXPOSE-987654';
process.env.GEMINI_API_KEY = TEST_KEY;
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.GEMINI_TIMEOUT_MS = '2000';

// ---------------------------------------------------------------------------
// Capture every console line so we can prove the key is never logged.
// ---------------------------------------------------------------------------
const capturedLogs: string[] = [];
for (const level of ['log', 'error', 'warn', 'info'] as const) {
  const original = console[level].bind(console);
  (console as any)[level] = (...args: any[]) => {
    try {
      capturedLogs.push(
        args
          .map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a)))
          .join(' ')
      );
    } catch {
      /* ignore non-serialisable */
    }
    original(...args);
  };
}

// ---------------------------------------------------------------------------
// Mock Gemini REST server
// ---------------------------------------------------------------------------
type Mode = 'ok' | 'quota' | 'badkey' | 'http500' | 'malformed' | 'slow';
let mode: Mode = 'ok';
let genHits = 0;
let probeHits = 0;
let lastKeyHeader: string | undefined;
let lastGenUrl = '';
let lastGenBody: any = null;

const mockServer: Server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = req.url || '';
    const raw = Buffer.concat(chunks).toString('utf8');
    lastKeyHeader = (req.headers['x-goog-api-key'] as string) || undefined;

    // Availability probe: GET /v1beta/models/{model}
    if (req.method === 'GET' && /\/models\/[^:]+$/.test(url)) {
      probeHits += 1;
      if (mode === 'http500') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error":{"code":500}}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ name: `models/${process.env.GEMINI_MODEL}` }));
      return;
    }

    // Chat: POST /v1beta/models/{model}:generateContent
    if (req.method === 'POST' && url.includes(':generateContent')) {
      genHits += 1;
      lastGenUrl = url;
      try {
        lastGenBody = JSON.parse(raw);
      } catch {
        lastGenBody = null;
      }

      const finish = () => {
        if (mode === 'quota') {
          res.writeHead(429, { 'Content-Type': 'application/json' });
          res.end('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}');
          return;
        }
        if (mode === 'badkey') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end('{"error":{"code":400,"status":"INVALID_ARGUMENT","message":"API key not valid. Please pass a valid API key."}}');
          return;
        }
        if (mode === 'http500') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end('{"error":{"code":500,"status":"INTERNAL"}}');
          return;
        }
        if (mode === 'malformed') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{not-json');
          return;
        }
        const contents = Array.isArray(lastGenBody?.contents) ? lastGenBody.contents : [];
        const last = contents[contents.length - 1]?.parts?.[0]?.text ?? '';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            candidates: [
              { content: { role: 'model', parts: [{ text: `MOCK_GEMINI(${genHits}): ${last}` }] }, finishReason: 'STOP' },
            ],
          })
        );
      };

      if (mode === 'slow') {
        setTimeout(finish, 5000);
      } else {
        finish();
      }
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{}');
  });
});

const BASE = `http://127.0.0.1:${PORT}`;
const checks: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean): void {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

async function http(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: any } = {}
): Promise<{ status: number; body: any; raw: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const raw = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw;
  }
  responseBodies.push(raw);
  return { status: res.status, body: parsed as any, raw };
}

const responseBodies: string[] = [];

async function waitForHealth(): Promise<void> {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server never became healthy');
}

function systemPrompt(): string {
  return lastGenBody?.systemInstruction?.parts?.[0]?.text || '';
}

async function run(): Promise<void> {
  console.log('================================================================');
  console.log('GEMINI AI ASSISTANT — provider selection, key safety, failure modes');
  console.log('================================================================\n');

  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const mockPort = (mockServer.address() as any).port;
  process.env.GEMINI_BASE_URL = `http://127.0.0.1:${mockPort}`;
  console.log(`Mock Gemini at 127.0.0.1:${mockPort}\n`);

  await import('../index.js');
  await waitForHealth();

  const { User, Department, Student, Batch } = await import('../models/index.js');
  const { ensureSystemBootstrap } = await import('../database/bootstrap.js');
  await ensureSystemBootstrap();

  const cseDept: any = await Department.findOne({ code: 'CSE' });
  assert(cseDept, 'CSE department exists');
  const itDept: any = await Department.findOne({ code: 'IT' });
  assert(itDept, 'IT department exists');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'batch exists');

  const adminLogin = await http('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@12345' } });
  assert(adminLogin.status === 200, 'admin login');
  const adminToken = adminLogin.body.data?.token || adminLogin.body.token;

  // Two students: the caller must only ever see their OWN record.
  const mkStudent = async (username: string, reg: string, fullName: string, dept: any) => {
    const u = await User.create({
      username,
      email: `${username}@ksrce.test`,
      role: 'STUDENT',
      fullName,
      passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
      department: dept._id,
      isActive: true,
      mustChangePassword: false,
    });
    await Student.create({
      user: u._id,
      registerNumber: reg,
      fullName,
      department: dept._id,
      batch: batch._id,
      residentialType: 'DAY_SCHOLAR',
      parent: {},
      siblings: [],
      school: {},
      profileCompleted: true,
      isActive: true,
    });
    const login = await http('POST', '/api/auth/login', { body: { username, password: 'Passw0rd@123' } });
    assert(login.status === 200, `${username} login`);
    return login.body.data?.token || login.body.token;
  };

  const stuToken = await mkStudent('gemstu001', 'GEMREG001', 'Gem Mentee Alpha', cseDept);
  await mkStudent('gemstu002', 'GEMREG002', 'Gem Mentee Beta', cseDept);
  const itToken = await mkStudent('gemstu003', 'GEMREG003', 'Gem Mentee Gamma', itDept);

  // -------------------------------------------------------------------------
  // A. Provider selection + status
  // -------------------------------------------------------------------------
  const statusNoAuth = await http('GET', '/api/ai/status');
  check('status requires auth (401)', statusNoAuth.status === 401);

  const status = await http('GET', '/api/ai/status', { token: adminToken });
  check('status reports Gemini provider (200)', status.status === 200 && status.body?.data?.provider === 'gemini');
  check('status reports available via mock probe', status.body?.data?.available === true);
  check('status reports the configured model', status.body?.data?.model === 'gemini-2.5-flash');
  check('status probe hit the mock', probeHits >= 1);

  // -------------------------------------------------------------------------
  // B. Happy path — real chat over the mock, persisted, one upstream call
  // -------------------------------------------------------------------------
  const before = genHits;
  const chat1 = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'Summarize the dashboard' } });
  check('chat returns 200', chat1.status === 200);
  check('chat returns a conversationId', !!chat1.body?.data?.conversationId);
  check('chat returns the model answer', typeof chat1.body?.data?.answer === 'string' && chat1.body.data.answer.includes('MOCK_GEMINI'));
  check('exactly one upstream request per message', genHits - before === 1);

  const afterFirst = genHits;
  const convId = chat1.body.data.conversationId;
  const conv = await http('GET', `/api/ai/conversations/${convId}`, { token: adminToken });
  check('conversation persisted two turns', conv.body?.data?.conversation?.messageCount === 2);
  check('reading history made no upstream call', genHits === afterFirst);

  const chat2 = await http('POST', '/api/ai/chat', { token: adminToken, body: { conversationId: convId, message: 'And department-wise?' } });
  check('multi-turn chat returns 200', chat2.status === 200);
  const conv2 = await http('GET', `/api/ai/conversations/${convId}`, { token: adminToken });
  check('multi-turn gives four messages', conv2.body?.data?.conversation?.messageCount === 4);

  // -------------------------------------------------------------------------
  // C. Key safety — header only, never in body or logs
  // -------------------------------------------------------------------------
  check('SDK sent the key in the x-goog-api-key header', lastKeyHeader === TEST_KEY);
  check('generateContent path is the documented SDK path', /\/v1beta\/models\/gemini-2\.5-flash:generateContent$/.test(lastGenUrl));
  const joinedBodies = responseBodies.join('\n');
  check('API key never appears in any HTTP response', !joinedBodies.includes(TEST_KEY));
  check('API key never appears in captured logs', !capturedLogs.join('\n').includes(TEST_KEY));
  check('no provider host leaked to the client', !joinedBodies.includes('generativelanguage.googleapis.com'));

  // -------------------------------------------------------------------------
  // D. Role scoping still reaches the model (own data only)
  // -------------------------------------------------------------------------
  const stuChat = await http('POST', '/api/ai/chat', { token: stuToken, body: { message: 'Show my record' } });
  check('student can chat (200)', stuChat.status === 200);
  check('student system prompt contains own register number', systemPrompt().includes('GEMREG001'));
  check('student system prompt omits other students', !systemPrompt().includes('GEMREG002') && !systemPrompt().includes('GEMREG003'));
  check('system prompt carries no secrets', !systemPrompt().includes('passwordHash') && !systemPrompt().includes('Admin@12345'));

  // -------------------------------------------------------------------------
  // E. Validation + request-size limits
  // -------------------------------------------------------------------------
  check('empty message -> 400', (await http('POST', '/api/ai/chat', { token: itToken, body: { message: '' } })).status === 400);
  check('whitespace message -> 400', (await http('POST', '/api/ai/chat', { token: itToken, body: { message: '   ' } })).status === 400);
  check('oversized message -> 400', (await http('POST', '/api/ai/chat', { token: itToken, body: { message: 'x'.repeat(5000) } })).status === 400);
  check('bad conversationId -> 404', (await http('POST', '/api/ai/chat', { token: itToken, body: { conversationId: 'not-an-id', message: 'hi' } })).status === 404);

  // -------------------------------------------------------------------------
  // F. Graceful failure modes — never a fabricated answer
  // -------------------------------------------------------------------------
  const existingConv = chat2.body.data.conversationId;
  const countBefore = (await http('GET', `/api/ai/conversations/${existingConv}`, { token: adminToken })).body?.data?.conversation?.messageCount;

  mode = 'quota';
  const quota = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'quota please' } });
  check('quota / rate-limit -> 429', quota.status === 429);
  check('quota message is helpful', /usage limit|quota/i.test(quota.body?.message || ''));

  mode = 'badkey';
  const badkey = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'bad key' } });
  check('invalid key -> 503', badkey.status === 503);
  check('invalid-key message points at configuration', /configur/i.test(badkey.body?.message || ''));

  mode = 'http500';
  const http500 = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'boom' } });
  check('provider HTTP 500 -> 502', http500.status === 502);

  mode = 'malformed';
  const malformed = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'garbled' } });
  check('malformed provider body -> 503', malformed.status === 503);

  mode = 'slow';
  process.env.GEMINI_TIMEOUT_MS = '300';
  const timeout = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'slow' } });
  check('provider timeout -> 504', timeout.status === 504);
  process.env.GEMINI_TIMEOUT_MS = '2000';
  mode = 'ok';

  const countAfter = (await http('GET', `/api/ai/conversations/${existingConv}`, { token: adminToken })).body?.data?.conversation?.messageCount;
  check('failed calls fabricated no assistant turn', countAfter === countBefore);

  // -------------------------------------------------------------------------
  // G. Abuse protection — per-user chat rate limit
  // -------------------------------------------------------------------------
  process.env.AI_CHAT_RATE_LIMIT = '3';
  let hit429 = false;
  for (let i = 0; i < 6; i++) {
    const r = await http('POST', '/api/ai/chat', { token: itToken, body: { message: `burst ${i}` } });
    if (r.status === 429) {
      hit429 = true;
      break;
    }
  }
  check('chat rate limit returns 429 on burst', hit429);
  process.env.AI_CHAT_RATE_LIMIT = '1000';

  // -------------------------------------------------------------------------
  // H. Missing key is a clean configuration error, not a fake reply
  // -------------------------------------------------------------------------
  const { chatWithGemini, isGeminiConfigured } = await import('../services/gemini.service.js');
  check('configured while key present', isGeminiConfigured() === true);
  const savedKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  check('not configured once key removed', isGeminiConfigured() === false);
  let missingKind = '';
  try {
    await chatWithGemini([{ role: 'user', content: 'hi' }]);
  } catch (e: any) {
    missingKind = e?.kind || '';
  }
  check('missing key -> NOT_CONFIGURED (no request sent)', missingKind === 'NOT_CONFIGURED');
  process.env.GEMINI_API_KEY = savedKey;

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  const failures = checks.filter((c) => !c.ok).map((c) => c.name);
  console.log('\n================================================================');
  console.log(`TOTAL: ${checks.length}, PASSED: ${checks.filter((c) => c.ok).length}, FAILED: ${failures.length}`);
  console.log('================================================================');
  if (failures.length) {
    console.error('FAILURES:', failures);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
  await store.teardown();
  mockServer.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
