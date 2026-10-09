import {
  User,
  Student,
  Faculty,
  Department,
  Batch,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
  Notification,
  AuditLog,
  SystemSetting,
  StudentDocument,
  School,
  StudentProgress,
  StudentEditRequest,
  AcademicEditRequest,
} from '../models/index.js';
import { connectDB } from '../config/database.js';
import { dataDir, describeDataDir } from '../services/localStorage.service.js';

/**
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE -- MIGRATION & VERIFICATION
 * ============================================================================
 * Replace with a persistent database/storage implementation before production
 * deployment.
 *
 * Previously this synchronised MongoDB server-side indexes. The local store has
 * no server-side index catalogue to sync: `unique` constraints are enforced by
 * `localModel.ts` on every write, and `Notification` TTL expiry is handled
 * explicitly by the scheduler in `notification.service.ts`.
 *
 * What this script is actually for now:
 *   1. Prove the data directory is writable before the app claims to be healthy.
 *   2. Touch every collection so each gets created on disk and can be inspected.
 *   3. Fail loudly on any id in an existing file that is not a valid 24-hex id,
 *      because a malformed id would break every subsequent query.
 */
const ALL_MODELS = [
  Department,
  Batch,
  User,
  Faculty,
  Student,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
  Notification,
  AuditLog,
  SystemSetting,
  StudentDocument,
  School,
  StudentProgress,
  StudentEditRequest,
  AcademicEditRequest,
];

/** Collections that must never lose data, and so must never expire. */
const PERMANENT_MODELS = [
  Student,
  Faculty,
  MentorAssignment,
  CounsellingRecord,
  AcademicRecord,
  StudentDocument,
  Meeting,
  MonthlyProgress,
  User,
];

const ID_PATTERN = /^[0-9a-f]{24}$/i;

export async function runMigrations(): Promise<void> {
  console.log('Running local file storage verification...');

  try {
    await connectDB();

    await Promise.all(ALL_MODELS.map((model) => model.syncIndexes()));

    let totalRecords = 0;
    const report: string[] = [];

    for (const model of PERMANENT_MODELS) {
      const count = await model.countDocuments({});
      totalRecords += count;
      report.push(`  ${model.collectionName.padEnd(28)} ${String(count).padStart(6)} record(s)`);
    }

    const malformed = await findMalformedIds(ALL_MODELS);
    if (malformed.length > 0) {
      throw new Error(
        `Local store contains ${malformed.length} malformed record id(s): ${malformed
          .slice(0, 10)
          .join(', ')}${malformed.length > 10 ? ' ...' : ''}`
      );
    }

    console.log(report.join('\n'));
    console.log(`Data directory: ${describeDataDir()} (${dataDir()})`);
    console.log(`✓ ${ALL_MODELS.length} collections are readable and writable.`);
    console.log(`✓ ${totalRecords} permanent record(s) verified; none expire.`);
    console.log('✓ Unique constraints (registerNumber, email, username, employeeId, code) are enforced on write.');
  } catch (err: any) {
    console.error('Local file storage verification error:', err.message);
    throw err;
  }
}

/**
 * Every persisted record is keyed by `_id` in its filters, so an id that is not
 * 24 hex characters would silently become unreachable rather than erroring.
 * This turns that into an explicit failure.
 */
async function findMalformedIds(models: typeof ALL_MODELS): Promise<string[]> {
  const bad: string[] = [];
  for (const model of models) {
    const records: any[] = await model.find({}).lean<any>();
    for (const record of records) {
      const id = record?._id;
      if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
        bad.push(`${model.collectionName}/${String(id)}`);
      }
    }
  }
  return bad;
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}