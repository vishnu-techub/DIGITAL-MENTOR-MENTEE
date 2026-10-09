/**
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE
 * ============================================================================
 * Replace with a persistent database/storage implementation before production
 * deployment.
 *
 * The single import point for record-identifier helpers.
 *
 * Every id in this application is a 24-character lowercase hex string: the same
 * shape MongoDB's ObjectId had, so the existing API contract, JWT claims,
 * frontend comparisons and `isValid` probes are all unchanged. Ids are generated
 * by `localStorage.service.ts` and are stable across restarts.
 *
 *   mongoose.Types.ObjectId.isValid(x)  ->  isValidId(x)
 *   new mongoose.Types.ObjectId(x)     ->  toLocalId(x)
 *   mongoose.Types.ObjectId (a type)    ->  LocalId
 */

export { isValidLocalId as isValidId, newLocalId, toLocalId, toLocalIdOrNull } from './localStorage.service.js';
export type { LocalId } from './localModel.js';