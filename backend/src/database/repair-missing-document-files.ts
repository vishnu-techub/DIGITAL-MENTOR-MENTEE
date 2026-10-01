/**
 * Repair: re-attach lost document files to their existing StudentDocument records.
 *
 * ── The fault this exists for ───────────────────────────────────────────────────
 * Uploads are held on the local filesystem while the metadata that describes them
 * lives in MongoDB. When the upload directory is reset -- a redeploy onto a fresh
 * container, a changed working directory moving the `uploads` tree, an emptied
 * tmp fallback, or a stray cleanup script -- the StudentDocument records survive
 * while their BYTES do not. Student Documents still lists the certificate,
 * because that list is rendered from the database, so the upload looks successful.
 * The Official Record Book then cannot embed it, and the only honest thing it can
 * say is that it could not find the file.
 *
 * ── What this tool does, and deliberately does not do ───────────────────────────
 * It NEVER creates a StudentDocument record and never edits one. The existing
 * record (its fileName, fileUrl, fileType, fileSize, verification status, title,
 * category and event metadata) is the authoritative identity of the document and
 * is left completely untouched.
 *
 * A replacement file is only accepted when its identity is provable, never on a
 * filename guess alone:
 *   1. its name ends with the record's original fileName,
 *   2. its size is byte-for-byte the `fileSize` recorded when it was accepted,
 *   3. its magic bytes match the recorded `fileType`, and
 *   4. every matching file in every location hashes to the SAME value, so the
 *      correct one is never ambiguous.
 * A truncated or placeholder file of a different size (for example a stub whose
 * bytes are only a PDF header) can never satisfy (2), so this tool can never
 * substitute one for a real certificate.
 *
 * Accepted bytes are copied to the exact path the record already points at, so
 * every later read is an ordinary lookup through the shared storage resolver.
 *
 * ── Usage ──────────────────────────────────────────────────────────────────────
 *   npm --prefix backend run db:repair-files              # audit only, changes nothing
 *   npm --prefix backend run db:repair-files -- --apply   # copy verified bytes into place
 *   npm --prefix backend run db:repair-files -- --apply --from "A:\path\to\backup"
 *
 * `--from` adds an external directory (a backup, or a copy of the certificate the
 * user still holds) to the search. It is only ever READ from.
 */

import path from 'path';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/database.js';
import { StudentDocument } from '../models/index.js';
import {
  UPLOAD_ROOTS,
  UPLOADS_BASE,
  describeUploadRoots,
  locateStoredUpload,
  installStoredUpload,
} from '../config/storage.js';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const fromIndex = argv.indexOf('--from');
const backupDir = fromIndex >= 0 ? argv[fromIndex + 1] : process.env.UPLOADS_BACKUP_DIR || null;

interface Row {
  id: string;
  fileName: string;
  fileUrl: string;
  declared: string;
  recovered: string;
  registered: string;
  bytes: number;
  recordedBytes: number;
  action: string;
}

async function main() {
  if (!apply) {
    console.log('AUDIT ONLY - nothing will be written. Re-run with --apply to install verified files.');
  }
  console.log(`Active upload root : ${UPLOADS_BASE}`);
  console.log(`Roots searched     : ${describeUploadRoots()}`);
  if (backupDir) console.log(`External backup    : ${path.resolve(backupDir)}`);
  console.log('');

  await connectDB();

  // Only real uploads. The Student Details Form is this very dossier, so its
  // absence is expected and is not a fault to repair.
  const docs = await StudentDocument.find({
    isPrimary: { $ne: true },
    documentType: { $ne: 'student_details_form' },
  }).sort({ uploadedAt: -1 });

  const rows: Row[] = [];

  for (const doc of docs) {
    const meta = { fileName: doc.fileName, fileSize: doc.fileSize, fileType: doc.fileType };
    const located = locateStoredUpload(doc.fileUrl, meta, backupDir ? [path.resolve(backupDir)] : []);

    const row: Row = {
      id: doc._id.toString(),
      fileName: doc.fileName,
      fileUrl: doc.fileUrl,
      declared: located?.strategy || 'not-found',
      recovered: located?.path || '-',
      registered: '-',
      bytes: 0,
      recordedBytes: Number(doc.fileSize) || 0,
      action: '',
    };

    if (!located) {
      row.action = 'MISSING - no file with these exact bytes is available';
      rows.push(row);
      continue;
    }

    if (!located.recovered) {
      row.action = 'OK - already at its recorded path';
      rows.push(row);
      continue;
    }

    const installed = apply ? installStoredUpload(doc.fileUrl, located.path) : null;
    if (apply && !installed) {
      row.action = `FAILED to install from ${located.path}`;
    } else if (apply) {
      row.action = `REPAIRED -> ${installed} (found by ${located.strategy})`;
    } else {
      row.action = `REPAIRABLE - ${located.path} (found by ${located.strategy})`;
    }
    rows.push(row);
  }

  const w = (s: string, n: number) => String(s).padEnd(n).slice(0, n);
  for (const r of rows) {
    console.log(`${w(r.fileName, 34)} | ${w(r.action, 96)}`);
  }

  const ok = rows.filter((r) => r.action.startsWith('OK')).length;
  const repaired = rows.filter((r) => r.action.startsWith('REPAIRED')).length;
  const repairable = rows.filter((r) => r.action.startsWith('REPAIRABLE')).length;
  const failed = rows.filter((r) => r.action.startsWith('FAILED')).length;
  const missing = rows.filter((r) => r.action.startsWith('MISSING')).length;

  console.log('');
  console.log(
    `Total uploaded document records: ${rows.length} | resolvable now: ${ok} | ` +
      `repaired: ${repaired} | repairable: ${repairable} | failed: ${failed} | genuinely missing: ${missing}`
  );

  if (missing > 0) {
    console.log('');
    console.log(
      'For a genuinely missing file the bytes have to come from outside this host (a backup, or a copy the\n' +
        'student still holds). Re-run with --from <directory> once such a copy is available. The record is\n' +
        'left exactly as it is: a missing file is not a reason to invent a replacement or a new record.'
    );
  }
  if (!apply && (repairable > 0 || ok + missing < rows.length)) {
    console.log('');
    console.log('Re-run with --apply to install every verified file found.');
  }

  await disconnectDB();
  process.exit(0);
}

main().catch(async (err: any) => {
  console.error('repair-missing-document-files failed:', err?.stack || err?.message);
  try {
    await mongoose.disconnect();
  } catch {
    /* noop */
  }
  process.exit(1);
});
