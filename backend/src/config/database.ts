import dotenv from 'dotenv';
import fs from 'fs';

import {
  dataDir,
  describeDataDir,
  isValidLocalId,
  newLocalId,
  toLocalId,
  toLocalIdOrNull,
} from '../services/localStorage.service.js';

dotenv.config();

/**
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE -- CONNECTION MODULE
 * ============================================================================
 * Replace with a persistent database/storage implementation before production
 * deployment.
 *
 * This module replaces `config/database.ts`'s former MongoDB Atlas connection.
 * Its public surface is deliberately unchanged -- `connectDB`, `isDBConnected`,
 * `getDatabaseName`, `disconnectDB`, `closeDB` -- so `index.ts`, the bootstrap
 * scripts and the tests keep calling the same functions, and `/api/health`
 * keeps reporting `database: 'connected'`.
 *
 * There is no network connection to establish: "connecting" means proving the
 * local data directory exists and accepts writes, then loading any data already
 * there. It fails fast and loudly if the directory cannot be written, which is
 * the one failure mode that would otherwise surface much later as a 500 on the
 * first write.
 *
 * MONGO / POSTGRES / PRISMA ARE ALL ABSENT. This is a development-only store.
 */

interface LocalStoreConnection {
  kind: 'local-file-store';
  dataDir: string;
  writable: boolean;
}

let connection: LocalStoreConnection | null = null;

/** Startup logging without exposing secrets, credentials or paths beyond the data dir. */
function envName(): string {
  return process.env.NODE_ENV || (process.env.RENDER ? 'production' : 'development');
}

/** Check if the local store is initialised and writable. */
export function isDBConnected(): boolean {
  return connection !== null && connection.writable;
}

/** Name reported by `/api/health` and the startup banner. */
export function getDatabaseName(): string {
  return `local-file-store (${connection ? 'connected' : 'disconnected'})`;
}

/**
 * Open the local store.
 *
 * 1. Resolves (and creates) `backend/data/`.
 * 2. Proves it is writable, refusing to start a process that cannot persist.
 * 3. Leaves every existing collection untouched, so data survives restarts.
 */
export async function connectDB(): Promise<LocalStoreConnection> {
  if (connection) return connection;

  const dir = dataDir();
  const writable = probeWritable(dir);
  if (!writable) {
    throw new Error(
      `Fatal: the local data directory "${dir}" is not writable. ` +
        'Local file storage cannot persist any record on this host. Set DATA_DIR to a writable directory and restart.'
    );
  }

  connection = { kind: 'local-file-store', dataDir: dir, writable: true };

  console.log('Local file storage ready (TEMPORARY - development only)');
  console.log(
    'WARNING: Temporary local file storage. Replace with a persistent database/storage ' +
      'implementation before production deployment.'
  );
  console.log(`Data directory: ${describeDataDir()}`);
  console.log(`Environment: ${envName()}`);
  console.log(
    'WARNING: data lives on this host\'s filesystem only. A redeploy, a rebuild or a ' +
      'change of host discards it unless DATA_DIR points at a persistent volume.'
  );

  return connection;
}

/** Release the store. Writes are already durable, so this only reports cleanly. */
export async function disconnectDB(): Promise<void> {
  if (!connection) return;
  connection = null;
  console.log('Local file storage closed cleanly.');
}

export const closeDB = disconnectDB;

function probeWritable(dir: string): boolean {
  const probe = `${dir}/.write-probe-${process.pid}`;
  try {
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Identifier helpers
// ---------------------------------------------------------------------------
// Re-exported from the storage service so a caller that already imports the
// connection module can reach the id helpers without a second import path.
// `mongoose.Types.ObjectId.isValid(x)` -> `isValidId(x)`
// `new mongoose.Types.ObjectId(x)`    -> `toLocalId(x)`

export { isValidLocalId as isValidId, newLocalId, toLocalId, toLocalIdOrNull };

// Graceful process shutdown.
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Closing local file storage...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Closing local file storage...');
  await disconnectDB();
  process.exit(0);
});

export default { connectDB, disconnectDB, closeDB, isDBConnected, getDatabaseName };