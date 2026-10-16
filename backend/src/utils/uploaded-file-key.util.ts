/**
 * The identity of a stored upload, for de-duplicating ONE physical certificate
 * that happens to be referenced by more than one record.
 *
 * A student's certificates legitimately live in two collections:
 *
 *   - `StudentDocument` — files uploaded through **Student Documents**, and
 *   - `StudentProgress` — certificates uploaded through **My Progress &
 *     Achievements**.
 *
 * Both features (the My Documents / My Progress merge, and the Record Book PDF
 * archive) must agree on when two rows describe the same file, otherwise one
 * feature can list a certificate twice while the other lists it once. This is
 * the single implementation of that rule; `normaliseFileKey` in the
 * student-progress module delegates here rather than keeping a second copy.
 *
 * Comparison is on the stable logical path only (`uploads/...`), so a base URL
 * prefix on one side can never make the same file look like two files.
 *
 * @param url A stored `fileUrl` / `certificateUrl`, e.g.
 *            `/uploads/progress/prog-1791999062825-454237-adobe.pdf`.
 * @returns The logical key, or `null` when the record carries no usable path
 *          (an empty string means "no file attached", which must never be
 *          treated as the identity of anything).
 */
export function normaliseStoredFileKey(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  // Compare only the stable logical path, ignoring any base URL prefix.
  const idx = trimmed.indexOf('uploads/');
  return idx >= 0 ? trimmed.slice(idx) : trimmed;
}
