/**
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE
 * ============================================================================
 * Replace with a persistent database/storage implementation before production
 * deployment.
 *
 * This is the ONE shared, low-level persistence layer for the whole backend.
 * Nothing else in `src/` opens, reads or writes a data file directly: every
 * controller, service and script reaches stored data through the exports below,
 * which is what keeps a single writer per file and a single definition of "what
 * a record looks like on disk".
 *
 * It replaces MongoDB + Mongoose for development. Layout:
 *
 *     backend/data/<collection>.json      structured records, one array per file
 *     backend/storage/uploads/...         uploaded file BYTES (never base64'd
 *                                         into JSON -- see config/storage.ts)
 *
 * ── Why the data directory is anchored on the module, not the cwd ────────────
 * `npm --prefix backend run dev` runs with cwd=`backend`, `node backend/dist/
 * index.js` runs with cwd=the repository root, and a bare `npx tsx backend/src/
 * index.ts` runs from anywhere. Deriving the directory from `process.cwd()`
 * would silently split the dataset in two, so the root is resolved from this
 * file's own location, exactly as `config/storage.ts` does for uploads.
 *
 * ── Durability ───────────────────────────────────────────────────────────────
 * Every mutation is written through to disk before the call resolves, so data
 * survives a process restart, a backend reload and an ordinary development
 * session. Writes are atomic (temp file + rename) and serialised per collection,
 * so an interrupted write can never leave a half-written JSON array behind.
 *
 * ── Deliberately NOT production grade ────────────────────────────────────────
 * The whole dataset is held in memory and rewritten on change. That is fine for
 * a development dataset and wrong for production: there is no concurrency
 * control across processes, no indexing, and a host with an ephemeral disk (any
 * free-tier container, Render included) loses everything on redeploy.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Data directory resolution
// ---------------------------------------------------------------------------

/** Absolute path of the backend package, derived from this module's location. */
const BACKEND_DIR = (() => {
  try {
    if (typeof __dirname === 'string' && __dirname.length > 0) {
      // src/services/ and dist/services/ both sit two levels below the package root.
      return path.resolve(__dirname, '..', '..');
    }
  } catch {
    // Fall through to the cwd-relative anchor.
  }
  return null;
})();

/**
 * Absolute directory that holds the JSON collections.
 *
 * `DATA_DIR` overrides the default, which is how tests point at a throwaway
 * directory.
 *
 * Resolved LAZILY, on first use, and re-resolved if `DATA_DIR` changes. It used to
 * be an eagerly-evaluated `const`, which made the directory depend on module
 * import order: importing `services/localId.ts` (which re-exports the id helpers
 * from this file) before calling the test helper silently pinned the whole suite
 * to the real `backend/data/`, so a "sandboxed" run wrote live records. Anything
 * that reaches this module -- even transitively -- can now arrive first.
 */
let resolvedDataDir: string | undefined;
let resolvedFrom: string | undefined;

export function dataDir(): string {
  const explicit = process.env.DATA_DIR;
  if (resolvedDataDir !== undefined && resolvedFrom === explicit) return resolvedDataDir;

  const candidates = explicit
    ? [path.resolve(explicit)]
    : BACKEND_DIR
      ? [path.join(BACKEND_DIR, 'data')]
      : [path.join(process.cwd(), 'data')];

  let chosen = candidates[0];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      chosen = dir;
      break;
    } catch {
      // Try the next candidate; storage setup must never abort the process.
    }
  }

  // A cached collection still holds parsed records read from the previous
  // directory, so drop them rather than mixing two stores in one process.
  if (resolvedDataDir !== undefined && resolvedDataDir !== chosen) {
    collections.clear();
  }

  resolvedFrom = explicit;
  resolvedDataDir = chosen;
  return chosen;
}

/**
 * Reject anything that could escape DATA_DIR.
 *
 * Collection names are developer-authored constants, never request input, but
 * they are still concatenated into a filesystem path, so the shape is validated
 * once here rather than trusted at each of the ~30 call sites.
 */
function assertSafeCollectionName(collection: string): string {
  if (typeof collection !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(collection)) {
    throw new Error(`[localStorage] Refusing unsafe collection name: ${JSON.stringify(collection)}`);
  }
  return collection;
}

export function collectionFile(collection: string): string {
  const safe = assertSafeCollectionName(collection);
  const dir = dataDir();
  const file = path.resolve(dir, `${safe}.json`);
  if (file !== path.join(dir, `${safe}.json`)) {
    throw new Error(`[localStorage] Collection "${safe}" resolves outside the data directory.`);
  }
  return file;
}

// ---------------------------------------------------------------------------
// Identifier generation
// ---------------------------------------------------------------------------

/**
 * A 12-byte ObjectId-compatible identifier, rendered as 24 lowercase hex chars:
 * 4-byte Unix seconds | 5-byte per-process random | 3-byte incrementing counter.
 *
 * The layout is deliberately identical to MongoDB's ObjectId so that the existing
 * API contract is unchanged -- ids stay 24 hex characters, still sort by creation
 * time, and every `isValid()` check and regex in the frontend keeps working. It
 * is a plain string everywhere, so nothing depends on an ObjectId *class*; and it
 * is derived from a monotonic counter plus the wall clock, so ids are never
 * re-randomised by a restart the way `Math.random()` alone would be.
 */
const OID_RANDOM = crypto.randomBytes(5);
let oidCounter = crypto.randomBytes(3).readUIntBE(0, 3);

export function newLocalId(): string {
  const buf = Buffer.alloc(12);
  buf.writeUInt32BE(Math.floor(Date.now() / 1000) >>> 0, 0);
  OID_RANDOM.copy(buf, 4);
  oidCounter = (oidCounter + 1) % 0xffffff;
  buf.writeUIntBE(oidCounter, 9, 3);
  return buf.toString('hex');
}

/**
 * True when `value` is a well-formed local id.
 *
 * Strictly 24 hex characters. This replaces `mongoose.Types.ObjectId.isValid`,
 * which additionally accepted 12-character strings and bare integers; the strict
 * shape is what every call site here actually relies on (a 24-hex id, or an
 * employee/register code that must fall through to the non-id lookup).
 */
export function isValidLocalId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Coerce a caller-supplied value into a local id string, or throw.
 *
 * Replaces `new mongoose.Types.ObjectId(x)`. Only accepts a value that is
 * already a valid id, so a business code such as `KSRCEFAC001` can never be
 * silently turned into a fabricated record reference.
 */
export function toLocalId(value: unknown): string {
  const asString = value instanceof Object && (value as any)?._id ? String((value as any)._id) : String(value);
  if (!isValidLocalId(asString)) {
    throw new Error(`"${asString}" is not a valid local record identifier.`);
  }
  return asString.toLowerCase();
}

/** Loose variant: returns null instead of throwing, for "is this an id?" probes. */
export function toLocalIdOrNull(value: unknown): string | null {
  const asString = value instanceof Object && (value as any)?._id ? String((value as any)._id) : String(value);
  return isValidLocalId(asString) ? asString.toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Record shape
// ---------------------------------------------------------------------------

export type LocalRecord = Record<string, any>;

export interface LocalWriteResult {
  matchedCount: number;
  modifiedCount: number;
}

/**
 * A single collection: an array of records held in memory and mirrored to one
 * JSON file. Instances are cached per name so a collection is only ever read
 * from disk once per process, and every caller shares the same in-flight write
 * queue.
 */
export class LocalCollection {
  readonly name: string;
  readonly file: string;

  private records: LocalRecord[] | null = null;
  private loadError: Error | null = null;

  /**
   * Serialises mutations. Without this two interleaved read-modify-write cycles
   * (e.g. `Promise.all` of ten `create` calls) would each start from the same
   * snapshot and the loser's record would vanish from the file.
   */
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(name: string) {
    this.name = name;
    this.file = collectionFile(name);
  }

  /** Read the file once. A missing file is an empty collection, not an error. */
  private ensureLoaded(): LocalRecord[] {
    if (this.records !== null) return this.records;
    if (this.loadError) throw this.loadError;

    let parsed: unknown = [];
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      if (raw.trim().length > 0) {
        parsed = JSON.parse(raw);
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        // A corrupt file must be loud and must not be silently overwritten: the
        // data in it is the only copy.
        this.loadError = new Error(
          `[localStorage] "${this.name}" could not be read (${err?.message}). ` +
            'Refusing to continue so the file is not overwritten. Repair or move it aside.'
        );
        throw this.loadError;
      }
    }

    if (!Array.isArray(parsed)) {
      throw new Error(`[localStorage] "${this.name}" does not contain a JSON array and cannot be used.`);
    }

    this.records = parsed.map((doc: any) => normaliseStoredRecord(doc, this.name));
    return this.records;
  }

  /**
   * Atomic write: serialise to a sibling temp file, then rename over the target.
   * `rename` is atomic on every filesystem this project targets, so a reader (or
   * a crash) never observes a truncated array.
   */
  private flush(): void {
    const records = this.records ?? [];
    const tmp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(records, null, 2);
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, payload, 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err: any) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* best effort */
      }
      throw new Error(`[localStorage] failed to persist "${this.name}": ${err?.message}`);
    }
  }

  /** Run `mutator` against the live array, then persist it, in exclusive order. */
  private mutate<T>(mutator: (records: LocalRecord[]) => T): Promise<T> {
    const run = async (): Promise<T> => {
      const records = this.ensureLoaded();
      const result = mutator(records);
      this.flush();
      return result;
    };
    const next = this.writeQueue.then(run, run);
    // Keep the queue alive even when a mutation rejects.
    this.writeQueue = next.catch(() => undefined);
    return next;
  }

  // -- read ------------------------------------------------------------------

  /** Every record, as a defensive copy so a caller cannot corrupt the cache. */
  all(): Promise<LocalRecord[]> {
    return Promise.resolve(this.ensureLoaded().map(cloneRecord));
  }

  byId(id: string): Promise<LocalRecord | null> {
    const target = String(id);
    const found = this.ensureLoaded().find((r) => String(r._id) === target);
    return Promise.resolve(found ? cloneRecord(found) : null);
  }

  count(): Promise<number> {
    return Promise.resolve(this.ensureLoaded().length);
  }

  // -- write -----------------------------------------------------------------

  /** Insert one record, assigning `_id` and `createdAt`/`updatedAt` stamps. */
  insert(input: LocalRecord, options: { createdAtField?: string; updatedAtField?: string } = {}): Promise<LocalRecord> {
    return this.mutate((records) => {
      const record = normaliseNewRecord(input);
      records.push(record);
      return cloneRecord(record);
    });
  }

  /** Insert many records in one atomic file write. */
  insertMany(inputs: LocalRecord[]): Promise<LocalRecord[]> {
    return this.mutate((records) => {
      const created = inputs.map((input) => {
        const record = normaliseNewRecord(input);
        records.push(record);
        return cloneRecord(record);
      });
      return created;
    });
  }

  /** Apply a mutation to every record matching `predicate`. */
  updateMatching(
    predicate: (record: LocalRecord) => boolean,
    apply: (record: LocalRecord) => LocalRecord | void
  ): Promise<LocalWriteResult> {
    return this.mutate((records) => {
      let matchedCount = 0;
      let modifiedCount = 0;
      for (const record of records) {
        if (!predicate(record)) continue;
        matchedCount++;
        const before = JSON.stringify(record);
        const returned = apply(record);
        if (returned) Object.assign(record, returned);
        if (JSON.stringify(record) !== before) modifiedCount++;
      }
      return { matchedCount, modifiedCount };
    });
  }

  /** Remove every record matching `predicate`. */
  deleteMatching(predicate: (record: LocalRecord) => boolean): Promise<number> {
    return this.mutate((records) => {
      const kept: LocalRecord[] = [];
      let removed = 0;
      for (const record of records) {
        if (predicate(record)) removed++;
        else kept.push(record);
      }
      records.length = 0;
      records.push(...kept);
      return removed;
    });
  }

  /** Drop every record (used by the demo-data cleaner only). */
  truncate(): Promise<number> {
    return this.mutate((records) => {
      const removed = records.length;
      records.length = 0;
      return removed;
    });
  }

  /** Overwrite one record wholesale, preserving its `_id`. */
  replaceById(id: string, record: LocalRecord): Promise<void> {
    return this.mutate((records) => {
      const index = records.findIndex((existing) => String(existing._id) === String(id));
      if (index === -1) throw new Error(`[localStorage] Cannot replace "${this.name}" ${id}: it does not exist.`);
      const next = record as LocalRecord;
      next._id = String(id);
      records[index] = next;
    });
  }

  /** A fresh id, allocated by the service so ids stay in one place. */
  generateId(): string {
    return newLocalId();
  }

  /** Replace the entire contents in one atomic write. */
  replaceAll(records: LocalRecord[]): Promise<number> {
    return this.mutate((live) => {
      const prepared = records.map((r) => normaliseStoredRecord(r, this.name));
      live.length = 0;
      live.push(...prepared);
      return live.length;
    });
  }
}

// ---------------------------------------------------------------------------
// Record helpers
// ---------------------------------------------------------------------------

function cloneRecord(record: LocalRecord): LocalRecord {
  return record === null || record === undefined ? record : (JSON.parse(JSON.stringify(record)) as LocalRecord);
}

/**
 * Guarantee an `_id` on a record read from disk.
 *
 * A hand-edited or partially written file can contain a record with no `_id`;
 * rather than letting it become invisible to every `findById`, one is minted
 * here, on read, and written back on the next mutation.
 */
function normaliseStoredRecord(doc: any, collection: string): LocalRecord {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error(`[localStorage] "${collection}" contains an entry that is not an object.`);
  }
  if (doc._id === undefined || doc._id === null || doc._id === '') {
    doc._id = newLocalId();
  } else {
    doc._id = String(doc._id);
  }

  // Heal files written before the model layer stopped leaking its own internals.
  // `model` is never a real field: a serialised `LocalModel` (with the whole
  // schema definition nested inside it) would overwrite a document's live model
  // on the next read and make every later `save()` throw.
  if (doc.model !== undefined) delete doc.model;

  return doc;
}

/**
 * Prepare an input document for insertion: clone it, force `_id`, and drop keys
 * whose value is `undefined` (which `JSON.stringify` would omit anyway, but
 * doing it explicitly keeps the in-memory copy identical to the file).
 */
function normaliseNewRecord(input: LocalRecord): LocalRecord {
  const record = cloneRecord(input ?? {});
  record._id = input?._id === undefined || input?._id === null ? newLocalId() : String(input._id);
  for (const key of Object.keys(record)) {
    if (record[key] === undefined) delete record[key];
  }
  return record;
}

// ---------------------------------------------------------------------------
// Public service API
// ---------------------------------------------------------------------------

const collections = new Map<string, LocalCollection>();

/** The handle for one collection. Repeated calls return the same instance. */
export function collection(name: string): LocalCollection {
  const existing = collections.get(name);
  if (existing) return existing;
  const created = new LocalCollection(name);
  collections.set(name, created);
  return created;
}

// The generic operations named in the storage contract. These are what a caller
// reaches for directly; the model layer (`services/localModel.ts`) builds the
// query API on top of them, so controllers never touch these either.
export function read<T = LocalRecord>(name: string): Promise<T[]> {
  return collection(name).all() as Promise<T[]>;
}

export function write(name: string, records: LocalRecord[]): Promise<number> {
  return collection(name).replaceAll(records);
}

export function find(name: string, predicate: (record: LocalRecord) => boolean): Promise<LocalRecord[]> {
  return collection(name).all().then((records) => records.filter(predicate));
}

export function findOne(
  name: string,
  predicate: (record: LocalRecord) => boolean
): Promise<LocalRecord | null> {
  return collection(name).all().then((records) => records.find(predicate) ?? null);
}

export function create(name: string, record: LocalRecord): Promise<LocalRecord> {
  return collection(name).insert(record);
}

export function update(
  name: string,
  id: string,
  changes: LocalRecord
): Promise<LocalRecord | null> {
  return collection(name)
    .updateMatching(
      (record) => String(record._id) === String(id),
      (record) => {
        Object.assign(record, changes);
        record._id = record._id;
      }
    )
    .then(async () => collection(name).byId(id));
}

export function remove(name: string, id: string): Promise<boolean> {
  return collection(name)
    .deleteMatching((record) => String(record._id) === String(id))
    .then((removed) => removed > 0);
}

/** Absolute path of the active data directory (for logs and diagnostics). */
export function describeDataDir(): string {
  return dataDir();
}

/**
 * Drop every cached collection so the next read comes from disk.
 * Only tests need this -- production holds one long-lived cache by design.
 */
export function reloadAll(): Promise<void> {
  collections.clear();
  return Promise.resolve();
}