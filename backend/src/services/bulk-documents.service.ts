/**
 * BULK DOCUMENT ARCHIVE SERVICE
 * ---------------------------------------------------------------------------
 * Builds the ZIP archive used by the "Bulk Download Documents" action on the
 * Students Master and Faculty / Mentors management screens.
 *
 * Design notes:
 *   - `jszip` is used because it ships its own TypeScript types (no @types
 *     package needed) and is already present in the workspace dependency tree.
 *   - The archive is generated as a stream (the caller pipes it to the HTTP
 *     response) so a large archive is never copied twice in memory.
 *   - Every input is bounded by `BULK_DOCUMENT_LIMITS`: the caller refuses a
 *     request that exceeds the record or byte ceiling BEFORE reading files, so
 *     the amount of data held in memory can never be unbounded.
 *   - Folder segments and file names are sanitised so a stored file name can
 *     never escape its folder or inject another path (defence against path
 *     traversal / zip-slip).
 */
import JSZip from 'jszip';
import path from 'path';

export interface BulkArchiveEntry {
  /** Folder segments beneath the archive root, e.g. ['Students', 'Jane Doe_731...']. */
  folder: string[];
  /** Destination file name inside `folder` (caller may pre-uniquify). */
  fileName: string;
  /** File bytes to embed. The caller has already read and size-checked them. */
  data: Buffer;
}

export type BulkManifestStatus =
  | 'INCLUDED'
  | 'NO_DOCUMENTS'
  | 'FILE_MISSING'
  | 'NOT_FOUND'
  | 'NOT_AUTHORIZED'
  | 'DELETED';

export interface BulkManifestRow {
  recordType: string;
  identifier: string;
  name: string;
  documentTitle: string;
  fileName: string;
  status: BulkManifestStatus;
  note: string;
}

export const BULK_DOCUMENT_LIMITS = {
  /** Hard ceiling on records accepted by one bulk request. */
  maxRecords: 200,
  /** Hard ceiling on the total source bytes pulled into one archive. */
  maxTotalBytes: 250 * 1024 * 1024,
  /** Maximum length of any single sanitised path segment / file name. */
  maxNameLength: 100,
} as const;

/** Statuses the UI treats as "nothing to download for this record". */
export const BULK_EMPTY_STATUSES: ReadonlySet<BulkManifestStatus> = new Set([
  'NO_DOCUMENTS',
  'NOT_FOUND',
  'NOT_AUTHORIZED',
]);

/**
 * Sanitise one path segment (folder or file stem). Strips path separators,
 * control characters and characters Windows/ZIP archives reject, collapses
 * whitespace, drops leading dots (so no '.'/'..' segment survives) and caps the
 * length. Never returns an empty string.
 */
export function safeSegment(raw: unknown, fallback = 'Unnamed'): string {
  const input = raw === null || raw === undefined ? '' : String(raw);
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  const clipped = cleaned.slice(0, BULK_DOCUMENT_LIMITS.maxNameLength).trim();
  return clipped || fallback;
}

/**
 * Sanitise a file name while preserving its extension, so a PDF stays a `.pdf`.
 */
export function safeFileName(raw: unknown, fallback = 'document'): string {
  const input = raw === null || raw === undefined ? '' : String(raw);
  const ext = path.extname(input);
  const stem = ext ? input.slice(0, -ext.length) : input;
  const cleanStem = safeSegment(stem, fallback);
  const cleanExt = ext.replace(/[^A-Za-z0-9.]/g, '').slice(0, 12);
  return `${cleanStem}${cleanExt}`;
}

/**
 * Return a name that is unique within `used`, appending ` (2)`, ` (3)`… before
 * the extension when a collision would otherwise overwrite an earlier entry.
 * Registers the returned name in `used`.
 */
export function uniqueName(desired: string, used: Set<string>): string {
  const ext = path.extname(desired);
  const stem = ext ? desired.slice(0, -ext.length) : desired;
  let candidate = desired;
  let counter = 2;
  // Compare case-insensitively: Windows and default macOS filesystems are
  // case-insensitive, so `Report.pdf` and `report.pdf` would collide.
  const taken = (name: string) => {
    const lower = name.toLowerCase();
    for (const existing of used) {
      if (existing.toLowerCase() === lower) return true;
    }
    return false;
  };
  while (taken(candidate)) {
    candidate = `${stem} (${counter})${ext}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Build an in-memory archive. The caller streams it to the response. */
export function createArchive(entries: BulkArchiveEntry[]): JSZip {
  const zip = new JSZip();
  for (const entry of entries) {
    let node = zip;
    for (const segment of entry.folder) {
      node = node.folder(safeSegment(segment)) ?? node;
    }
    node.file(safeFileName(entry.fileName), entry.data);
  }
  return zip;
}

/** Quote one CSV field per RFC 4180 when it contains a delimiter, quote or newline. */
function csvField(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Render the manifest rows as CSV (with a header row). */
export function buildManifestCsv(rows: BulkManifestRow[]): string {
  const header = ['recordType', 'identifier', 'name', 'documentTitle', 'fileName', 'status', 'note'];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.recordType,
        row.identifier,
        row.name,
        row.documentTitle,
        row.fileName,
        row.status,
        row.note,
      ]
        .map(csvField)
        .join(',')
    );
  }
  // Trailing newline keeps the file well-formed for spreadsheet tools.
  return `${lines.join('\r\n')}\r\n`;
}

/** `Bulk_Documents_YYYY-MM-DD.zip`, using the server-local date. */
export function bulkArchiveFileName(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `Bulk_Documents_${year}-${month}-${day}.zip`;
}
