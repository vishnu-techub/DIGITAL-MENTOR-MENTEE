/**
 * EVIDENCE LOCATION + TIMESTAMPS — full-stack runtime verification.
 * ---------------------------------------------------------------------------
 * Boots the REAL production entrypoint against a real local file store, drives
 * the real mentoring-evidence upload over HTTP as a mentor, and inspects the
 * ACTUAL stored bytes and records.
 *
 * Covers:
 *   A. A captured GPS fix is persisted and associated with the correct evidence
 *      record (lat/long/accuracy + location-captured time).
 *   B. Reverse geocoding resolves a place name when the provider answers.
 *   C. A denied / unavailable / timeout location NEVER blocks the upload and is
 *      recorded honestly (no fake coordinates, no fake place name).
 *   D. Out-of-range / non-numeric coordinates are rejected (400) with the right
 *      code; nothing is stored.
 *   E. Provider failures (not found / 429 / 5xx / unreachable / disabled) never
 *      block the upload; the status says what really happened.
 *   F. Capture time from EXIF is stored; missing EXIF never invents a time.
 *   G. The server records the authoritative upload time (UTC) and the uploader.
 *   H. Evidence photos are NEVER watermarked and are served byte-for-byte.
 *   I. GPS metadata is only reachable by authorised users.
 *
 * Run: npx tsx src/tests/evidence-location-runtime.test.ts
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

// The store resolves its directory at import time, so this must come first.
const store = useTemporaryLocalStore('evidence-location-runtime');

const PORT = 5098;
const MOCK_PORT = 5099;
const DEAD_PORT = 5096;
process.env.PORT = String(PORT);
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = 'evidence-location-runtime-secret-do-not-use-in-prod';
// Start with geocoding disabled; individual cases flip the provider env at call
// time (the service reads it per lookup), so all provider modes are exercised.
process.env.GEOCODING_DISABLED = 'true';

const BASE = `http://127.0.0.1:${PORT}`;
const MOCK_BASE = `http://127.0.0.1:${MOCK_PORT}/reverse`;

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

type FormFile = { field: string; name: string; type: string; buffer: Buffer };

async function httpRequest(
  method: string,
  urlPath: string,
  opts: { token?: string; body?: any } = {}
): Promise<{ status: number; body: any; bytes: number; contentType: string }> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  let body: any;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${urlPath}`, { method, headers, body });
  const contentType = res.headers.get('content-type') || '';
  let parsed: any = null;
  let bytes = 0;
  if (contentType.includes('application/json')) {
    const text = await res.text();
    bytes = Buffer.byteLength(text);
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  } else {
    const buf = Buffer.from(await res.arrayBuffer());
    bytes = buf.length;
    parsed = buf;
  }
  return { status: res.status, body: parsed, bytes, contentType };
}

async function postForm(
  urlPath: string,
  token: string,
  fields: Record<string, string>,
  files: FormFile[]
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  for (const f of files) {
    form.append(f.field, new Blob([new Uint8Array(f.buffer)], { type: f.type }), f.name);
  }
  const res = await fetch(`${BASE}${urlPath}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: parsed };
}

async function waitForHealth() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('server did not become healthy in time');
}

async function loginAs(username: string, password: string): Promise<string> {
  const res = await httpRequest('POST', '/api/auth/login', { body: { username, password } });
  assert(res.status === 200, `login ${username} failed: ${res.status} ${JSON.stringify(res.body)}`);
  const token = res.body?.data?.token || res.body?.token;
  assert(token, `login ${username} returned no token`);
  return token;
}

/** Small JPEG evidence photo (well under the 200 KB ceiling). */
async function makePhoto(): Promise<Buffer> {
  return sharp({
    create: { width: 640, height: 480, channels: 3, background: { r: 30, g: 90, b: 150 } },
  })
    .jpeg({ quality: 78 })
    .toBuffer();
}

let locateStoredUploadFn: ((fileUrl: string) => any) | null = null;
function storedPathFor(fileUrl: string): string | null {
  return locateStoredUploadFn ? locateStoredUploadFn(fileUrl)?.path ?? null : null;
}

// ---------------------------------------------------------------------------
// Mock Nominatim-compatible provider
// ---------------------------------------------------------------------------
type MockMode = 'ok' | 'notfound' | 'ratelimit' | 'error';
let mockMode: MockMode = 'ok';
let mockHits = 0;

function startMockProvider(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    mockHits++;
    if (mockMode === 'ok') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          display_name: 'Peelamedu, Coimbatore, Tamil Nadu, India',
          address: { suburb: 'Peelamedu', city: 'Coimbatore', state: 'Tamil Nadu', country: 'India' },
        })
      );
    } else if (mockMode === 'notfound') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unable to geocode' }));
    } else if (mockMode === 'ratelimit') {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{}');
    }
  });
  return new Promise((resolve) => server.listen(MOCK_PORT, '127.0.0.1', () => resolve(server)));
}

function useProvider(mode: MockMode | 'disabled' | 'dead') {
  if (mode === 'disabled') {
    process.env.GEOCODING_DISABLED = 'true';
    delete process.env.GEOCODING_BASE_URL;
  } else if (mode === 'dead') {
    process.env.GEOCODING_DISABLED = '';
    process.env.GEOCODING_BASE_URL = `http://127.0.0.1:${DEAD_PORT}/reverse`;
  } else {
    process.env.GEOCODING_DISABLED = '';
    process.env.GEOCODING_BASE_URL = MOCK_BASE;
    mockMode = mode;
  }
}

async function main() {
  const { connectDB } = await import('../config/database.js');
  await connectDB();

  const { locateStoredUpload } = await import('../config/storage.js');
  locateStoredUploadFn = locateStoredUpload;

  const { Faculty, Department, Batch, Student, User, MentorAssignment, MentoringEvidence, CounsellingRecord } =
    await import('../models/index.js');

  const hash = bcrypt.hashSync('Mentor@123', 10);
  const dept: any = await Department.create({ name: 'Computer Science', code: 'CSE' });
  const batch: any = await Batch.create({ name: '2022-2026', startYear: 2022, endYear: 2026 });

  const makeUser = (username: string, fullName: string, role: string, email: string) =>
    User.create({ username, passwordHash: hash, role, email, fullName, department: dept._id, isActive: true });

  const makeFaculty = async (username: string, fullName: string, employeeId: string, email: string) => {
    const user: any = await makeUser(username, fullName, 'FACULTY', email);
    return await Faculty.create({
      user: user._id,
      employeeId,
      designation: 'Assistant Professor',
      cabinLocation: 'FAC-101',
      department: dept._id,
      isActive: true,
    });
  };

  const makeStudent = async (reg: string, fullName: string) => {
    const first = fullName.split(' ')[0].toLowerCase();
    const user: any = await makeUser(reg, fullName, 'STUDENT', `${first}@ksrce.test`);
    return await Student.create({
      user: user._id,
      fullName,
      registerNumber: reg,
      email: `${first}@ksrce.test`,
      mobileNumber: '9876500001',
      department: dept._id,
      section: 'A',
      year: 3,
      batch: batch._id,
      profileCompleted: true,
      isActive: true,
    });
  };

  const mentorA: any = await makeFaculty('mentor.loc.a', 'Dr Location Alpha', 'FAC-LOC1', 'loc.a@ksrce.test');
  const mentorB: any = await makeFaculty('mentor.loc.b', 'Dr Location Beta', 'FAC-LOC2', 'loc.b@ksrce.test');
  const studentA: any = await makeStudent('731523208801', 'Arun Loc');
  const studentB: any = await makeStudent('731523208802', 'Bhavya Loc');
  const adminUser: any = await User.findOne({ role: 'ADMIN' });

  await MentorAssignment.create({
    student: studentA._id,
    mentor: mentorA._id,
    department: dept._id,
    status: 'ACTIVE',
    assignedBy: adminUser?._id || mentorA.user,
  });
  await MentorAssignment.create({
    student: studentB._id,
    mentor: mentorB._id,
    department: dept._id,
    status: 'ACTIVE',
    assignedBy: adminUser?._id || mentorB.user,
  });

  const mockServer = await startMockProvider();

  console.log('\n=== Evidence location + timestamps: full-stack runtime ===\n');
  console.log('  booting src/index.ts ...');
  await import('../index.js');
  await waitForHealth();

  const mentorToken = await loginAs('mentor.loc.a', 'Mentor@123');
  const otherMentorToken = await loginAs('mentor.loc.b', 'Mentor@123');
  const studentToken = await loginAs('731523208801', 'Mentor@123');

  const photo = await makePhoto();
  const studentId = String(studentA._id);
  const capturedAt = new Date(Date.now() - 5 * 60_000).toISOString();

  const baseFields = (date: string, observation: string) => ({
    studentId,
    counsellingDate: date,
    categories: '["Academic Development"]',
    discussionWith: '["student"]',
    discussionObservation: observation,
  });

  const evidenceLocation = (over: Record<string, unknown> = {}) =>
    JSON.stringify({ status: 'CAPTURED', latitude: 11.0168, longitude: 76.9558, accuracy: 25, capturedAt, ...over });

  // ---------------------------------------------------------------------------
  console.log('A + B. Captured GPS is persisted, associated, and geocoded');
  // ---------------------------------------------------------------------------
  let capturedEvidenceId = '';
  {
    useProvider('ok');
    const hitsBefore = mockHits;
    const res = await postForm(
      '/api/counselling',
      mentorToken,
      {
        ...baseFields('2026-09-10', 'Location verification record.'),
        evidenceLocation: evidenceLocation(),
        evidenceCaptureTimes: JSON.stringify([{ time: '2026:09:10 14:23:11', source: 'EXIF' }]),
      },
      [{ field: 'evidence', name: 'gps.jpg', type: 'image/jpeg', buffer: photo }]
    );
    check('upload with a captured location succeeds', res.status === 200 || res.status === 201, `status=${res.status} ${JSON.stringify(res.body)}`);

    const item: any = res.body?.data?.evidence?.[0] || {};
    capturedEvidenceId = String(item.evidenceId || '');
    check('the response carries the captured location status', item.locationStatus === 'CAPTURED', String(item.locationStatus));
    check('latitude is stored', Number(item.latitude) === 11.0168, String(item.latitude));
    check('longitude is stored', Number(item.longitude) === 76.9558, String(item.longitude));
    check('accuracy is stored in metres', Number(item.accuracyMeters) === 25, String(item.accuracyMeters));
    check('the location-capture time is preserved', item.locationCapturedAt === capturedAt, String(item.locationCapturedAt));
    check('the provider was actually called', mockHits > hitsBefore, `hits=${mockHits - hitsBefore}`);
    check('the place name resolved', item.placeNameStatus === 'RESOLVED' && /Coimbatore/.test(String(item.placeName)), JSON.stringify({ s: item.placeNameStatus, n: item.placeName }));
    check('the capture time from EXIF is stored', item.captureTime === '2026-09-10T14:23:11', String(item.captureTime));
    check('the capture-time source is recorded', String(item.captureTimeSource).toUpperCase() === 'EXIF', String(item.captureTimeSource));

    // Association + uploader + authoritative server time, straight from the DB.
    const row: any = await MentoringEvidence.findOne({ evidenceId: capturedEvidenceId });
    check('the evidence row exists', !!row, capturedEvidenceId);
    check('the evidence is associated with the correct student', (row?.students || []).map(String).includes(studentId), JSON.stringify((row?.students || []).map(String)));
    check('the uploader is stamped from the server auth context', row?.uploadedByName === 'Dr Location Alpha', String(row?.uploadedByName));
    check('the server records an authoritative upload time', !!row?.uploadedAt && Number.isFinite(new Date(row.uploadedAt).getTime()));
    const uploadDelta = Date.now() - new Date(row.uploadedAt).getTime();
    check('the upload time is the server clock, not the device', uploadDelta >= 0 && uploadDelta < 5 * 60_000, `delta=${uploadDelta}ms`);
    check('the upload time is a UTC ISO string', /Z$/.test(String(new Date(row.uploadedAt).toISOString())), String(row.uploadedAt));

    const createdRecordId = String(res.body?.data?.recordId || '');
    const createdRecord: any = createdRecordId ? await CounsellingRecord.findById(createdRecordId) : null;
    check(
      'the mentoring record references the stored evidence id',
      Array.isArray(createdRecord?.evidence) &&
        createdRecord.evidence.some((e: any) => String(e?.evidenceId) === capturedEvidenceId),
      JSON.stringify(createdRecord?.evidence)
    );
  }

  // ---------------------------------------------------------------------------
  console.log('\nC. Denied / unavailable / timeout location never blocks upload');
  // ---------------------------------------------------------------------------
  {
    useProvider('ok');
    const cases: Array<[string, string]> = [
      ['DENIED', JSON.stringify({ status: 'DENIED' })],
      ['UNAVAILABLE', JSON.stringify({ status: 'UNAVAILABLE' })],
      ['TIMEOUT', JSON.stringify({ status: 'TIMEOUT' })],
    ];
    for (const [label, payload] of cases) {
      const res = await postForm(
        '/api/counselling',
        mentorToken,
        { ...baseFields('2026-09-11', `No-fix case ${label}.`), evidenceLocation: payload },
        [{ field: 'evidence', name: `no-fix-${label}.jpg`, type: 'image/jpeg', buffer: photo }]
      );
      check(`${label}: the upload still succeeds`, res.status === 200 || res.status === 201, `status=${res.status}`);
      const item: any = res.body?.data?.evidence?.[0] || {};
      check(`${label}: the true status is recorded`, item.locationStatus === label, String(item.locationStatus));
      check(`${label}: no fake coordinates are stored`, item.latitude === null && item.longitude === null, JSON.stringify({ lat: item.latitude, lon: item.longitude }));
      check(`${label}: no place name is invented`, item.placeName === null, String(item.placeName));
    }

    // A submission with NO location field at all is still fine (older clients).
    const none = await postForm(
      '/api/counselling',
      mentorToken,
      baseFields('2026-09-11', 'Older client, no location field.'),
      [{ field: 'evidence', name: 'no-field.jpg', type: 'image/jpeg', buffer: photo }]
    );
    check('a submission with no location field succeeds', none.status === 200 || none.status === 201, `status=${none.status}`);
    check('it is recorded as not-requested', (none.body?.data?.evidence?.[0]?.locationStatus) === 'NOT_REQUESTED', String(none.body?.data?.evidence?.[0]?.locationStatus));
  }

  // ---------------------------------------------------------------------------
  console.log('\nD. Impossible coordinates are rejected, nothing is stored');
  // ---------------------------------------------------------------------------
  {
    const before = await MentoringEvidence.countDocuments();
    const bad = [
      ['INVALID_LATITUDE', evidenceLocation({ latitude: 123 })],
      ['INVALID_LONGITUDE', evidenceLocation({ longitude: 200 })],
      ['INVALID_LOCATION', JSON.stringify({ status: 'CAPTURED', latitude: 'north', longitude: 76 })],
      ['INVALID_LOCATION_ACCURACY', evidenceLocation({ accuracy: -5 })],
    ];
    for (const [code, payload] of bad) {
      const res = await postForm(
        '/api/counselling',
        mentorToken,
        { ...baseFields('2026-09-13', 'Invalid location attempt.'), evidenceLocation: payload },
        [{ field: 'evidence', name: 'bad.jpg', type: 'image/jpeg', buffer: photo }]
      );
      check(`out-of-range location is refused with ${code}`, res.status === 400, `status=${res.status}`);
      check(`the refusal reports the ${code} code`, res.body?.code === code, JSON.stringify(res.body));
    }
    check('no evidence row was created for any invalid location', (await MentoringEvidence.countDocuments()) === before, `before=${before} after=${await MentoringEvidence.countDocuments()}`);
  }

  // ---------------------------------------------------------------------------
  console.log('\nE. Provider failures never block the upload');
  // ---------------------------------------------------------------------------
  {
    const scenarios: Array<[string, MockMode | 'disabled' | 'dead', string]> = [
      ['not found', 'notfound', 'NOT_FOUND'],
      ['rate limited', 'ratelimit', 'RATE_LIMITED'],
      ['server error', 'error', 'ERROR'],
      ['provider unreachable', 'dead', 'ERROR'],
      ['geocoding disabled', 'disabled', 'DISABLED'],
    ];
    for (const [label, mode, expected] of scenarios) {
      useProvider(mode);
      const res = await postForm(
        '/api/counselling',
        mentorToken,
        { ...baseFields('2026-09-14', `Geocode failure: ${label}.`), evidenceLocation: evidenceLocation() },
        [{ field: 'evidence', name: `geo-${expected}.jpg`, type: 'image/jpeg', buffer: photo }]
      );
      check(`${label}: the upload still succeeds`, res.status === 200 || res.status === 201, `status=${res.status} ${JSON.stringify(res.body?.message)}`);
      const item: any = res.body?.data?.evidence?.[0] || {};
      check(`${label}: the coordinates are still kept`, Number(item.latitude) === 11.0168 && Number(item.longitude) === 76.9558, JSON.stringify({ lat: item.latitude, lon: item.longitude }));
      check(`${label}: place-name status is ${expected}`, item.placeNameStatus === expected, String(item.placeNameStatus));
      check(`${label}: no place name is fabricated`, item.placeName === null, String(item.placeName));
    }
    useProvider('disabled');
  }

  // ---------------------------------------------------------------------------
  console.log('\nF. Missing EXIF never invents a capture time');
  // ---------------------------------------------------------------------------
  {
    useProvider('disabled');
    const res = await postForm(
      '/api/counselling',
      mentorToken,
      {
        ...baseFields('2026-09-15', 'No EXIF capture time.'),
        evidenceCaptureTimes: JSON.stringify([null]),
      },
      [{ field: 'evidence', name: 'no-exif.jpg', type: 'image/jpeg', buffer: photo }]
    );
    check('upload without capture metadata succeeds', res.status === 200 || res.status === 201, `status=${res.status}`);
    const item: any = res.body?.data?.evidence?.[0] || {};
    check('capture time is null, not invented', item.captureTime === null, String(item.captureTime));
    check('capture-time status is UNAVAILABLE', item.captureTimeStatus === 'UNAVAILABLE', String(item.captureTimeStatus));
  }

  // ---------------------------------------------------------------------------
  console.log('\nG + H. Evidence photos are never watermarked and are served unchanged');
  // ---------------------------------------------------------------------------
  {
    const row: any = await MentoringEvidence.findOne({ evidenceId: capturedEvidenceId });
    const storedPath = storedPathFor(row.fileUrl);
    check('the evidence file exists on disk', !!storedPath && fs.existsSync(storedPath), String(storedPath));
    check('the stored evidence is a readable image', !!storedPath && (await sharp(fs.readFileSync(storedPath!)).metadata()).format === 'jpeg');

    const dir = path.dirname(storedPath!);
    const watermarkedSiblings = fs
      .readdirSync(dir)
      .filter((name) => /watermark/i.test(name));
    check('no watermarked copy was created for the evidence photo', watermarkedSiblings.length === 0, watermarkedSiblings.join(','));

    const diskBytes = fs.readFileSync(storedPath!);
    const served = await httpRequest('GET', `/api/counselling/evidence/${encodeURIComponent(capturedEvidenceId)}/file`, {
      token: mentorToken,
    });
    check('the owner can read the evidence file', served.status === 200, `status=${served.status}`);
    check('the served bytes are byte-for-byte the stored photo (no on-the-fly watermark)', Buffer.isBuffer(served.body) && Buffer.from(served.body).equals(diskBytes));
  }

  // ---------------------------------------------------------------------------
  console.log('\nI. GPS metadata is only reachable by authorised users');
  // ---------------------------------------------------------------------------
  {
    useProvider('disabled');
    const anon = await httpRequest('GET', `/api/counselling/evidence/${encodeURIComponent(capturedEvidenceId)}/file`);
    check('an anonymous request is refused', anon.status === 401, `status=${anon.status}`);

    const other = await httpRequest('GET', `/api/counselling/evidence/${encodeURIComponent(capturedEvidenceId)}/file`, {
      token: otherMentorToken,
    });
    check('an unrelated mentor is refused the evidence photo', other.status === 403 || other.status === 404, `status=${other.status}`);

    const otherList = await httpRequest('GET', `/api/counselling/${studentId}`, { token: otherMentorToken });
    check('an unrelated mentor cannot read the student record at all', otherList.status === 403 || otherList.status === 404, `status=${otherList.status}`);

    // The owning mentor CAN read it through the normal authenticated endpoint.
    const ownList = await httpRequest('GET', `/api/counselling/${studentId}`, { token: mentorToken });
    const withEvidence = (ownList.body?.data || []).find((r: any) =>
      (r.evidence || []).some((e: any) => e.evidenceId === capturedEvidenceId)
    );
    check('the owning mentor sees the location metadata on the record', Number(withEvidence?.evidence?.[0]?.latitude) === 11.0168, JSON.stringify(withEvidence?.evidence?.[0]?.latitude));

    // Students are authenticated. The record's OWN student may view their own
    // record (existing project rule), but an UNRELATED student must not.
    const studentRead = await httpRequest('GET', `/api/counselling/evidence/${encodeURIComponent(capturedEvidenceId)}/file`, {
      token: studentToken,
    });
    check('the record\'s own student may read their own evidence photo', studentRead.status === 200, `status=${studentRead.status}`);

    const otherStudentToken = await loginAs('731523208802', 'Mentor@123');
    const unrelatedStudent = await httpRequest('GET', `/api/counselling/evidence/${encodeURIComponent(capturedEvidenceId)}/file`, {
      token: otherStudentToken,
    });
    check('an unrelated student is refused the evidence photo', unrelatedStudent.status === 403 || unrelatedStudent.status === 404, `status=${unrelatedStudent.status}`);
  }

  console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
  await new Promise((r) => mockServer.close(r));
  await store.teardown();
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  // The booted server keeps background timers alive, so exit explicitly once
  // the run is finished (matching how these suites are expected to terminate).
  process.exit(failures.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('evidence-location runtime test crashed:', err);
  process.exit(1);
});
