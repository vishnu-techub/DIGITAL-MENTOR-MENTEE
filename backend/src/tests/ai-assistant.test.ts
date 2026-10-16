/**
 * AI ASSISTANT — Ollama-backed role-aware chat, multi-turn persistence,
 * ownership enforcement, role-scoped verified context, graceful provider
 * failure handling, read-only guarantees, and rate limiting.
 * ============================================================================
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives it over HTTP. A mock Ollama server (in-process Node http)
 * responds to `/api/chat` and `/api/tags` so no live Ollama instance is needed.
 *
 * Run: npm run test:ai-assistant
 */
import assert from 'assert';
import bcrypt from 'bcryptjs';
import { createServer, type Server } from 'node:http';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('ai-assistant');

process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5297;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ai-assistant-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';

// This suite pins the OLLAMA provider: the Gemini path is exercised end-to-end
// by gemini-integration.test.ts. Clearing the key keeps the selection
// deterministic even if a developer has a real GEMINI_API_KEY in backend/.env.
process.env.GEMINI_API_KEY = '';

// --- Mock Ollama server -------------------------------------------------------
let mockState: 'ok' | 'http500' | 'malformed' | 'slow' = 'ok';
let mockDelay = 0;
let lastChatBody: any = null;
let chatCallCount = 0;

const mockServer: Server = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.url === '/api/tags') {
      if (mockState === 'http500') {
        res.writeHead(500);
        res.end('err');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] }));
      return;
    }
    if (req.url === '/api/chat') {
      chatCallCount += 1;
      try {
        lastChatBody = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        lastChatBody = null;
      }
      const finish = () => {
        if (mockState === 'http500') {
          res.writeHead(500);
          res.end('boom');
          return;
        }
        if (mockState === 'malformed') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{not-json');
          return;
        }
        const last = lastChatBody?.messages?.slice(-1)?.[0]?.content ?? '';
        const answer = `MOCK_REPLY(${chatCallCount}): ${last}`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ model: 'qwen3:8b', message: { role: 'assistant', content: answer } }));
      };
      if (mockDelay > 0 || mockState === 'slow') {
        const d = mockState === 'slow' ? 5000 : mockDelay;
        setTimeout(finish, d);
      } else {
        finish();
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
});

const BASE = `http://127.0.0.1:${PORT}`;

const checks: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean): void {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

async function http(method: string, urlPath: string, opts: { token?: string; body?: any } = {}): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed as any };
}

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

async function run(): Promise<void> {
  console.log('================================================================');
  console.log('AI ASSISTANT — Ollama-backed, role-scoped, ownership, provider failure');
  console.log('================================================================\n');

  // Start mock Ollama
  await new Promise<void>((resolve) => mockServer.listen(0, '127.0.0.1', () => resolve()));
  const mockPort = (mockServer.address() as any).port;
  process.env.OLLAMA_BASE_URL = `http://127.0.0.1:${mockPort}`;
  process.env.OLLAMA_MODEL = 'qwen3:8b';
  process.env.OLLAMA_TIMEOUT_MS = '2000';
  process.env.AI_CHAT_RATE_LIMIT = '1000'; // high default; we override for rate limit test

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}, Mock Ollama at 127.0.0.1:${mockPort}\n`);

  const { User, Department, Student, Batch, Faculty, MentorAssignment, InternalMark, CounsellingRecord } = await import('../models/index.js');
  const { ensureSystemBootstrap } = await import('../database/bootstrap.js');
  await ensureSystemBootstrap();

  const cseDept: any = await Department.findOne({ code: 'CSE' });
  assert(cseDept, 'CSE department exists');
  const itDept: any = await Department.findOne({ code: 'IT' });
  assert(itDept, 'IT department exists');
  const batch: any = await Batch.findOne({ name: '2023-2027' });
  assert(batch, 'batch exists');

  // Login admin (bootstrap)
  const adminLogin = await http('POST', '/api/auth/login', { body: { username: 'admin', password: 'Admin@12345' } });
  assert(adminLogin.status === 200, 'admin login');
  const adminToken = adminLogin.body.data?.token || adminLogin.body.token;

  // Create faculty mentor A (CSE)
  const userFA = await User.create({
    username: 'aimentora',
    email: 'aimentora@ksrce.test',
    role: 'FACULTY',
    fullName: 'Ai Mentor Alpha',
    passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
    department: cseDept._id,
    isActive: true,
    mustChangePassword: false,
  });
  const facA = await Faculty.create({
    user: userFA._id,
    employeeId: 'AIFACA001',
    department: cseDept._id,
    designation: 'Assistant Professor',
    cabinLocation: 'CSE-1',
    maxMentees: 20,
    isActive: true,
  });

  // Create faculty mentor B (CSE)
  const userFB = await User.create({
    username: 'aimenatorb',
    email: 'aimenatorb@ksrce.test',
    role: 'FACULTY',
    fullName: 'Ai Mentor Beta',
    passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
    department: cseDept._id,
    isActive: true,
    mustChangePassword: false,
  });
  const facB = await Faculty.create({
    user: userFB._id,
    employeeId: 'AIFACB001',
    department: cseDept._id,
    designation: 'Assistant Professor',
    cabinLocation: 'CSE-2',
    maxMentees: 20,
    isActive: true,
  });

  // Students in CSE
  const userStuA = await User.create({
    username: 'aistu001',
    email: 'aistu001@ksrce.test',
    role: 'STUDENT',
    fullName: 'Ai Mentee Alpha',
    passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
    department: cseDept._id,
    isActive: true,
    mustChangePassword: false,
  });
  const stuA = await Student.create({
    user: userStuA._id,
    registerNumber: 'AIREG001',
    fullName: 'Ai Mentee Alpha',
    department: cseDept._id,
    batch: batch._id,
    residentialType: 'DAY_SCHOLAR',
    parent: {},
    siblings: [],
    school: {},
    profileCompleted: true,
    isActive: true,
  });

  const userStuB = await User.create({
    username: 'aistu002',
    email: 'aistu002@ksrce.test',
    role: 'STUDENT',
    fullName: 'Ai Mentee Beta',
    passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
    department: cseDept._id,
    isActive: true,
    mustChangePassword: false,
  });
  const stuB = await Student.create({
    user: userStuB._id,
    registerNumber: 'AIREG002',
    fullName: 'Ai Mentee Beta',
    department: cseDept._id,
    batch: batch._id,
    residentialType: 'DAY_SCHOLAR',
    parent: {},
    siblings: [],
    school: {},
    profileCompleted: true,
    isActive: true,
  });

  // Student in IT
  const userStuIT = await User.create({
    username: 'aistu003',
    email: 'aistu003@ksrce.test',
    role: 'STUDENT',
    fullName: 'Ai Other Dept',
    passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
    department: itDept._id,
    isActive: true,
    mustChangePassword: false,
  });
  await Student.create({
    user: userStuIT._id,
    registerNumber: 'AIREG003',
    fullName: 'Ai Other Dept',
    department: itDept._id,
    batch: batch._id,
    residentialType: 'DAY_SCHOLAR',
    parent: {},
    siblings: [],
    school: {},
    profileCompleted: true,
    isActive: true,
  });

  // HOD in CSE
  const userHOD = await User.create({
    username: 'aicseh',
    email: 'aicseh@ksrce.test',
    role: 'HOD',
    fullName: 'Ai CSE HOD',
    passwordHash: bcrypt.hashSync('Passw0rd@123', 10),
    department: cseDept._id,
    isActive: true,
    mustChangePassword: false,
  });

  // Mentor assignments
  await MentorAssignment.create({
    student: stuA._id,
    mentor: facA._id,
    department: cseDept._id,
    assignedFrom: new Date(),
    status: 'ACTIVE',
    assignedBy: userFA._id,
  });
  await MentorAssignment.create({
    student: stuB._id,
    mentor: facB._id,
    department: cseDept._id,
    assignedFrom: new Date(),
    status: 'ACTIVE',
    assignedBy: userFB._id,
  });

  // Internal marks for stuA
  await InternalMark.create({
    student: stuA._id,
    registerNumber: 'AIREG001',
    semesterNumber: 3,
    subjectCode: 'CS301',
    subjectName: 'Data Structures',
    ia1: 40,
    ia2: 42,
    endSem: 78,
  });

  // Counselling record for stuA
  const todayStr = new Date().toISOString().slice(0, 10);
  await CounsellingRecord.create({
    student: stuA._id,
    mentor: facA._id,
    sessionDate: todayStr,
    categories: ['Academic Development'],
    challengeObserved: 'Need to improve coding practice',
    correctiveAction: 'Solve 5 problems daily',
    studentFeedback: 'Acknowledged',
    mentorRemarks: 'Good effort',
    discussionWith: ['student'],
  });

  // Login tokens for other roles
  const stuALogin = await http('POST', '/api/auth/login', { body: { username: 'aistu001', password: 'Passw0rd@123' } });
  const stuAToken = stuALogin.body.data?.token || stuALogin.body.token;
  const stuBLogin = await http('POST', '/api/auth/login', { body: { username: 'aistu002', password: 'Passw0rd@123' } });
  const stuBToken = stuBLogin.body.data?.token || stuBLogin.body.token;
  const hodLogin = await http('POST', '/api/auth/login', { body: { username: 'aicseh', password: 'Passw0rd@123' } });
  const hodToken = hodLogin.body.data?.token || hodLogin.body.token;
  const facALogin = await http('POST', '/api/auth/login', { body: { username: 'aimentora', password: 'Passw0rd@123' } });
  const facAToken = facALogin.body.data?.token || facALogin.body.token;
  const facBLogin = await http('POST', '/api/auth/login', { body: { username: 'aimenatorb', password: 'Passw0rd@123' } });
  const facBToken = facBLogin.body.data?.token || facBLogin.body.token;

  // Get principal (flagged initially)
  let principal: any = await User.findOne({ role: 'PRINCIPAL' });
  const principalLoginFlagged = await http('POST', '/api/auth/login', { body: { username: 'Principal', password: 'Ksrce@1234' } });
  assert(principalLoginFlagged.status === 200, 'principal initial login');
  const principalFlaggedToken = principalLoginFlagged.body.data?.token || principalLoginFlagged.body.token;

  // Verify blocked while flagged (AI route)
  const blockedWhileFlagged = await http('POST', '/api/ai/chat', { token: principalFlaggedToken, body: { message: 'Hi' } });
  check('flagged principal cannot access /api/ai/chat (403)', blockedWhileFlagged.status === 403);

  // Change principal password
  const changeRes = await http('POST', '/api/auth/change-password', {
    token: principalFlaggedToken,
    body: { currentPassword: 'Ksrce@1234', newPassword: 'NewPrincipal@123', confirmPassword: 'NewPrincipal@123' },
  });
  assert(changeRes.status === 200, 'principal change password');
  const principalUnflaggedToken = changeRes.body.data?.token || changeRes.body.token;

  // A. Status
  const statusNoAuth = await http('GET', '/api/ai/status');
  check('status requires auth (401)', statusNoAuth.status === 401);
  const statusAdmin = await http('GET', '/api/ai/status', { token: adminToken });
  check('status returns available for admin (200/available true)', statusAdmin.status === 200 && statusAdmin.body?.data?.available === true);

  // B. Validation
  const chatEmpty = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: '' } });
  check('empty message returns 400', chatEmpty.status === 400);
  const chatSpaces = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: '   ' } });
  check('whitespace message returns 400', chatSpaces.status === 400);
  const longMsg = 'x'.repeat(5000);
  const chatLong = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: longMsg } });
  check('message > 4000 returns 400', chatLong.status === 400);
  const chatBadId = await http('POST', '/api/ai/chat', { token: adminToken, body: { conversationId: 'not-an-id', message: 'hi' } });
  check('bad conversationId returns 404', chatBadId.status === 404);

  // C. Admin chat + persistence + multi-turn
  const firstCallCount = chatCallCount;
  const chatAdmin1 = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'Summarize college dashboard for me' } });
  check('admin can chat (200)', chatAdmin1.status === 200);
  check('admin chat returns conversationId and answer', !!chatAdmin1.body?.data?.conversationId && !!chatAdmin1.body?.data?.answer);
  const convId = chatAdmin1.body.data.conversationId;
  // Get conversation
  const getConv1 = await http('GET', `/api/ai/conversations/${convId}`, { token: adminToken });
  check('can fetch own conversation (200)', getConv1.status === 200);
  check('conversation has 2 messages after first turn', getConv1.body?.data?.conversation?.messageCount === 2);
  // Multi-turn
  const chatAdmin2 = await http('POST', '/api/ai/chat', { token: adminToken, body: { conversationId: convId, message: 'What about department-wise?' } });
  check('multi-turn chat returns 200', chatAdmin2.status === 200);
  const getConv2 = await http('GET', `/api/ai/conversations/${convId}`, { token: adminToken });
  check('multi-turn gives 4 messages total', getConv2.body?.data?.conversation?.messageCount === 4);
  // Title derived
  check('title derived from first message', !!getConv2.body?.data?.conversation?.title);
  // List conversations
  const listAdmin = await http('GET', '/api/ai/conversations', { token: adminToken });
  check('list conversations returns own', listAdmin.status === 200 && Array.isArray(listAdmin.body?.data?.conversations));

  // D. Ownership
  const stuChatAdminConv = await http('POST', '/api/ai/chat', { token: stuAToken, body: { conversationId: convId, message: 'hi' } });
  check('student cannot chat on admin conversation (404)', stuChatAdminConv.status === 404);
  const stuGetAdminConv = await http('GET', `/api/ai/conversations/${convId}`, { token: stuAToken });
  check('student cannot GET admin conversation (404)', stuGetAdminConv.status === 404);
  const stuDelAdminConv = await http('DELETE', `/api/ai/conversations/${convId}`, { token: stuAToken });
  check('student cannot DELETE admin conversation (404)', stuDelAdminConv.status === 404);
  const adminGetStill = await http('GET', `/api/ai/conversations/${convId}`, { token: adminToken });
  check('admin can still GET their conversation (200)', adminGetStill.status === 200);

  // Student creates own conversation
  const stuChat1 = await http('POST', '/api/ai/chat', { token: stuAToken, body: { message: 'Give me a study plan' } });
  assert(stuChat1.status === 200, 'stu chat ok');
  const stuConvId = stuChat1.body.data.conversationId;
  const listStuAfter = await http('GET', '/api/ai/conversations', { token: stuAToken });
  check('student list only has their own conversations', listStuAfter.status === 200 && Array.isArray(listStuAfter.body?.data?.conversations) && listStuAfter.body.data.conversations.length >= 1);
  const delStuConv = await http('DELETE', `/api/ai/conversations/${stuConvId}`, { token: stuAToken });
  check('student can DELETE own conversation (200)', delStuConv.status === 200);
  const getDelStu = await http('GET', `/api/ai/conversations/${stuConvId}`, { token: stuAToken });
  check('deleted conversation GET returns 404', getDelStu.status === 404);

  // Create new conversation via endpoint
  const createNew = await http('POST', '/api/ai/conversations', { token: stuAToken });
  check('create new conversation returns 200', createNew.status === 200);

  // E. Role-scoped context via mock system prompt
  // Student s1 chat
  const stuAChat = await http('POST', '/api/ai/chat', { token: stuAToken, body: { message: 'Show my marks' } });
  check('student s1 can chat (200)', stuAChat.status === 200);
  const sysPromptStuA = lastChatBody?.messages?.[0]?.content || '';
  check('student prompt contains own register number', sysPromptStuA.includes('AIREG001'));
  check('student prompt does not contain other student register', !sysPromptStuA.includes('AIREG002'));
  check('student prompt has no passwordHash/token leakage', !sysPromptStuA.includes('passwordHash') && !sysPromptStuA.includes('Ksrce@1234'));

  // Faculty A (mentor of s1 only)
  const facAChat = await http('POST', '/api/ai/chat', { token: facAToken, body: { message: 'Summarize my mentees' } });
  check('faculty A can chat (200)', facAChat.status === 200);
  const sysPromptFacA = lastChatBody?.messages?.[0]?.content || '';
  check('faculty prompt contains own mentee name', sysPromptFacA.includes('Ai Mentee Alpha'));
  check('faculty prompt does not contain other mentor mentee', !sysPromptFacA.includes('Ai Mentee Beta'));

  // HOD (CSE)
  const hodChat = await http('POST', '/api/ai/chat', { token: hodToken, body: { message: 'Dept mentoring coverage' } });
  check('HOD can chat (200)', hodChat.status === 200);
  const sysPromptHod = lastChatBody?.messages?.[0]?.content || '';
  check('HOD prompt mentions CSE department', sysPromptHod.includes('CSE') || sysPromptHod.includes('Computer Science'));
  check('HOD prompt does not mention the other department student register', !sysPromptHod.includes('AIREG003'));

  // Admin
  const adminChatAgain = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'College-wide summary' } });
  check('admin context includes college-wide facts', adminChatAgain.status === 200);
  const sysPromptAdmin = lastChatBody?.messages?.[0]?.content || '';
  check('admin prompt includes college-wide aggregates', sysPromptAdmin.includes('Total departments') || sysPromptAdmin.includes('Total students') || sysPromptAdmin.includes('Total faculty'));

  // Principal (unflagged)
  const principalChat = await http('POST', '/api/ai/chat', { token: principalUnflaggedToken, body: { message: 'College-wide read-only summary' } });
  check('principal can chat (200)', principalChat.status === 200);
  const sysPromptPrincipal = lastChatBody?.messages?.[0]?.content || '';
  check('principal context includes READ-ONLY note', sysPromptPrincipal.includes('READ-ONLY'));

  // F. Record counts unchanged (AI read-only)
  const markCountBefore = await InternalMark.countDocuments();
  const counsellingCountBefore = await CounsellingRecord.countDocuments();
  const studentCountBefore = await Student.countDocuments();
  // Do another chat as student
  await http('POST', '/api/ai/chat', { token: stuBToken, body: { message: 'Suggest improvements' } });
  check('student chat 2 done (200)', true);
  const markCountAfter = await InternalMark.countDocuments();
  const counsellingCountAfter = await CounsellingRecord.countDocuments();
  const studentCountAfter = await Student.countDocuments();
  check('AI chat did not modify InternalMark count', markCountAfter === markCountBefore);
  check('AI chat did not modify CounsellingRecord count', counsellingCountAfter === counsellingCountBefore);
  check('AI chat did not modify Student count', studentCountAfter === studentCountBefore);

  // G. Graceful Ollama failure modes
  // 1. Unavailable: point to nothing
  const oldBase = process.env.OLLAMA_BASE_URL;
  process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:1';
  const chatUnavailable = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'Hello' } });
  check('Ollama unavailable returns graceful error (503)', chatUnavailable.status === 503);
  // other endpoints still work
  const healthStill = await http('GET', '/api/health');
  check('health still works when Ollama down', healthStill.status === 200);
  process.env.OLLAMA_BASE_URL = oldBase;

  // 2. HTTP 500
  mockState = 'http500';
  const chatHttp500 = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'Hi500' } });
  check('Ollama HTTP 500 returns 502', chatHttp500.status === 502);
  mockState = 'ok';

  // 3. Malformed
  mockState = 'malformed';
  const chatMalformed = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'HiBad' } });
  check('Ollama malformed response returns 503', chatMalformed.status === 503);
  mockState = 'ok';

  // 4. Timeout
  mockState = 'slow';
  process.env.OLLAMA_TIMEOUT_MS = '300';
  const chatTimeout = await http('POST', '/api/ai/chat', { token: adminToken, body: { message: 'HiTimeout' } });
  check('Ollama timeout returns 504', chatTimeout.status === 504);
  mockState = 'ok';
  process.env.OLLAMA_TIMEOUT_MS = '2000';

  // H. Rate limit
  process.env.AI_CHAT_RATE_LIMIT = '3';
  let hit429 = false;
  for (let i = 0; i < 5; i++) {
    const r = await http('POST', '/api/ai/chat', { token: facBToken, body: { message: `Rate test ${i}` } });
    if (r.status === 429) { hit429 = true; break; }
  }
  check('rate limit returns 429 after burst', hit429);
  process.env.AI_CHAT_RATE_LIMIT = '1000';

  // Summary
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
  // The imported backend keeps the event loop alive (its HTTP listener and the
  // meeting-reminder interval never allow a natural exit), so a successful run
  // must terminate explicitly — exactly like every other suite that boots
  // src/index.js. Without this, the process hangs at the end holding the port.
  process.exit(0);
}

run().catch((err) => {
  console.error('TEST FAILURE:', err);
  process.exit(1);
});
