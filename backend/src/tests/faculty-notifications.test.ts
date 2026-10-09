/**
 * FACULTY -> HOD DEPARTMENT NOTIFICATIONS VERIFICATION
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint (src/index.ts) against the local file
 * store and drives every notification route over HTTP exactly as the Faculty,
 * HOD and Admin dashboards do.
 *
 * Two departments are seeded with their own HOD and their own faculty, so a
 * missing department filter is provable rather than assumed:
 *   - a notice sent by CSE faculty must reach the CSE HOD and nobody else
 *   - the ECE HOD must never see it (unreadCount 0, empty list)
 *   - a body that tries to address another department is refused 400
 *   - read/unread is per recipient: one HOD marking it read does not leak
 *
 * Run: npm run test:faculty-notifications
 */
import bcrypt from 'bcryptjs';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('faculty-notifications-verify');
process.env.TMPDIR = store.dataDir;
process.env.TMP = store.dataDir;
process.env.TEMP = store.dataDir;

const PORT = 5101;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'faculty-notifications-secret-do-not-use-in-prod';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ksrce.test';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_DEPT = 'Administration';

const BASE = `http://127.0.0.1:${PORT}`;

type Status = 'PASS' | 'FAIL';
interface Row {
  n: number;
  requirement: string;
  status: Status;
  evidence: string;
}
const rows: Row[] = [];

function record(requirement: string, status: Status, evidence: string) {
  const n = rows.length + 1;
  rows.push({ n, requirement, status, evidence });
  console.log(`  [${status === 'PASS' ? 'PASS' : 'FAIL'}] ${requirement}\n         evidence: ${evidence}`);
}

async function check(requirement: string, fn: () => Promise<string>) {
  try {
    record(requirement, 'PASS', await fn());
  } catch (err: any) {
    record(requirement, 'FAIL', err?.message || String(err));
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function http(method: string, urlPath: string, opts: { token?: string; body?: any } = {}) {
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

async function waitForHealth() {
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

async function login(username: string, password: string): Promise<string> {
  const r = await http('POST', '/api/auth/login', { body: { username, password } });
  const token = r.body?.data?.token || r.body?.token;
  assert(token, `${username} could not log in (${r.status})`);
  return token as string;
}

async function main() {
  console.log(`\n### Local file store ready at ${store.dataDir}`);

  await import('../index.js');
  await waitForHealth();
  console.log(`### Real server listening on ${BASE}\n`);

  const { User, Faculty, Department, Notification } = await import('../models/index.js');

  const cse: any = await Department.findOne({ code: 'CSE' });
  const ece: any = await Department.findOne({ code: 'ECE' });
  const mech: any = await Department.findOne({ code: 'MECH' });
  assert(cse && ece && mech, 'bootstrap did not create the expected departments');

  const hash = bcrypt.hashSync('Mentor@123', 10);

  // ── SEED ──────────────────────────────────────────────────────────────────
  async function makeHod(dept: any, suffix: string) {
    const user: any = await User.create({
      username: `hod.${suffix}`, passwordHash: hash, role: 'HOD',
      email: `hod.${suffix}@ksrce.test`, fullName: `Dr Hod ${suffix.toUpperCase()}`,
      department: dept._id, isActive: true,
    });
    const token = await login(`hod.${suffix}`, 'Mentor@123');
    return { user, token, deptId: String(dept._id) };
  }

  async function makeFaculty(dept: any, empId: string, name: string) {
    const user: any = await User.create({
      username: `fac.${empId.toLowerCase()}`, passwordHash: hash, role: 'FACULTY',
      email: `fac.${empId.toLowerCase()}@ksrce.test`, fullName: name,
      department: dept._id, isActive: true,
    });
    const faculty: any = await Faculty.create({
      user: user._id, employeeId: empId, department: dept._id,
      designation: 'Assistant Professor', cabinLocation: 'C-1', isActive: true,
    } as any);
    const token = await login(`fac.${empId.toLowerCase()}`, 'Mentor@123');
    return { user, faculty, id: String(faculty._id), token };
  }

  const hodCse = await makeHod(cse, 'cse');
  const hodEce = await makeHod(ece, 'ece');

  const cseFaculty = await makeFaculty(cse, 'FNCSE1', 'Dr Cse Notify Faculty');
  const eceFaculty = await makeFaculty(ece, 'FNECE1', 'Dr Ece Notify Faculty');
  const mechFaculty = await makeFaculty(mech, 'FNMECH1', 'Dr Mech Faculty');

  // A FACULTY account with no Faculty record at all (broken identity).
  await User.create({
    username: 'fac.norecord', passwordHash: hash, role: 'FACULTY',
    email: 'fac.norecord@ksrce.test', fullName: 'Dr No Faculty Record',
    department: cse._id, isActive: true,
  } as any);
  const noRecordToken = await login('fac.norecord', 'Mentor@123');

  // A student, for the RBAC matrix.
  await User.create({
    username: 'fn.student', passwordHash: hash, role: 'STUDENT',
    email: 'fn.student@ksrce.test', fullName: 'Notification Student',
    department: cse._id, isActive: true,
  } as any);
  const studentToken = await login('fn.student', 'Mentor@123');

  const adminToken = await login('admin', 'Admin@12345');

  const storedCount = async () =>
    (await Notification.countDocuments({ type: 'FACULTY_NOTIFICATION' } as any)) as number;

  // ── 1. Faculty creates a notification ─────────────────────────────────────
  const CSE_TITLE = 'Lab session rescheduled this week';
  const CSE_MESSAGE = 'The CSE third-year lab session moves to Thursday 2 PM.';

  await check('Faculty can create a notification for their own department', async () => {
    const before = await storedCount();
    const r = await http('POST', '/api/notifications/faculty', {
      token: cseFaculty.token,
      body: { title: CSE_TITLE, message: CSE_MESSAGE },
    });
    assert(r.status === 201, `POST /api/notifications/faculty -> ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const d = r.body.data;
    assert(d.title === CSE_TITLE, `response title ${d.title}`);
    assert(d.message === CSE_MESSAGE, `response message ${d.message}`);
    assert(d.faculty_name === 'Dr Cse Notify Faculty', `faculty_name ${d.faculty_name}`);
    assert(d.department_id === String(cse._id), `department_id ${d.department_id}`);
    assert(d.department_name === cse.name, `department_name ${d.department_name}`);
    assert(d.is_read === false, 'a fresh notification must start unread');
    assert(d.hod_recipients === 1, `hod_recipients ${d.hod_recipients}, expected 1 (the CSE HOD)`);
    assert(d.admin_recipients === d.recipient_count - d.hod_recipients, 'recipient_count must equal HOD + Admin copies');
    assert(d.created_at, 'response carried no created_at');

    const after = await storedCount();
    assert(
      after === before + d.recipient_count,
      `store grew by ${after - before}, expected ${d.recipient_count} documents (one per recipient)`
    );

    const hodCopies = (await Notification.countDocuments({
      user: hodCse.user._id, title: CSE_TITLE,
    } as any)) as number;
    assert(hodCopies === 1, `the CSE HOD holds ${hodCopies} copies of this notice, expected exactly 1`);

    const copies: any[] = (await Notification.find({ title: CSE_TITLE } as any).lean()) as any[];
    assert(copies.length === d.recipient_count, `store holds ${copies.length} copies, expected ${d.recipient_count}`);
    assert(copies.every((c) => c.type === 'FACULTY_NOTIFICATION'), 'a copy has the wrong type');
    assert(copies.every((c) => String(c.department) === String(cse._id)), 'a copy has the wrong department');
    assert(copies.every((c) => c.facultyId === cseFaculty.id), 'a copy is missing the sender facultyId');
    assert(copies.every((c) => c.isRead === false), 'a fresh copy must be unread');
    assert(copies.every((c) => c.recipientRole === 'HOD' || c.recipientRole === 'ADMIN'),
      'a copy carries no recipientRole');
    const hodCopy = copies.find((c) => String(c.user) === String(hodCse.user._id));
    assert(hodCopy, `no copy was addressed to the CSE HOD (recipients: ${copies.map((c) => c.user).join(', ')})`);
    return `201, delivered to ${d.hod_recipients} HOD + ${d.admin_recipients} admin; stored with type FACULTY_NOTIFICATION and department=${cse.name}`;
  });

  // ── 2. The right HOD sees it ──────────────────────────────────────────────
  await check('The department HOD sees the notification with every required field', async () => {
    const r = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/notifications -> ${r.status}`);
    const d = r.body.data;
    assert(Array.isArray(d.notifications), 'response carried no notification list');
    assert(d.unreadCount === 1, `unreadCount ${d.unreadCount}, expected 1`);
    assert(d.totalCount === 1, `totalCount ${d.totalCount}, expected 1`);
    const n = d.notifications.find((x: any) => x.title === CSE_TITLE);
    assert(n, `the sent notification is missing from the HOD list: ${JSON.stringify(d.notifications)}`);
    assert(n.message === CSE_MESSAGE, `message ${n.message}`);
    assert(n.faculty_name === 'Dr Cse Notify Faculty', `faculty_name ${n.faculty_name}`);
    assert(n.department_name === cse.name, `department_name ${n.department_name}`);
    assert(typeof n.is_read === 'boolean', 'notification carried no is_read flag');
    assert(n.is_read === false, 'a freshly delivered notification must be unread');
    assert(typeof n.created_at === 'string' && !Number.isNaN(Date.parse(n.created_at)),
      `created_at "${n.created_at}" is not a parseable timestamp`);
    assert(d.department?.code === 'CSE', `payload department ${d.department?.code}`);
    return `title / message / faculty_name / department_name / created_at / is_read all present; unreadCount ${d.unreadCount}`;
  });

  await check('The notification is real stored data, not a fabricated row', async () => {
    const r = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    const apiIds = (r.body.data.notifications as any[]).map((n) => n.id).sort();
    const stored = await Notification.find({ type: 'FACULTY_NOTIFICATION' } as any).lean();
    const storedForHod = (stored as any[])
      .filter((d) => String(d.user) === String(hodCse.user._id))
      .map((d) => String(d._id))
      .sort();
    assert(JSON.stringify(apiIds) === JSON.stringify(storedForHod),
      `API ids ${JSON.stringify(apiIds)} != stored ids ${JSON.stringify(storedForHod)}`);
    assert(apiIds.length > 0, 'nothing to compare');
    return `${apiIds.length} API row(s) match the stored Notification documents exactly`;
  });

  await check('The HOD also receives it in the standard notification inbox', async () => {
    const r = await http('GET', '/api/notifications', { token: hodCse.token });
    assert(r.status === 200, `GET /api/notifications -> ${r.status}`);
    const titles = (r.body.data.notifications as any[]).map((n) => n.title);
    assert(titles.includes(CSE_TITLE), `the HOD inbox does not contain the notice: ${JSON.stringify(titles)}`);
    assert(r.body.data.unreadCount >= 1, `inbox unreadCount ${r.body.data.unreadCount}`);
    const row = (r.body.data.notifications as any[]).find((n) => n.title === CSE_TITLE);
    assert(row.faculty_name === 'Dr Cse Notify Faculty', `inbox row faculty_name ${row.faculty_name}`);
    assert(row.department_name === cse.name, `inbox row department_name ${row.department_name}`);
    return `inbox lists it with faculty_name + department_name; unreadCount ${r.body.data.unreadCount}`;
  });

  // ── 3. Department isolation ───────────────────────────────────────────────
  await check('A HOD of another department never receives the notification', async () => {
    const r = await http('GET', '/api/hod/notifications', { token: hodEce.token });
    assert(r.status === 200, `GET /api/hod/notifications (ECE HOD) -> ${r.status}`);
    assert(r.body.data.notifications.length === 0,
      `ECE HOD saw ${r.body.data.notifications.length} notification(s): ${JSON.stringify(r.body.data.notifications)}`);
    assert(r.body.data.unreadCount === 0, `ECE HOD unreadCount ${r.body.data.unreadCount}, expected 0`);
    assert(r.body.data.totalCount === 0, `ECE HOD totalCount ${r.body.data.totalCount}, expected 0`);

    const eceInbox = await http('GET', '/api/notifications', { token: hodEce.token });
    const eceTitles = (eceInbox.body.data.notifications as any[]).map((n) => n.title);
    assert(!eceTitles.includes(CSE_TITLE), 'the CSE notice leaked into the ECE HOD inbox');

    const eceFacultyNotices = await http('GET', '/api/hod/faculty-notifications', { token: hodEce.token });
    const eceOut = (eceFacultyNotices.body.data as any[]).map((n) => n.title);
    assert(!eceOut.includes(CSE_TITLE), 'the CSE notice leaked into the ECE faculty-notifications list');
    return 'ECE HOD list 0, unreadCount 0, ECE inbox and ECE faculty-notifications all clean';
  });

  await check('Each department only ever receives its own faculty notices', async () => {
    const ECE_TITLE = 'ECE lab inventory update';
    const r = await http('POST', '/api/notifications/faculty', {
      token: eceFaculty.token,
      body: { title: ECE_TITLE, message: 'New oscilloscopes arrived for ECE lab 2.' },
    });
    assert(r.status === 201, `ECE faculty send -> ${r.status}`);

    const cseList = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    const cseTitles = (cseList.body.data.notifications as any[]).map((n) => n.title);
    assert(!cseTitles.includes(ECE_TITLE), 'an ECE notice reached the CSE HOD');
    assert(cseList.body.data.unreadCount === 1, `CSE unreadCount ${cseList.body.data.unreadCount}, expected 1`);

    const eceList = await http('GET', '/api/hod/notifications', { token: hodEce.token });
    const titles = (eceList.body.data.notifications as any[]).map((n) => n.title);
    assert(titles.includes(ECE_TITLE), 'the ECE HOD cannot see their own faculty notice');
    assert(!titles.includes(CSE_TITLE), 'the CSE notice reached the ECE HOD');
    assert(eceList.body.data.unreadCount === 1, `ECE unreadCount ${eceList.body.data.unreadCount}`);
    return 'CSE list has no ECE notice, ECE list has no CSE notice; both unreadCounts 1';
  });

  // ── 4. Cross-department rejection ─────────────────────────────────────────
  await check('A body addressing another department is refused and stores nothing', async () => {
    const before = await storedCount();
    const r = await http('POST', '/api/notifications/faculty', {
      token: cseFaculty.token,
      body: {
        title: 'Cross department attempt',
        message: 'This must never reach the ECE HOD.',
        departmentId: String(ece._id),
      },
    });
    assert(r.status === 400, `cross-department send expected 400, got ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
    assert(/cross-department/i.test(r.body.message || ''), `message "${r.body.message}" does not explain the refusal`);
    const after = await storedCount();
    assert(after === before, `the rejected send wrote ${after - before} document(s)`);

    const viaField = await http('POST', '/api/notifications/faculty', {
      token: cseFaculty.token,
      body: { title: 'Cross department attempt 2', message: 'Still not allowed.', department: String(ece._id) },
    });
    assert(viaField.status === 400, `department field expected 400, got ${viaField.status}`);
    const stored = await Notification.find({ title: { $regex: 'Cross department attempt' } } as any).lean();
    assert(stored.length === 0, `${stored.length} rejected document(s) were written`);
    const eceList = await http('GET', '/api/hod/notifications', { token: hodEce.token });
    const titles = (eceList.body.data.notifications as any[]).map((n) => n.title);
    assert(!titles.some((t: string) => t.startsWith('Cross department')), 'a rejected notice reached the ECE HOD');
    return 'both departmentId and department attempts -> 400, 0 documents written, ECE HOD unaffected';
  });

  // ── 5. Read / unread behaviour ────────────────────────────────────────────
  await check('A HOD of the wrong department cannot mark another department notice read', async () => {
    const list = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    const target = (list.body.data.notifications as any[]).find((n) => n.title === CSE_TITLE);
    assert(target, 'notification to mark not found');

    const r = await http('PATCH', `/api/notifications/${target.id}/read`, { token: hodEce.token });
    assert(r.status === 200 || r.status === 404, `foreign mark-read -> ${r.status}`);
    const doc: any = await Notification.findById(target.id);
    assert(doc, 'the notification disappeared');
    assert(doc.isRead === false, 'a HOD from another department marked the notice read');
    const again = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    assert(again.body.data.unreadCount === 1, `CSE unreadCount after the foreign attempt: ${again.body.data.unreadCount}`);
    return `ECE HOD mark-read on the CSE notice -> ${r.status}, stored isRead still false`;
  });

  await check('The right HOD marks it read and the unread count drops to zero', async () => {
    const list = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    const target = (list.body.data.notifications as any[]).find((n) => n.title === CSE_TITLE);
    assert(target, 'notification to mark not found');

    const r = await http('PATCH', `/api/notifications/${target.id}/read`, { token: hodCse.token });
    assert(r.status === 200, `mark read -> ${r.status}`);

    const doc: any = await Notification.findById(target.id);
    assert(doc.isRead === true, `stored isRead is ${doc.isRead}, expected true`);

    const after = await http('GET', '/api/hod/notifications', { token: hodCse.token });
    assert(after.body.data.unreadCount === 0, `unreadCount after marking read: ${after.body.data.unreadCount}`);
    const row = (after.body.data.notifications as any[]).find((n) => n.id === target.id);
    assert(row.is_read === true, 'the API still reports the notice as unread');

    const inbox = await http('GET', '/api/notifications', { token: hodCse.token });
    const inboxRow = (inbox.body.data.notifications as any[]).find((n) => n.title === CSE_TITLE);
    assert(inboxRow.is_read === 1, 'the standard inbox does not reflect the read state');

    // The ECE HOD's copy is untouched: read state is per recipient.
    const eceList = await http('GET', '/api/hod/notifications', { token: hodEce.token });
    assert(eceList.body.data.unreadCount === 1, 'marking one HOD read changed another HOD count');
    return 'stored isRead true, HOD unreadCount 0, inbox is_read 1, ECE copy still unread';
  });

  // ── 6. RBAC on send / sent / HOD read ─────────────────────────────────────
  await check('Only FACULTY may create a department notification', async () => {
    const body = { title: 'RBAC probe', message: 'Should not be created.' };
    const asStudent = await http('POST', '/api/notifications/faculty', { token: studentToken, body });
    const asHod = await http('POST', '/api/notifications/faculty', { token: hodCse.token, body });
    const asAdmin = await http('POST', '/api/notifications/faculty', { token: adminToken, body });
    const anon = await http('POST', '/api/notifications/faculty', { body });
    assert(asStudent.status === 403, `STUDENT -> ${asStudent.status}, expected 403`);
    assert(asHod.status === 403, `HOD -> ${asHod.status}, expected 403`);
    assert(asAdmin.status === 403, `ADMIN -> ${asAdmin.status}, expected 403`);
    assert(anon.status === 401, `anonymous -> ${anon.status}, expected 401`);
    const probe = await Notification.find({ title: 'RBAC probe' } as any).lean();
    assert(probe.length === 0, 'a refused caller still wrote a document');
    return `STUDENT ${asStudent.status}, HOD ${asHod.status}, ADMIN ${asAdmin.status}, anonymous ${anon.status}; 0 documents written`;
  });

  await check('The HOD notification endpoint refuses every non-HOD role', async () => {
    const asFaculty = await http('GET', '/api/hod/notifications', { token: cseFaculty.token });
    const asStudent = await http('GET', '/api/hod/notifications', { token: studentToken });
    const asAdmin = await http('GET', '/api/hod/notifications', { token: adminToken });
    const anon = await http('GET', '/api/hod/notifications');
    assert(asFaculty.status === 403, `FACULTY -> ${asFaculty.status}, expected 403`);
    assert(asStudent.status === 403, `STUDENT -> ${asStudent.status}, expected 403`);
    assert(asAdmin.status === 403, `ADMIN -> ${asAdmin.status}, expected 403 (Admin authorization unchanged)`);
    assert(anon.status === 401, `anonymous -> ${anon.status}, expected 401`);
    return `FACULTY ${asFaculty.status}, STUDENT ${asStudent.status}, ADMIN ${asAdmin.status}, anonymous ${anon.status}`;
  });

  await check('A HOD token without a department claim fails closed', async () => {
    await User.create({
      username: 'hod.fndep', passwordHash: hash, role: 'HOD',
      email: 'hod.fndep@ksrce.test', fullName: 'Dr No Department',
      department: undefined as any, isActive: true,
    } as any);
    const token = await login('hod.fndep', 'Mentor@123');
    const r = await http('GET', '/api/hod/notifications', { token });
    assert(r.status === 403, `unscoped HOD -> ${r.status}, expected 403`);
    return `HOD without a department claim -> ${r.status}`;
  });

  // ── 7. Validation and identity guards ─────────────────────────────────────
  await check('Blank or oversized content is refused with a 400', async () => {
    const cases: Array<[string, any, RegExp]> = [
      ['missing title', { message: 'Only a message.' }, /title/i],
      ['missing message', { title: 'Only a title.' }, /message/i],
      ['whitespace title', { title: '   ', message: 'x' }, /title/i],
      ['oversized title', { title: 'T'.repeat(151), message: 'x' }, /150/],
      ['oversized message', { title: 'ok', message: 'M'.repeat(2001) }, /2000/],
    ];
    const before = await storedCount();
    for (const [label, body, pattern] of cases) {
      const r = await http('POST', '/api/notifications/faculty', { token: cseFaculty.token, body });
      assert(r.status === 400, `${label} -> ${r.status}, expected 400`);
      assert(pattern.test(r.body.message || ''), `${label} message "${r.body.message}" does not match ${pattern}`);
    }
    const after = await storedCount();
    assert(after === before, `invalid payloads wrote ${after - before} document(s)`);
    return `${cases.length} invalid payloads -> 400 each, 0 documents written`;
  });

  await check('A faculty account with no Faculty record cannot send', async () => {
    const r = await http('POST', '/api/notifications/faculty', {
      token: noRecordToken,
      body: { title: 'No record', message: 'Should be refused.' },
    });
    assert(r.status === 403, `no Faculty record -> ${r.status}, expected 403`);
    const stored = await Notification.find({ title: 'No record' } as any).lean();
    assert(stored.length === 0, 'the refused send still wrote a document');
    return `-> ${r.status}, 0 documents written`;
  });

  await check('A department with no active HOD is refused with a 409', async () => {
    const before = await storedCount();
    const r = await http('POST', '/api/notifications/faculty', {
      token: mechFaculty.token,
      body: { title: 'Mech notice', message: 'Nobody is appointed to read this.' },
    });
    assert(r.status === 409, `no active HOD -> ${r.status}, expected 409`);
    assert(/no active hod/i.test(r.body.message || ''), `message "${r.body.message}"`);
    assert(/Mechanical/i.test(r.body.message || ''), 'the refusal does not name the department');
    const after = await storedCount();
    assert(after === before, `the refused send wrote ${after - before} document(s)`);
    return `-> ${r.status}: "${r.body.message}", 0 documents written`;
  });

  // ── 8. Sent list ──────────────────────────────────────────────────────────
  await check('The sent list is scoped to the authoring faculty member', async () => {
    const mine = await http('GET', '/api/notifications/sent', { token: cseFaculty.token });
    assert(mine.status === 200, `GET /api/notifications/sent -> ${mine.status}`);
    const titles = (mine.body.data.notifications as any[]).map((n) => n.title);
    assert(titles.includes(CSE_TITLE), 'the author cannot see their own sent notice');
    assert(!titles.some((t: string) => t.includes('ECE')), `another department's notice leaked: ${JSON.stringify(titles)}`);
    for (const n of mine.body.data.notifications as any[]) {
      assert(n.faculty_name === 'Dr Cse Notify Faculty', `sent row faculty_name ${n.faculty_name}`);
      assert(n.department_name === cse.name, `sent row department_name ${n.department_name}`);
      assert(typeof n.is_read === 'boolean', 'sent row carried no read flag');
    }

    // One send fans out to HOD + Admin copies; the author must still see the
    // notice exactly once, not once per recipient.
    const dupes = titles.filter((t: string, i: number) => titles.indexOf(t) !== i);
    assert(dupes.length === 0, `the sent list repeats a notice once per recipient: ${JSON.stringify(titles)}`);
    assert(titles.length === 1, `CSE author sent 1 notice but the list returned ${titles.length}`);

    const theirs = await http('GET', '/api/notifications/sent', { token: eceFaculty.token });
    const theirTitles = (theirs.body.data.notifications as any[]).map((n) => n.title);
    assert(theirTitles.includes('ECE lab inventory update'), 'the ECE author cannot see their own notice');
    assert(!theirTitles.includes(CSE_TITLE), 'the ECE author can see a CSE notice');
    assert(theirTitles.length === 1, `ECE author sent 1 notice but the list returned ${theirTitles.length}`);
    return `CSE author 1 notice (no per-recipient duplication), ECE author 1, no overlap`;
  });

  await check('The sent list refuses non-faculty roles', async () => {
    const asStudent = await http('GET', '/api/notifications/sent', { token: studentToken });
    const asHod = await http('GET', '/api/notifications/sent', { token: hodCse.token });
    const anon = await http('GET', '/api/notifications/sent');
    assert(asStudent.status === 403, `STUDENT -> ${asStudent.status}`);
    assert(asHod.status === 403, `HOD -> ${asHod.status}`);
    assert(anon.status === 401, `anonymous -> ${anon.status}`);
    return `STUDENT ${asStudent.status}, HOD ${asHod.status}, anonymous ${anon.status}`;
  });

  // ── 9. Admin activity, existing permissions only ──────────────────────────
  await check('Admin sees the notification activity through the existing inbox', async () => {
    const r = await http('GET', '/api/notifications', { token: adminToken });
    assert(r.status === 200, `GET /api/notifications (admin) -> ${r.status}`);
    const rows = r.body.data.notifications as any[];
    const cseRow = rows.find((n) => n.title === CSE_TITLE);
    assert(cseRow, `the admin inbox has no record of the CSE notice: ${JSON.stringify(rows.map((n) => n.title))}`);
    assert(cseRow.faculty_name === 'Dr Cse Notify Faculty', `admin row faculty_name ${cseRow.faculty_name}`);
    assert(cseRow.department_name === cse.name, `admin row department_name ${cseRow.department_name}`);
    assert(cseRow.is_read === 0, 'the admin copy must start unread');
    const eceRow = rows.find((n) => n.title === 'ECE lab inventory update');
    assert(eceRow, 'the admin activity feed is missing the ECE notice');
    assert(eceRow.department_name === ece.name, `admin row department_name ${eceRow.department_name}`);
    assert(r.body.data.unreadCount >= 2, `admin unreadCount ${r.body.data.unreadCount}`);
    return `admin inbox shows both departments' notices with faculty_name + department_name; unreadCount ${r.body.data.unreadCount}`;
  });

  await check('Existing Admin notification permissions are unchanged', async () => {
    const trigger = await http('POST', '/api/notifications/trigger-saturday-reminders', {
      token: adminToken, body: { triggerType: 'SATURDAY_TODAY' },
    });
    assert(trigger.status === 200, `admin trigger -> ${trigger.status}, expected 200`);
    const asFaculty = await http('POST', '/api/notifications/trigger-saturday-reminders', {
      token: cseFaculty.token, body: {},
    });
    assert(asFaculty.status === 403, `FACULTY trigger -> ${asFaculty.status}, expected 403`);
    const anon = await http('POST', '/api/notifications/trigger-saturday-reminders', { body: {} });
    assert(anon.status === 401, `anonymous trigger -> ${anon.status}, expected 401`);
    return `ADMIN 200, FACULTY ${asFaculty.status}, anonymous ${anon.status}`;
  });

  // ── 10. Existing surfaces still intact ────────────────────────────────────
  await check('The pre-existing HOD faculty-notifications surface is unchanged', async () => {
    const r = await http('GET', '/api/hod/faculty-notifications', { token: hodCse.token });
    assert(r.status === 200, `GET /api/hod/faculty-notifications -> ${r.status}`);
    assert(Array.isArray(r.body.data), 'the legacy endpoint no longer returns an array');
    for (const n of r.body.data as any[]) {
      assert(typeof n.is_read === 'boolean', 'legacy row lost its is_read flag');
      assert('faculty_name' in n, 'legacy row lost its faculty_name field');
    }
    const dash = await http('GET', '/api/hod/dashboard', { token: hodCse.token });
    assert(dash.status === 200, `GET /api/hod/dashboard -> ${dash.status}`);
    assert(dash.body.data.summary.totalStudents >= 0, 'the HOD dashboard payload changed shape');
    return `faculty-notifications ${r.status} with ${r.body.data.length} row(s); dashboard ${dash.status}`;
  });

  await check('Notification responses carry no GPS / location tracking fields', async () => {
    const paths: Array<[string, string]> = [
      ['GET', '/api/hod/notifications'],
      ['GET', '/api/notifications'],
      ['GET', '/api/notifications/sent'],
      ['GET', '/api/hod/faculty-notifications'],
    ];
    const tokens: Array<[string, string]> = [
      ['HOD', hodCse.token],
      ['FACULTY', cseFaculty.token],
      ['ADMIN', adminToken],
    ];
    const needles = ['latitude', 'longitude', 'geotag', 'locationStatus', 'accuracy', 'deviceGeotag'];
    let scanned = 0;
    for (const [method, path] of paths) {
      for (const [role, token] of tokens) {
        const r = await http(method, path, { token });
        if (r.status !== 200) continue; // role-gated paths are covered above
        scanned++;
        const text = JSON.stringify(r.body);
        for (const needle of needles) {
          assert(!text.includes(needle), `${role} ${path} leaked "${needle}"`);
        }
      }
    }
    assert(scanned >= 4, `only ${scanned} responses were scanned`);
    return `${scanned} responses scanned, 0 of ${needles.length} location fields present`;
  });

  // ── REPORT ────────────────────────────────────────────────────────────────
  const pass = rows.filter((r) => r.status === 'PASS').length;
  const fail = rows.filter((r) => r.status === 'FAIL').length;
  console.log('\n\n========== FACULTY -> HOD NOTIFICATION VERIFICATION ==========\n');
  console.log('| # | Requirement | Status | Evidence |');
  console.log('|---|-------------|--------|----------|');
  for (const r of rows) {
    console.log(`| ${r.n} | ${r.requirement} | ${r.status} | ${r.evidence.replace(/\|/g, '/')} |`);
  }
  console.log(`\nTOTAL ${rows.length}  PASS ${pass}  FAIL ${fail}`);
  if (fail > 0) {
    console.log('FAILURES:');
    for (const r of rows.filter((x) => x.status !== 'PASS')) console.log(`  - ${r.requirement}: ${r.evidence}`);
  }

  await store.teardown();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('HARNESS ERROR:', err);
  process.exit(1);
});
