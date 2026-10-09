/**
 * TEMPORARY LOCAL FILE STORAGE -- TEST HARNESS
 * ============================================================================
 * Replace with a persistent database/storage implementation before production
 * deployment.
 *
 * Every full-stack suite used to start an in-process `mongod` on a spare drive
 * and point `MONGODB_URI` at it. The local store needs no server, only an empty
 * directory to write into, so the replacement is: pick a scratch directory,
 * export `DATA_DIR` and `UPLOADS_DIR`, wipe them, and the app under test boots
 * against real files.
 *
 * `DATA_DIR` and `UPLOADS_DIR` must be set BEFORE anything imports
 * `localStorage.service.ts` or `config/storage.ts`, because both resolve their
 * directories at import time. Every suite calls this helper as its first
 * statement for that reason.
 */
import path from 'node:path';
import fs from 'node:fs';

const SCRATCH_ROOT = process.env.TEST_SCRATCH_DIR || path.resolve(process.cwd(), '.test-data');

export interface LocalTestStore {
  dataDir: string;
  uploadsDir: string;
  /** Close the store and delete the scratch directories. */
  teardown(): Promise<void>;
}

/**
 * Point the local store and the upload writer at empty scratch directories.
 *
 * `UPLOADS_DIR` matters as much as `DATA_DIR`: the full-stack suites really do
 * upload PDFs and generated Student Details Forms, and without this they landed
 * in the live `backend/storage/uploads/`, growing it on every run.
 *
 * @param name  sub-directory name, e.g. `'runtime-verify'`
 */
export function useTemporaryLocalStore(name: string): LocalTestStore {
  const dataDir = path.join(SCRATCH_ROOT, name, 'data');
  const uploadsDir = path.join(SCRATCH_ROOT, name, 'uploads');

  for (const dir of [dataDir, uploadsDir]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
  }

  process.env.DATA_DIR = dataDir;
  process.env.UPLOADS_DIR = uploadsDir;

  return {
    dataDir,
    uploadsDir,
    async teardown() {
      const { disconnectDB } = await import('../../config/database.js');
      await disconnectDB();
      fs.rmSync(path.join(SCRATCH_ROOT, name), { recursive: true, force: true });
    },
  };
}