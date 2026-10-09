/**
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE -- MODEL LAYER
 * ============================================================================
 * Replace with a persistent database/storage implementation before production
 * deployment.
 *
 * This module is the query API that `src/models/*.model.ts` and every controller
 * talk to. It sits directly on `localStorage.service.ts` and keeps the exact
 * shape the application already used, so removing MongoDB did not require
 * redesigning a single business rule: `find().populate().lean()`,
 * `findOneAndUpdate(..., { upsert, new, setDefaultsOnInsert })`, schema defaults
 * and enums, timestamps, reference population and validation all behave as they
 * did, and all of it is persisted to `backend/data/<collection>.json`.
 *
 * It implements only the query features this codebase actually uses, and says so:
 *   filters      $eq $ne $gt $gte $lt $lte $in $nin $exists $regex $options
 *                $all $size $elemMatch $or $and $nor $not
 *   updates      $set $setOnInsert $unset $inc $push $addToSet $pull, and a plain
 *                object (treated as $set, as Mongoose does)
 *   pipeline     $match $group ($sum/$count/$avg/$min/$max/$push/$addToSet)
 *                $project $sort $limit $skip
 * Anything outside that set throws rather than silently returning wrong data.
 */

import { collection, type LocalRecord } from './localStorage.service.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Thrown for a schema violation. Controllers already branch on
 * `err.name === 'ValidationError'` and read `err.errors[field].message`, so both
 * the name and the per-field shape are part of the contract.
 */
export class ValidationError extends Error {
  name = 'ValidationError';
  errors: Record<string, { message: string }> = {};

  constructor(errors: Record<string, { message: string }>) {
    super(Object.values(errors).map((e) => e.message).join('. '));
    this.errors = errors;
  }
}

export class LocalQueryError extends Error {
  name = 'LocalQueryError';
}

// ---------------------------------------------------------------------------
// Path access
// ---------------------------------------------------------------------------

/**
 * Every value a dotted path resolves to for one record, flattening arrays the
 * way Mongo does. `{ 'school.tenthSchoolId': x }` and `{ categories: x }` are
 * both served by this, and both match when ANY of the returned values matches.
 */
export function collectPathValues(doc: any, path: string): any[] {
  let current: any[] = [doc];

  for (const part of path.split('.')) {
    const next: any[] = [];
    for (const node of current) {
      if (node === null || node === undefined) continue;
      if (Array.isArray(node)) {
        for (const element of node) {
          if (element !== null && element !== undefined) next.push((element as any)[part]);
        }
      } else if (typeof node === 'object') {
        next.push(node[part]);
      }
    }
    current = next.filter((v) => v !== undefined);
  }

  return current;
}

export function getPath(doc: any, path: string): any {
  const values = collectPathValues(doc, path);
  return values.length === 0 ? undefined : values[0];
}

export function hasPath(doc: any, path: string): boolean {
  return collectPathValues(doc, path).length > 0;
}

function setPath(doc: any, path: string, value: any): void {
  const parts = path.split('.');
  let cursor = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (!isPlainObject(cursor[key]) && !Array.isArray(cursor[key])) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function unsetPath(doc: any, path: string): void {
  const parts = path.split('.');
  let cursor: any = doc;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isPlainObject(cursor[parts[i]])) return;
    cursor = cursor[parts[i]];
  }
  delete cursor[parts[parts.length - 1]];
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

// ---------------------------------------------------------------------------
// Coercion and comparison
// ---------------------------------------------------------------------------

/** Ids are strings on disk; a populated reference is an object. Unwrap to a string. */
function asReference(value: any): any {
  if (isPlainObject(value) && value._id !== undefined) return String(value._id);
  return value;
}

function asDate(value: any): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function numeric(value: any): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function looseEquals(a: any, b: any): boolean {
  const left = asReference(a);
  const right = asReference(b);
  if (left === right) return true;
  if (left === null || left === undefined) return right === null || right === undefined;
  if (right === null || right === undefined) return false;

  if (typeof left === 'boolean' || typeof right === 'boolean') {
    if (typeof left === 'boolean' && typeof right === 'string') return String(left) === right.toLowerCase();
    if (typeof right === 'boolean' && typeof left === 'string') return String(right) === left.toLowerCase();
  }

  const dl = asDate(left);
  const dr = asDate(right);
  if (dl && dr) return dl.getTime() === dr.getTime();

  if (typeof left === 'number' || typeof right === 'number') {
    const nl = numeric(left);
    const nr = numeric(right);
    if (nl !== null && nr !== null) return nl === nr;
  }

  return false;
}

function compareValues(a: any, b: any): number {
  const left = asReference(a);
  const right = asReference(b);

  const dl = asDate(left);
  const dr = asDate(right);
  if (dl && dr) {
    const diff = dl.getTime() - dr.getTime();
    return diff === 0 ? 0 : diff < 0 ? -1 : 1;
  }

  const nl = numeric(left);
  const nr = numeric(right);
  if (nl !== null && nr !== null) return nl === nr ? 0 : nl < nr ? -1 : 1;

  const sl = String(left);
  const sr = String(right);
  return sl === sr ? 0 : sl < sr ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Filter matching
// ---------------------------------------------------------------------------

const OPERATORS = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$exists',
  '$regex', '$options', '$all', '$size', '$elemMatch', '$not', '$type',
]);

function isOperatorObject(condition: any): boolean {
  return (
    isPlainObject(condition) &&
    Object.keys(condition).length > 0 &&
    Object.keys(condition).every((k) => k.startsWith('$'))
  );
}

function matchesRegex(value: any, pattern: any, options?: string): boolean {
  if (value === null || value === undefined) return false;
  let regex: RegExp;
  if (pattern instanceof RegExp) {
    const extra = typeof options === 'string' ? options : '';
    const flags = extra && !extra.split('').some((f) => pattern.flags.includes(f)) ? pattern.flags + extra : pattern.flags;
    regex = new RegExp(pattern.source, flags);
  } else {
    regex = new RegExp(String(pattern), typeof options === 'string' ? options : '');
  }
  return regex.test(String(value));
}

function matchesCondition(values: any[], condition: any): boolean {
  if (condition instanceof RegExp) return values.some((v) => matchesRegex(v, condition));

  if (isOperatorObject(condition)) {
    for (const [operator, operand] of Object.entries(condition)) {
      if (!OPERATORS.has(operator)) {
        throw new LocalQueryError(`[localModel] Unsupported query operator "${operator}".`);
      }
      if (!matchesOperator(values, operator, operand, condition)) return false;
    }
    return true;
  }

  // A plain value matches when any of the field's values matches, which is what
  // makes `{ categories: 'Academic Development' }` work on an array field.
  return values.some((v) => looseEquals(v, condition));
}

function matchesOperator(values: any[], operator: string, operand: any, whole: any): boolean {
  switch (operator) {
    case '$eq':
      return values.some((v) => looseEquals(v, operand));
    case '$ne':
      // Mongo's `$ne` also matches a document where the field is absent.
      return values.length === 0 ? true : !values.some((v) => looseEquals(v, operand));
    case '$gt':
      return values.some((v) => compareValues(v, operand) > 0);
    case '$gte':
      return values.some((v) => compareValues(v, operand) >= 0);
    case '$lt':
      return values.some((v) => compareValues(v, operand) < 0);
    case '$lte':
      return values.some((v) => compareValues(v, operand) <= 0);
    case '$in':
      return Array.isArray(operand) && operand.some((o) => values.some((v) => looseEquals(v, o)));
    case '$nin':
      return Array.isArray(operand) && !operand.some((o) => values.some((v) => looseEquals(v, o)));
    case '$exists': {
      const present = values.some((v) => v !== undefined && v !== null);
      return operand ? present : !present;
    }
    case '$regex':
      return values.some((v) => matchesRegex(v, operand, (whole as any).$options));
    case '$options':
      return true; // consumed by $regex
    case '$all':
      return (
        Array.isArray(operand) &&
        operand.every((o) => values.some((v) => (Array.isArray(v) ? v.some((e) => looseEquals(e, o)) : looseEquals(v, o))))
      );
    case '$size':
      return values.some((v) => Array.isArray(v) && v.length === Number(operand));
    case '$elemMatch':
      return values.some((v) => Array.isArray(v) && v.some((element) => matchesFilter(element, operand)));
    case '$not':
      if (operand instanceof RegExp) return !values.some((v) => matchesRegex(v, operand));
      return !matchesCondition(values, operand);
    case '$type':
      return true; // type shape is enforced on write instead
    default:
      return false;
  }
}

const LOGICAL = new Set(['$or', '$and', '$nor', '$not']);

/** True when the whole filter matches one stored record. */
export function matchesFilter(doc: LocalRecord, filter: any): boolean {
  if (!filter || typeof filter !== 'object') return true;

  for (const [key, condition] of Object.entries(filter)) {
    if (LOGICAL.has(key)) {
      if (key === '$or') {
        if (!(condition as any[]).some((sub) => matchesFilter(doc, sub))) return false;
      } else if (key === '$and') {
        if (!(condition as any[]).every((sub) => matchesFilter(doc, sub))) return false;
      } else if (key === '$nor') {
        if ((condition as any[]).some((sub) => matchesFilter(doc, sub))) return false;
      } else if (matchesFilter(doc, condition)) {
        return false;
      }
      continue;
    }

    if (!matchesCondition(collectPathValues(doc, key), condition)) return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Update application
// ---------------------------------------------------------------------------

type UpdateBucket = 'set' | 'setOnInsert' | 'unset' | 'inc' | 'push' | 'addToSet' | 'pull';

export interface ParsedUpdate {
  set: Record<string, any>;
  setOnInsert: Record<string, any>;
  unset: Record<string, any>;
  inc: Record<string, any>;
  push: Record<string, any>;
  addToSet: Record<string, any>;
  pull: Record<string, any>;
}

const UPDATE_OPERATORS = new Set(['$set', '$setOnInsert', '$unset', '$inc', '$push', '$addToSet', '$pull']);

/** Split an update into operator buckets; a plain object becomes `$set`. */
export function parseUpdate(update: any): ParsedUpdate {
  const result: ParsedUpdate = {
    set: {}, setOnInsert: {}, unset: {}, inc: {}, push: {}, addToSet: {}, pull: {},
  };

  if (!isPlainObject(update)) return result;

  const keys = Object.keys(update);
  if (keys.length === 0) return result;

  const usesOperators = keys.every((k) => k.startsWith('$'));
  if (!usesOperators) {
    for (const [key, value] of Object.entries(update)) {
      if (key === '_id') continue; // immutable
      if (value === undefined) continue; // Mongoose drops undefined from a $set
      result.set[key] = value;
    }
    return result;
  }

  for (const operator of keys) {
    if (!UPDATE_OPERATORS.has(operator)) {
      throw new LocalQueryError(`[localModel] Unsupported update operator "${operator}".`);
    }
    const operand = (update as any)[operator];
    if (!isPlainObject(operand)) continue;
    Object.assign(result[operator.slice(1) as UpdateBucket], operand);
  }

  return result;
}

function applyUpdate(record: LocalRecord, parsed: ParsedUpdate, isInsert: boolean, model: LocalModel<any>): LocalRecord {
  if (isInsert) {
    for (const [path, value] of Object.entries(parsed.setOnInsert)) {
      if (value !== undefined) setPath(record, path, model.castPathValue(path, value));
    }
  }

  for (const [path, value] of Object.entries(parsed.set)) {
    if (value === undefined) continue; // mirrors Mongoose dropping undefined
    setPath(record, path, model.castPathValue(path, value));
  }

  for (const path of Object.keys(parsed.unset)) unsetPath(record, path);

  for (const [path, delta] of Object.entries(parsed.inc)) {
    setPath(record, path, (numeric(getPath(record, path)) ?? 0) + Number(delta));
  }

  for (const [path, value] of Object.entries(parsed.push)) {
    const current = getPath(record, path);
    const list = Array.isArray(current) ? current : [];
    setPath(record, path, list.concat(eachOperand(value)));
  }

  for (const [path, value] of Object.entries(parsed.addToSet)) {
    const current = getPath(record, path);
    const list = Array.isArray(current) ? current : [];
    for (const addition of eachOperand(value)) {
      if (!list.some((existing) => looseEquals(existing, addition))) list.push(addition);
    }
    setPath(record, path, list);
  }

  for (const [path, value] of Object.entries(parsed.pull)) {
    const current = getPath(record, path);
    if (Array.isArray(current)) {
      setPath(record, path, current.filter((element) => !matchesCondition([element], value)));
    }
  }

  return record;
}

/**
 * `$push: { items: { $each: [1, 2] } }` and the bare `$push: { items: x }` form
 * both appear in this codebase, so unwrap `$each` when present.
 */
function eachOperand(value: any): any[] {
  return isPlainObject(value) && Array.isArray(value.$each) ? value.$each : [value];
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export interface ProjectionSpec {
  include: Set<string> | null;
  exclude: Set<string>;
}

/**
 * Mongoose projection semantics: naming any field INCLUDES it (and `_id`);
 * a projection made only of `-field` tokens EXCLUDES.
 */
export function parseProjection(projection: any): ProjectionSpec {
  const include = new Set<string>();
  const exclude = new Set<string>();

  const add = (token: string): void => {
    if (token.startsWith('-')) exclude.add(token.slice(1));
    else include.add(token);
  };

  if (typeof projection === 'string') {
    projection.split(/\s+/).filter(Boolean).forEach(add);
  } else if (Array.isArray(projection)) {
    projection.forEach((token) => add(String(token)));
  } else if (isPlainObject(projection)) {
    for (const [key, value] of Object.entries(projection)) {
      const wanted = value === 1 || value === true;
      if (key === '_id' && !wanted) {
        exclude.add('_id');
        continue;
      }
      if (wanted) include.add(key);
      else exclude.add(key);
    }
  } else {
    return { include: null, exclude: new Set() };
  }

  // A `-_id` alongside inclusions must not disable inclusion mode.
  if (include.size === 0) return { include: null, exclude };
  return { include, exclude };
}

function projectRecord(record: LocalRecord, spec: ProjectionSpec): LocalRecord {
  if (!spec.include && spec.exclude.size === 0) return cloneRecord(record);
  return projectRecordInto(cloneRecord(record), spec);
}

/**
 * Project a record in place, deleting the excluded paths.
 *
 * Every caller passes a clone: the records in `LocalCollection` are the live
 * cache shared by the whole process, and an exclusion applied to the cached
 * object would silently drop that field for every later reader.
 */
function projectRecordInto(record: LocalRecord, spec: ProjectionSpec): LocalRecord {
  if (spec.include) {
    const out: LocalRecord = {};
    if (!spec.exclude.has('_id')) out._id = record._id;
    for (const path of spec.include) {
      if (hasPath(record, path)) setPath(out, path, getPath(record, path));
    }
    for (const key of Object.keys(record)) delete record[key];
    Object.assign(record, out);
    return record;
  }

  if (spec.exclude.size > 0) {
    for (const path of spec.exclude) unsetPath(record, path);
  }
  return record;
}

/** Deep copy of one stored record. Records are plain JSON data by construction. */
function cloneRecord(record: LocalRecord): LocalRecord {
  return JSON.parse(JSON.stringify(record)) as LocalRecord;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortSpec = Array<[string, 1 | -1]>;

export function parseSort(sort: any): SortSpec {
  if (!sort) return [];
  const tokens = typeof sort === 'string' ? sort.split(/\s+/).filter(Boolean) : Object.keys(sort);
  if (typeof sort === 'string') {
    return tokens.map((token) => [token.startsWith('-') ? token.slice(1) : token, token.startsWith('-') ? -1 : 1] as [string, 1 | -1]);
  }
  return Object.entries(sort).map(([key, value]) => [key, Number(value) < 0 ? -1 : 1] as [string, 1 | -1]);
}

function sortRecords(records: LocalRecord[], spec: SortSpec): LocalRecord[] {
  if (spec.length === 0) return records;
  return records.slice().sort((a, b) => {
    for (const [path, direction] of spec) {
      const result = compareValues(getPath(a, path), getPath(b, path));
      if (result !== 0) return result * direction;
    }
    return 0;
  });
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function evalFieldExpression(expression: any, doc: LocalRecord): any {
  return typeof expression === 'string' && expression.startsWith('$') ? getPath(doc, expression.slice(1)) : expression;
}

function normaliseAccumulator(accumulator: any): { operator: string; operand: any } {
  if (isPlainObject(accumulator)) {
    const [operator] = Object.keys(accumulator);
    return { operator, operand: (accumulator as any)[operator] };
  }
  return { operator: '$sum', operand: accumulator };
}

function groupStage(records: LocalRecord[], spec: Record<string, any>): LocalRecord[] {
  const groups = new Map<string, { _id: any; docs: LocalRecord[] }>();

  for (const doc of records) {
    const id = evalFieldExpression(spec._id, doc);
    const key = JSON.stringify(id ?? null);
    const existing = groups.get(key);
    if (existing) existing.docs.push(doc);
    else groups.set(key, { _id: id ?? null, docs: [doc] });
  }

  return [...groups.values()].map((group) => {
    const out: LocalRecord = { _id: group._id };
    for (const [field, accumulator] of Object.entries(spec)) {
      if (field === '_id') continue;
      const { operator, operand } = normaliseAccumulator(accumulator);
      const values = group.docs.map((doc) => evalFieldExpression(operand, doc));

      switch (operator) {
        case '$sum': {
          const countEach = operand === 1;
          out[field] = values.reduce((total, value) => {
            const n = numeric(value);
            return total + (n === null ? (countEach ? 1 : 0) : n);
          }, 0);
          break;
        }
        case '$count':
          out[field] = group.docs.length;
          break;
        case '$avg': {
          const nums = values.map(numeric).filter((n): n is number => n !== null);
          out[field] = nums.length === 0 ? null : nums.reduce((a, b) => a + b, 0) / nums.length;
          break;
        }
        case '$min':
        case '$max': {
          const present = values.filter((v) => v !== undefined && v !== null);
          if (present.length === 0) out[field] = null;
          else {
            out[field] = present.reduce((a, b) =>
              operator === '$min'
                ? compareValues(a, b) <= 0 ? a : b
                : compareValues(a, b) >= 0 ? a : b
            );
          }
          break;
        }
        case '$push':
          out[field] = values;
          break;
        case '$addToSet': {
          const seen = new Map<string, any>();
          for (const value of values) seen.set(JSON.stringify(value ?? null), value);
          out[field] = [...seen.values()];
          break;
        }
        default:
          throw new LocalQueryError(`[localModel] Unsupported group accumulator "${operator}".`);
      }
    }
    return out;
  });
}

function projectStage(doc: LocalRecord, spec: Record<string, any>): LocalRecord {
  const out: LocalRecord = {};
  for (const [field, expression] of Object.entries(spec)) {
    if (field === '_id') {
      if (expression !== 0 && expression !== false) out._id = doc._id;
      continue;
    }
    if (expression === 0 || expression === false) continue;
    const value = evalFieldExpression(expression, doc);
    if (value !== undefined) out[field] = value;
  }
  return out;
}

function runPipeline(records: LocalRecord[], pipeline: any[]): LocalRecord[] {
  let current = records;

  for (const stage of pipeline ?? []) {
    const operator = Object.keys(stage ?? {})[0];
    const spec = (stage as any)[operator];

    switch (operator) {
      case '$match':
        current = current.filter((doc) => matchesFilter(doc, spec));
        break;
      case '$group':
        current = groupStage(current, spec);
        break;
      case '$project':
        current = current.map((doc) => projectStage(doc, spec));
        break;
      case '$sort':
        current = sortRecords(current, parseSort(spec));
        break;
      case '$limit':
        current = current.slice(0, Number(spec));
        break;
      case '$skip':
        current = current.slice(Number(spec));
        break;
      case '$count':
        current = [{ [String(spec)]: current.length }];
        break;
      default:
        throw new LocalQueryError(`[localModel] Unsupported aggregation stage "${operator}".`);
    }
  }

  return current;
}

// ---------------------------------------------------------------------------
// Populate
// ---------------------------------------------------------------------------

export interface PopulateSpec {
  path: string;
  select?: string | string[];
  /** Mongoose's `.populate(path, ModelName)` overload. The schema `ref` wins. */
  model?: string;
  populate?: PopulateSpec[];
}

function normalisePopulateSpec(input: Record<string, any>): PopulateSpec {
  if (typeof input.path === 'string') {
    return {
      path: input.path,
      select: typeof input.select === 'string' ? input.select : undefined,
      populate: input.populate ? normalisePopulate(input.populate) : undefined,
    };
  }
  const [path, select] = Object.entries(input)[0] ?? [];
  return { path: String(path), select: typeof select === 'string' ? select : undefined };
}

export function normalisePopulate(input: string | PopulateSpec | any): PopulateSpec[] {
  if (typeof input === 'string') {
    return input.split(/\s+/).filter(Boolean).map((path) => ({ path }));
  }
  if (Array.isArray(input)) return input.flatMap((entry) => normalisePopulate(entry));
  if (isPlainObject(input)) return [normalisePopulateSpec(input)];
  throw new LocalQueryError('[localModel] populate() expects a path string, a spec object, or an array of specs.');
}

/** Pre-fetched `collectionName -> (id -> record)` snapshots for a populate run. */
type PopulateData = Map<string, Map<string, LocalRecord>>;

/**
 * Replace reference ids on one record with the referenced documents.
 *
 * A reference with no matching record becomes `null`, exactly as Mongoose's
 * `populate()` does, so callers guarding with `?.` keep working.
 */
function applyPopulate(record: LocalRecord, specs: PopulateSpec[], model: LocalModel<any>, data: PopulateData): LocalRecord {
  for (const spec of specs) {
    const reference = model.findRef(spec.path);
    if (!reference) continue;

    const parts = spec.path.split('.');
    const fieldName = parts[parts.length - 1];
    const container = parts.length > 1 ? getPath(record, parts.slice(0, -1).join('.')) : record;
    if (!isPlainObject(container)) continue;

    const current = container[fieldName];
    if (current === undefined || current === null) continue;
    // Already populated: never resolve a populated document again.
    if (!Array.isArray(current) && isPlainObject(current) && current._id !== undefined) continue;

    const byId = data.get(reference.collectionName) ?? new Map<string, LocalRecord>();
    const projection = parseProjection(spec.select);

    const shape = (raw: any): LocalRecord | null => {
      const id = asReference(raw);
      if (id === null || id === undefined) return null;
      const target = byId.get(String(id));
      if (!target) return null;
      // Clone before doing anything to it. The pre-fetched map is shared by every
      // document in this result set, so populating in place would replace one
      // document's ids with another document's populated objects.
      let shaped = cloneRecord(target);
      if (projection.include || projection.exclude.size > 0) shaped = projectRecord(shaped, projection);
      if (spec.populate?.length) shaped = applyPopulate(shaped, spec.populate, reference, data);
      return shaped;
    };

    if (Array.isArray(current)) {
      container[fieldName] = current.map(shape);
    } else {
      container[fieldName] = shape(current);
    }
  }

  return record;
}

/**
 * Load every collection a populate tree will need, in one pass.
 *
 * Each nesting level resolves its own refs against the model it populated FROM,
 * not against the model the query started on. `.populate({ path: 'mentor',
 * populate: { path: 'user' } })` looks up `mentor` on `MentorAssignment`, then
 * looks up `user` on `Faculty`. Resolving every path against the root model made
 * the nested `user` ref unresolvable, the mentor came back without a user, and
 * every reminder silently skipped.
 */
async function loadPopulateData(specs: PopulateSpec[], model: LocalModel<any>): Promise<PopulateData> {
  const data: PopulateData = new Map();
  const pending: Array<{ specs: PopulateSpec[]; owner: LocalModel<any> }> = [{ specs, owner: model }];

  while (pending.length) {
    const { specs: level, owner } = pending.shift()!;
    for (const spec of level) {
      const reference = owner.findRef(spec.path);
      if (!reference) continue;

      const name = reference.collectionName;
      if (!data.has(name)) {
        const records = await collection(name).all();
        data.set(name, new Map(records.map((record) => [String(record._id), record])));
      }

      if (spec.populate?.length) pending.push({ specs: spec.populate, owner: reference });
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Filter = Record<string, any>;

/**
 * A stored record identifier: 24 lowercase hex characters, generated and owned
 * by `localStorage.service.ts`. It is a plain string, so nothing depends on an
 * ObjectId class, and it keeps the exact shape every existing `isValid` check,
 * regex and frontend comparison already assumes.
 */
export type LocalId = string;

export interface LocalQueryResult {
  acknowledged: true;
  matchedCount: number;
  modifiedCount: number;
  deletedCount: number;
  upsertedCount: number;
}

/**
 * Replaces Mongoose's `Document`. The index signature matches the codebase's
 * existing free-form access patterns (`doc.someField` on hydrated records); the
 * declared members are the real contract.
 */
export interface LocalDocument {
  [key: string]: any;
  _id: LocalId;
  id: LocalId;
  isNew: boolean;
  errors?: Record<string, { message: string }>;
  save(): Promise<this>;
  toObject(): LocalRecord;
  toJSON(): LocalRecord;
  deleteOne(): Promise<{ deletedCount: number }>;
  updateOne(update: any, options?: any): Promise<LocalQueryResult>;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

/**
 * Instance properties that belong to the wrapper, never to the stored record.
 *
 * `model` must be listed here: without it `toObject()` serialised the entire
 * `LocalModel` -- modelName, collection name and the complete schema definition --
 * into the collection file on the first `save()` of a hydrated document, and the
 * next read poisoned the document with a plain object in place of its model.
 */
const NON_DATA_KEYS = new Set(['id', 'isNew', 'errors', 'model']);

class LocalDoc implements LocalDocument {
  [key: string]: any;
  _id: LocalId;
  id!: LocalId;
  isNew: boolean;

  private readonly model: LocalModel<any>;

  constructor(model: LocalModel<any>, data: LocalRecord, isNew: boolean) {
    this.model = model;
    this.isNew = isNew;

    // Copy the stored fields only. A file written by an older build may still
    // carry a serialised `model` object; letting `Object.assign` land on `this`
    // would replace the live model and break every later `save()`.
    const fields: LocalRecord = {};
    for (const key of Object.keys(data)) {
      if (NON_DATA_KEYS.has(key)) continue;
      fields[key] = data[key];
    }
    Object.assign(this, fields);
    this._id = String(data._id);
  }

  private get store() {
    return collection(this.model.collectionName);
  }

  toObject(): LocalRecord {
    const plain: LocalRecord = {};
    for (const key of Object.keys(this)) {
      if (NON_DATA_KEYS.has(key)) continue;
      plain[key] = (this as any)[key];
    }
    plain._id = this._id;
    return plain;
  }

  toJSON(): LocalRecord {
    return this.toObject();
  }

  async save(): Promise<this> {
    // Mongoose calls `pre('save')` hooks with the document as `this`. Bind it
    // here, and pass the document as the first argument too, so both the
    // `function () { this.x }` style already used by the models and a
    // `function (doc) { doc.x }` style both work.
    for (const hook of this.model.schema.preSaveHooks) hook.call(this as any, this as any);

    const payload = this.toObject();
    // Assigning `undefined` is how this codebase clears an optional reference
    // (`doc.rejectedBy = undefined`); that must REMOVE the key, not store null.
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }

    const prepared = this.model.prepare(payload, this.isNew);

    if (this.isNew) {
      await this.model.validate(prepared, null);
      const created = await this.store.insert(prepared);
      this.adopt(created, false);
      return this;
    }

    const existing = await this.store.byId(this._id);
    if (!existing) {
      throw new Error(`[localModel] ${this.model.modelName} ${this._id} no longer exists and cannot be saved.`);
    }

    const createdAtField = this.model.createdAtField;
    const next: LocalRecord = { ...existing, ...prepared, _id: this._id };
    if (createdAtField) next[createdAtField] = existing[createdAtField] ?? prepared[createdAtField];
    await this.model.validate(next, this._id);
    await this.store.replaceById(this._id, next);
    this.adopt(next, false);
    return this;
  }

  async deleteOne(): Promise<{ deletedCount: number }> {
    const deletedCount = await this.store.deleteMatching((record) => String(record._id) === this._id);
    if (deletedCount > 0) this.isNew = true;
    return { deletedCount };
  }

  async updateOne(update: any, options?: any): Promise<LocalQueryResult> {
    return this.model.updateOne({ _id: this._id }, update);
  }

  private adopt(data: LocalRecord, isNew: boolean): void {
    for (const key of Object.keys(this)) {
      if (NON_DATA_KEYS.has(key)) continue;
      delete (this as any)[key];
    }
    const fields: LocalRecord = {};
    for (const key of Object.keys(data)) {
      if (NON_DATA_KEYS.has(key)) continue;
      fields[key] = data[key];
    }
    Object.assign(this, fields);
    this._id = String(data._id);
    this.isNew = isNew;
  }
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * A chainable, awaitable query. Every chain method returns `this`; awaiting it
 * (or calling `.exec()` / `.then()`) runs the read or write.
 *
 * `T` is the document type and `R` the resolved type, because the two differ:
 * `find()` resolves to `T[]` while `findOne()` resolves to `T | null`. Keeping
 * them apart is what preserves the call sites' existing inference -- `find()`
 * results still give `.map((d) => d.code)` its parameter type for free.
 */
export class LocalQuery<T extends LocalDocument = any, R = T> implements PromiseLike<R> {
  private model: LocalModel<T>;
  private filter: Filter;

  // Written by the model statics when they build a terminal operation
  // (.findOne() sets the action, .findOneAndUpdate() sets the update).
  // Kept as plain properties so the statics can initialise a query without
  // every operation needing its own bespoke factory method.
  update: any = null;
  options: Record<string, any> = {};
  action: 'find' | 'findOne' | 'findOneAndUpdate' | 'findOneAndDelete' | 'delete' = 'find';

  private projection: ProjectionSpec = { include: null, exclude: new Set() };
  private sortSpec: SortSpec = [];
  private limitValue: number | null = null;
  private skipValue = 0;
  private isLean = false;
  private populateSpecs: PopulateSpec[] = [];

  constructor(model: LocalModel<T>, filter: Filter = {}) {
    this.model = model;
    this.filter = filter ?? {};
  }

  select(projection: any): this {
    this.projection = parseProjection(projection);
    return this;
  }

  sort(sort: any): this {
    this.sortSpec = parseSort(sort);
    return this;
  }

  limit(value: number): this {
    this.limitValue = Number(value);
    return this;
  }

  skip(value: number): this {
    this.skipValue = Number(value);
    return this;
  }

  /** Return plain objects instead of hydrated documents. */
  lean<R = any>(): LocalQuery<T, R> {
    this.isLean = true;
    return this as unknown as LocalQuery<T, R>;
  }

  /**
   * Populate referenced ids.
   *
   *   .populate('user')
   *   .populate('user', 'fullName email')      -- select, as Mongoose accepts
   *   .populate({ path: 'mentor', select: 'email' })
   *   .populate(['mentor', 'faculty'])
   */
  populate(input: string | PopulateSpec | any, select?: string | Record<string, any> | any[], model?: string): this {
    // `.populate(path, modelName)` is a real Mongoose overload used by some code.
    if (typeof input === 'string' && model && select === undefined) {
      this.populateSpecs.push({ path: input, model });
      return this;
    }
    if (select !== undefined && Array.isArray(input) === false && typeof input === 'string') {
      const spec: PopulateSpec = { path: input };
      if (typeof select === 'string') spec.select = select;
      else if (Array.isArray(select)) spec.select = select.map(String);
      else if (select && typeof select === 'object') {
        if (typeof select.model === 'string') spec.model = select.model;
        if (typeof select.path === 'string') spec.path = select.path;
        if ('select' in select) spec.select = select.select as any;
      }
      this.populateSpecs.push(spec);
      return this;
    }
    this.populateSpecs.push(...normalisePopulate(input));
    return this;
  }

  setOptions(options: Record<string, any>): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  // -- terminal --------------------------------------------------------------

  async exec(): Promise<any> {
    switch (this.action) {
      case 'findOne':
        return (await this.runFind(true))[0] ?? null;
      case 'findOneAndUpdate':
        return this.runFindOneAndUpdate();
      case 'findOneAndDelete':
        return this.runFindOneAndDelete();
      case 'delete':
        return this.runDeleteMany();
      default:
        return this.runFind(false);
    }
  }

  then<R1 = R, R2 = never>(
    onFulfilled?: ((value: R) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: any) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.exec().then(onFulfilled, onRejected);
  }

  catch<R = never>(onRejected?: ((reason: any) => R | PromiseLike<R>) | null): Promise<any> {
    return this.exec().catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<any> {
    return this.exec().finally(onFinally);
  }

  /** `Model.find(...).distinct('_id')` */
  async distinct(field: string): Promise<any[]> {
    const records = await this.matchingRecords();
    const seen = new Set<string>();
    const out: any[] = [];
    for (const record of records) {
      for (const value of collectPathValues(record, field)) {
        if (value === undefined || value === null) continue;
        const key = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
      }
    }
    return out;
  }

  // -- internals -------------------------------------------------------------

  private async matchingRecords(): Promise<LocalRecord[]> {
    const records = await collection(this.model.collectionName).all();
    return records.filter((record) => matchesFilter(record, this.filter));
  }

  private async runFind(single: boolean): Promise<any[]> {
    let records = await this.matchingRecords();
    records = sortRecords(records, this.sortSpec);
    if (this.skipValue > 0) records = records.slice(this.skipValue);
    if (this.limitValue !== null) records = records.slice(0, this.limitValue);
    if (single) records = records.slice(0, 1);
    return this.materialise(records);
  }

  private async materialise(records: LocalRecord[]): Promise<any[]> {
    const data = this.populateSpecs.length
      ? await loadPopulateData(this.populateSpecs, this.model)
      : new Map<string, Map<string, LocalRecord>>();

    return records.map((record) => {
      const working = cloneRecord(record);
      projectRecordInto(working, this.projection);
      if (this.populateSpecs.length) applyPopulate(working, this.populateSpecs, this.model, data);
      return this.isLean ? working : new LocalDoc(this.model, working, false);
    });
  }

  private async runFindOneAndUpdate(): Promise<any> {
    const store = collection(this.model.collectionName);
    const parsed = parseUpdate(this.update);
    const upsert = Boolean(this.options?.upsert);
    const setDefaultsOnInsert = this.options?.setDefaultsOnInsert !== false;
    let changed: LocalRecord | null = null;

    await store.updateMatching(
      (record) => matchesFilter(record, this.filter),
      (record) => {
        applyUpdate(record, parsed, false, this.model);
        this.model.stampUpdatedAt(record);
        changed = record;
      }
    );

    if (changed === null && upsert) {
      const seed: LocalRecord = {};
      if (setDefaultsOnInsert) this.model.mergeDefaults(seed);
      // Seed from the filter's literal conditions so an upsert carries its key.
      for (const [path, value] of Object.entries(this.filter)) {
        if (path.startsWith('$') || value === null || typeof value === 'object') continue;
        setPath(seed, path, this.model.castPathValue(path, value));
      }
      applyUpdate(seed, parsed, true, this.model);
      seed._id = collection(this.model.collectionName).generateId();
      this.model.stampCreatedAt(seed);
      await this.model.validate(seed, null);
      changed = await store.insert(seed);
    }

    if (!changed) return null;

    const shaped = projectRecord(changed, this.projection);
    if (this.populateSpecs.length) {
      applyPopulate(shaped, this.populateSpecs, this.model, await loadPopulateData(this.populateSpecs, this.model));
    }
    return this.isLean ? shaped : new LocalDoc(this.model, shaped, false);
  }

  private async runFindOneAndDelete(): Promise<any> {
    const store = collection(this.model.collectionName);
    let removed: LocalRecord | null = null;
    await store.deleteMatching((record) => {
      if (!matchesFilter(record, this.filter)) return false;
      removed = record;
      return true;
    });
    return removed ? new LocalDoc(this.model, removed, false) : null;
  }

  private async runDeleteMany(): Promise<{ deletedCount: number }> {
    const deletedCount = await collection(this.model.collectionName).deleteMatching((record) =>
      matchesFilter(record, this.filter)
    );
    return { deletedCount };
  }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'objectId' | 'mixed' | 'object';

export interface FieldOptions {
  type?: FieldType | readonly FieldType[];
  required?: boolean | [boolean, string];
  default?: any;
  enum?: readonly string[];
  ref?: string;
  min?: number;
  max?: number;
  maxlength?: number;
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  unique?: boolean;
  index?: boolean;
  sparse?: boolean;
}

export interface SchemaOptions {
  timestamps?: boolean | { createdAt?: string; updatedAt?: string };
  collection?: string;
}

export interface SchemaIndex {
  fields: Record<string, 1 | -1>;
  unique: boolean;
}

export type PreSaveHook = (doc: any) => void;

interface ResolvedField extends FieldOptions {
  kind: 'field' | 'object' | 'array';
  children?: Record<string, ResolvedField>;
}

const OBJECT_ID = 'ObjectId';
const MIXED = 'Mixed';

function resolveSingleType(spec: any): FieldType {
  if (spec === String || spec === 'string') return 'string';
  if (spec === Number || spec === 'number') return 'number';
  if (spec === Boolean || spec === 'boolean') return 'boolean';
  if (spec === Date || spec === 'date') return 'date';
  if (spec === Object || spec === 'object') return 'object';
  if (spec === OBJECT_ID || spec === 'objectId') return 'objectId';
  if (spec === MIXED || spec === 'mixed') return 'mixed';
  return 'mixed';
}

function normaliseTypeSpec(spec: any): FieldOptions {
  if (spec === undefined || spec === null) return { type: 'mixed' };
  if (Array.isArray(spec)) {
    const [element] = spec;
    if (isPlainObject(element)) return { type: 'object' };
    const resolved = resolveSingleType(element);
    return { type: resolved === 'objectId' ? 'objectId' : resolved };
  }
  if (isPlainObject(spec)) return spec as FieldOptions;
  return { type: resolveSingleType(spec) };
}

function resolveFields(definition: Record<string, any>): Record<string, ResolvedField> {
  const out: Record<string, ResolvedField> = {};
  for (const [name, spec] of Object.entries(definition ?? {})) {
    if (Array.isArray(spec)) {
      out[name] = { kind: 'array', children: resolveFields((spec[0] ?? {}) as Record<string, any>) };
    } else if (isPlainObject(spec) && (spec as any).type === undefined) {
      out[name] = { kind: 'object', children: resolveFields(spec as Record<string, any>) };
    } else {
      out[name] = { kind: 'field', ...normaliseTypeSpec(spec) };
    }
  }
  return out;
}

/**
 * Mongoose-compatible `Schema` constructor.
 *
 * Kept deliberately close to the original so the model files stay readable and
 * their field declarations remain the single description of each record. Only
 * `new Schema(def, opts)`, `.index()` and `.pre('save', fn)` are supported; this
 * project uses no plugins, virtuals or TTL indexes.
 */
export class Schema<T = any> {
  readonly definition: Record<string, any>;
  readonly options: SchemaOptions;
  readonly fields: Record<string, ResolvedField>;
  readonly indexes: SchemaIndex[] = [];
  private readonly hooks: PreSaveHook[] = [];

  constructor(definition: Record<string, any> = {}, options: SchemaOptions = {}) {
    this.definition = definition;
    this.options = options;
    this.fields = resolveFields(definition);

    for (const [path, field] of Object.entries(this.fields)) {
      if (field.unique) this.indexes.push({ fields: { [path]: 1 }, unique: true });
    }
  }

  /**
   * Declared for parity with the original Mongoose schema. The local store has no
   * server-side indexes: `unique` is the only constraint it enforces, and it is
   * already derived from the field definition. Text/compound/sparse options are
   * accepted and ignored so the model files stay unchanged.
   */
  index(spec: Record<string, any>, options: Record<string, any> = {}): this {
    const fields: Record<string, 1 | -1> = {};
    for (const [key, value] of Object.entries(spec)) {
      if (value === 'text') continue; // a keyword-search index has no local equivalent
      fields[key] = Number(value) < 0 ? -1 : 1;
    }
    if (Object.keys(fields).length > 0) this.indexes.push({ fields, unique: Boolean(options.unique) });
    return this;
  }

  /** Only `pre('save')` exists in this codebase (CounsellingRecord's mirror sync). */
  pre(event: 'save', fn: (this: any) => void): this {
    if (event === 'save') this.hooks.push(fn as PreSaveHook);
    return this;
  }

  get preSaveHooks(): PreSaveHook[] {
    return this.hooks;
  }

  collectionName(modelName: string): string {
    return this.options.collection ?? defaultCollectionName(modelName);
  }
}

/**
 * Mongoose pluralises the model name (via the `pluralize` package) and lowercases
 * it, so `Batch` becomes `batches` and `Faculty` becomes `faculties`. Appending a
 * bare `s` would produce `batchs` / `facultys`, so the two English rules that
 * actually apply to this project's model names are implemented explicitly rather
 * than pulling in a dependency for six words.
 *
 * An explicit `schema.options.collection` always wins, exactly as in Mongoose.
 */
function defaultCollectionName(modelName: string): string {
  const snake = modelName.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

  // `y` preceded by a consonant becomes `ies` (faculty -> faculties).
  if (/[^aeiou]y$/.test(snake)) return `${snake.slice(0, -1)}ies`;

  // `s`, `x`, `z`, `ch`, `sh` take `es` (batch -> batches).
  if (/(?:s|x|z|ch|sh)$/.test(snake)) return `${snake}es`;

  return `${snake}s`;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const registry = new Map<string, LocalModel<any>>();

export class LocalModel<T extends LocalDocument = any> {
  readonly modelName: string;
  readonly collectionName: string;
  readonly schema: Schema<T>;

  constructor(modelName: string, schema: Schema<T>) {
    this.modelName = modelName;
    this.schema = schema;
    this.collectionName = schema.collectionName(modelName);
  }

  /**
   * Mongoose's `indexes()` / `dropIndex()` operate on a live server collection.
   * The local store keeps no server-side index catalogue, so this reports the
   * declared indexes and offers no TTL entries to remove.
   */
  get collection(): {
    name: string;
    indexes(): Promise<Array<{ name: string; key: Record<string, any>; expireAfterSeconds?: number }>>;
    dropIndex(_name: string): Promise<void>;
  } {
    const schema = this.schema;
    return {
      name: this.collectionName,
      indexes: async () =>
        schema.indexes.map((entry, position) => ({
          name: `local_${this.collectionName}_${position + 1}`,
          key: entry.fields,
        })),
      dropIndex: async () => undefined,
    };
  }

  private get store() {
    return collection(this.collectionName);
  }

  private get stamps(): { createdAt: string; updatedAt: string } | null {
    const value = this.schema.options.timestamps;
    if (value === false || value === undefined) return null;
    if (value === true) return { createdAt: 'createdAt', updatedAt: 'updatedAt' };
    return { createdAt: value.createdAt ?? 'createdAt', updatedAt: value.updatedAt ?? 'updatedAt' };
  }

  get createdAtField(): string | null {
    return this.stamps?.createdAt ?? null;
  }

  // -- write preparation -----------------------------------------------------

  /**
   * Merge every declared default into `target`, recursing into nested objects so
   * a partially supplied sub-document still gets its missing defaults, and
   * evaluating a function default against the record being written.
   */
  mergeDefaults(target: LocalRecord, fields: Record<string, ResolvedField> = this.schema.fields): void {
    for (const [name, field] of Object.entries(fields)) {
      if (field.kind === 'object') {
        const hasValue = isPlainObject(target[name]);
        if (!hasValue && field.default !== undefined) target[name] = evaluateDefault(field.default, target);
        if (isPlainObject(target[name])) this.mergeDefaults(target[name], field.children ?? {});
        continue;
      }
      if (field.kind === 'array' && Array.isArray(target[name])) {
        for (const element of target[name]) {
          if (isPlainObject(element)) this.mergeDefaults(element, field.children ?? {});
        }
        continue;
      }
      if (target[name] === undefined && field.default !== undefined) {
        target[name] = evaluateDefault(field.default, target);
      }
    }
  }

  /**
   * Cast one value through its field's declared type and string setters.
   * Every write path goes through this, which is what keeps `registerNumber`
   * uppercase and comparable after a `$set`, not just after a `create`.
   */
  castPathValue(path: string, value: any): any {
    const field = this.findField(path.split('.'));
    return field && field.kind === 'field' ? this.castField(field, value) : value;
  }

  private findField(parts: string[]): ResolvedField | undefined {
    let fields: Record<string, ResolvedField> = this.schema.fields;
    let current: ResolvedField | undefined;
    for (const part of parts) {
      current = fields?.[part];
      if (!current) return undefined;
      fields = current.children ?? {};
    }
    return current;
  }

  private castField(field: ResolvedField, value: any): any {
    if (value === null || value === undefined) return value;
    const types = Array.isArray(field.type) ? (field.type as readonly FieldType[]) : field.type ? [field.type] : [];

    let out = value;
    if (types.includes('date') && !(out instanceof Date)) {
      const parsed = asDate(out);
      out = parsed ? parsed.toISOString() : out;
    } else if (types.includes('number') && typeof out !== 'number') {
      const n = numeric(out);
      if (n !== null) out = n;
    } else if (types.includes('boolean') && typeof out !== 'boolean') {
      if (out === 'true' || out === 1 || out === '1') out = true;
      else if (out === 'false' || out === 0 || out === '0') out = false;
    } else if (types.includes('string') && typeof out !== 'string' && typeof out !== 'object') {
      out = String(out);
    }

    if (typeof out === 'string') {
      if (field.trim) out = out.trim();
      if (field.lowercase) out = out.toLowerCase();
      if (field.uppercase) out = out.toUpperCase();
    }
    return out;
  }

  /** Full write preparation: defaults, then casts, then timestamps. */
  prepare(input: LocalRecord, isNew: boolean): LocalRecord {
    const out: LocalRecord = JSON.parse(JSON.stringify(input ?? {}));
    if (isNew) this.mergeDefaults(out);
    this.castRecursive(out, this.schema.fields);
    if (isNew) this.stampCreatedAt(out);
    this.stampUpdatedAt(out);
    return out;
  }

  private castRecursive(target: LocalRecord, fields: Record<string, ResolvedField>): void {
    for (const [name, field] of Object.entries(fields)) {
      const value = target[name];
      if (value === undefined || value === null) continue;

      if (field.kind === 'object') {
        if (isPlainObject(value)) {
          target[name] = this.castLeafObject(value, field);
        } else if (Array.isArray(value)) {
          target[name] = value.map((element: any) =>
            isPlainObject(element) ? this.castLeafObject(element, field) : element
          );
        }
        continue;
      }

      if (field.kind === 'array' && Array.isArray(value)) {
        target[name] = value.map((element: any) =>
          isPlainObject(element) ? this.castLeafObject(element, { ...field, kind: 'object' }) : element
        );
        continue;
      }

      target[name] = this.castField(field, value);
    }
  }

  private castLeafObject(value: LocalRecord, field: ResolvedField): LocalRecord {
    const out = { ...value };
    for (const [name, child] of Object.entries(field.children ?? {})) {
      const childValue = out[name];
      if (childValue === undefined || childValue === null) continue;
      if (child.kind === 'object' && isPlainObject(childValue)) {
        out[name] = this.castLeafObject(childValue, child);
      } else {
        out[name] = this.castField(child, childValue);
      }
    }
    return out;
  }

  stampCreatedAt(record: LocalRecord): void {
    const field = this.stamps?.createdAt;
    if (field && record[field] === undefined) record[field] = new Date().toISOString();
  }

  stampUpdatedAt(record: LocalRecord): void {
    const field = this.stamps?.updatedAt;
    if (field) record[field] = new Date().toISOString();
  }

  // -- validation ------------------------------------------------------------

  /** required / enum / min / max / maxlength, plus the declared unique indexes. */
  async validate(record: LocalRecord, existingId: string | null): Promise<void> {
    const errors: Record<string, { message: string }> = {};

    const checkLeaf = (name: string, field: ResolvedField, value: any, prefix: string): void => {
      const label = prefix ? `${prefix}.${name}` : name;

      const required = field.required === true || (Array.isArray(field.required) && field.required[0] === true);
      if (required) {
        const isEmpty =
          value === undefined ||
          value === null ||
          (typeof value === 'string' && value.trim() === '') ||
          (Array.isArray(value) && value.length === 0);
        if (isEmpty) {
          errors[label] = { message: Array.isArray(field.required) ? String(field.required[1]) : `${label} is required` };
          return;
        }
      }

      if (value === undefined || value === null) return;

      // Mongoose inherits `enum` into an array field's ELEMENT type, so
      // `{ type: [String], enum: [...] }` checks each item, not the array.
      // Checking the array itself rejected every valid multi-select.
      if (field.enum && Array.isArray(value)) {
        for (const item of value) {
          if (!field.enum.includes(String(item))) {
            errors[label] = { message: `${label} must be one of: ${field.enum.join(', ')}` };
            return;
          }
        }
      } else if (field.enum && !field.enum.includes(String(value))) {
        errors[label] = { message: `${label} must be one of: ${field.enum.join(', ')}` };
        return;
      }
      if ((field.min !== undefined || field.max !== undefined) && !Array.isArray(value)) {
        const n = numeric(value);
        if (n !== null) {
          if (field.min !== undefined && n < field.min) errors[label] = { message: `${label} must be at least ${field.min}` };
          else if (field.max !== undefined && n > field.max) errors[label] = { message: `${label} must be at most ${field.max}` };
        }
      }
      if (field.maxlength !== undefined && typeof value === 'string' && value.length > field.maxlength) {
        errors[label] = { message: `${label} must be at most ${field.maxlength} characters` };
      }
    };

    for (const [name, field] of Object.entries(this.schema.fields)) {
      if (field.kind === 'object') {
        const container = record[name];
        if (!isPlainObject(container)) continue;
        for (const [childName, child] of Object.entries(field.children ?? {})) {
          if (child.kind === 'field') checkLeaf(childName, child, container[childName], name);
        }
        continue;
      }
      if (field.kind === 'array') continue;
      checkLeaf(name, field, record[name], '');
    }

    if (Object.keys(errors).length > 0) throw new ValidationError(errors);

    // Uniqueness is checked last so a caller sees its own field errors first,
    // and only for a record that is genuinely new or changing a unique field.
    await this.checkUnique(record, existingId);
  }

  private async checkUnique(record: LocalRecord, existingId: string | null): Promise<void> {
    const uniqueIndexes = this.schema.indexes.filter((index) => index.unique);
    if (uniqueIndexes.length === 0) return;

    const records = await this.store.all();
    const errors: Record<string, { message: string }> = {};

    for (const index of uniqueIndexes) {
      const paths = Object.keys(index.fields);
      const values = paths.map((path) => getPath(record, path));
      if (values.some((value) => value === undefined || value === null || value === '')) continue;

      const clash = records.find(
        (other) =>
          String(other._id) !== String(record._id ?? existingId ?? '') &&
          values.every((value, i) => looseEquals(getPath(other, paths[i]), value))
      );
      if (clash) {
        errors[paths[0]] = { message: `${paths[0]} must be unique (${paths.join(' + ')})` };
      }
    }

    if (Object.keys(errors).length > 0) throw new ValidationError(errors);
  }

  // -- statics ---------------------------------------------------------------

  find(filter: Filter = {}, projection?: any): LocalQuery<T, T[]> {
    return new LocalQuery<T, T[]>(this, filter).select(projection);
  }

  findOne(filter: Filter = {}, projection?: any): LocalQuery<T, T> {
    const query = new LocalQuery<T, T>(this, filter).select(projection);
    query.action = 'findOne';
    return query;
  }

  findById(id: any, projection?: any): LocalQuery<T, T> {
    const query = new LocalQuery<T, T>(this, { _id: asReference(id) }).select(projection);
    query.action = 'findOne';
    return query;
  }

  async create(input: any): Promise<any> {
    const isArray = Array.isArray(input);
    const created: any[] = [];
    for (const doc of isArray ? input : [input]) {
      const prepared = this.prepare(stripMeta(doc), true);
      await this.validate(prepared, null);
      created.push(new LocalDoc(this, await this.store.insert(prepared), false));
    }
    return isArray ? created : created[0];
  }

  async insertMany(inputs: any[]): Promise<any[]> {
    const prepared: LocalRecord[] = [];
    for (const input of inputs) {
      const value = this.prepare(stripMeta(input), true);
      await this.validate(value, null);
      prepared.push(value);
    }
    return (await this.store.insertMany(prepared)).map((record) => new LocalDoc(this, record, false));
  }

  findOneAndUpdate(filter: Filter, update: any, options: Record<string, any> = {}): LocalQuery<T, T> {
    const query = new LocalQuery<T, T>(this, filter);
    query.update = update;
    query.options = options;
    query.action = 'findOneAndUpdate';
    return query;
  }

  findByIdAndUpdate(id: any, update: any, options: Record<string, any> = {}): LocalQuery<T> {
    return this.findOneAndUpdate({ _id: asReference(id) }, update, options);
  }

  findOneAndDelete(filter: Filter): Promise<any> {
    const query = new LocalQuery<T>(this, filter);
    query.action = 'findOneAndDelete';
    return query.exec();
  }

  findByIdAndDelete(id: any): Promise<any> {
    return this.findOneAndDelete({ _id: asReference(id) });
  }

  deleteOne(filter: Filter): Promise<{ deletedCount: number }> {
    const query = new LocalQuery<T>(this, filter);
    query.action = 'delete';
    return query.exec();
  }

  deleteMany(filter: Filter = {}): LocalQuery<T> {
    const query = new LocalQuery<T>(this, filter);
    query.action = 'delete';
    return query;
  }

  async updateOne(filter: Filter, update: any): Promise<LocalQueryResult> {
    return this.applyUpdate(filter, update, true);
  }

  async updateMany(filter: Filter, update: any): Promise<LocalQueryResult> {
    return this.applyUpdate(filter, update, false);
  }

  private async applyUpdate(filter: Filter, update: any, single: boolean): Promise<LocalQueryResult> {
    const parsed = parseUpdate(update);
    let matchedCount = 0;
    let modifiedCount = 0;

    await this.store.updateMatching(
      (record) => {
        if (single && matchedCount >= 1) return false;
        if (!matchesFilter(record, filter)) return false;
        matchedCount++;
        const before = JSON.stringify(record);
        applyUpdate(record, parsed, false, this);
        this.stampUpdatedAt(record);
        if (JSON.stringify(record) !== before) modifiedCount++;
        return true;
      },
      () => undefined
    );

    return { acknowledged: true, matchedCount, modifiedCount, deletedCount: 0, upsertedCount: 0 };
  }

  async countDocuments(filter: Filter = {}): Promise<number> {
    const records = await this.store.all();
    return records.reduce((total, record) => (matchesFilter(record, filter) ? total + 1 : total), 0);
  }

  async estimatedDocumentCount(): Promise<number> {
    return this.store.count();
  }

  async exists(filter: Filter): Promise<{ _id: LocalId } | null> {
    const records = await this.store.all();
    const found = records.find((record) => matchesFilter(record, filter));
    return found ? { _id: String(found._id) } : null;
  }

  async distinct(field: string, filter: Filter = {}): Promise<any[]> {
    return new LocalQuery<T>(this, filter).distinct(field);
  }

  async aggregate(pipeline: any[]): Promise<any[]> {
    return runPipeline(await this.store.all(), pipeline);
  }

  /**
   * Present so the existing migration call keeps working. Index declarations are
   * enforced by `validate()` on every write, so there is nothing to synchronise
   * against a file; this only proves the collection is readable.
   */
  async syncIndexes(): Promise<void> {
    await this.store.all();
  }

  /** Wrap an existing object as a document without writing it. */
  hydrate(data: LocalRecord): any {
    return new LocalDoc(this, data, false);
  }

  /** Internal: resolve a dotted path to its `ref` target model. */
  findRef(path: string): LocalModel<any> | null {
    const field = this.findField(path.split('.'));
    if (!field || field.kind !== 'field' || !field.ref) return null;
    return registry.get(field.ref) ?? null;
  }
}

function stripMeta(input: any): LocalRecord {
  const { id, isNew, errors, ...rest } = (input ?? {}) as LocalRecord;
  return rest;
}

function evaluateDefault(value: any, sibling: LocalRecord): any {
  // Mongoose allows a default to be a function of the document; the only such
  // default here is StudentDocument.title reading `this.fileName`.
  return typeof value === 'function' ? value.call(sibling) : value;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * The public shape of an exported model: a Mongoose model is simultaneously
 * constructable (`new AcademicRecord({ ... })`) and a namespace of statics, so
 * the facade below has to be both. Declaring the statics explicitly is what
 * keeps `find().map((d) => d.code)` inferring `d` at every existing call site.
 *
 * Note on `findOne`/`findById`: the resolved type is `T`, not `T | null`. The
 * runtime does return `null` for a miss -- exactly as Mongoose did -- and every
 * caller in this codebase already guards for that. Before the migration the
 * exported models were typed `Model<any>` (the `mongoose.models.X ||
 * mongoose.model<T>()` guard erased the parameter), so `findOne()` resolved to
 * `any` and no call site was forced to change. Keeping the optimistic type is
 * what preserves that; the `if (!x) return 404` guards are untouched.
 */
export interface LocalModelStatic<T extends LocalDocument> {
  /** Build an unsaved document. It reaches disk on `.save()`, as in Mongoose. */
  new (data?: Partial<T> | Record<string, any>): T;

  readonly modelName: string;
  readonly collectionName: string;
  readonly schema: Schema<T>;

  find(filter?: Filter, projection?: any): LocalQuery<T, T[]>;
  findOne(filter?: Filter, projection?: any): LocalQuery<T, T>;
  findById(id: any, projection?: any): LocalQuery<T, T>;
  findOneAndUpdate(filter: Filter, update: any, options?: Record<string, any>): LocalQuery<T, T>;
  findByIdAndUpdate(id: any, update: any, options?: Record<string, any>): LocalQuery<T, T>;
  findOneAndDelete(filter: Filter): Promise<T>;
  findByIdAndDelete(id: any): Promise<T>;
  deleteOne(filter: Filter): Promise<{ deletedCount: number }>;
  deleteMany(filter?: Filter): Promise<LocalQueryResult>;
  updateOne(filter: Filter, update: any): Promise<LocalQueryResult>;
  updateMany(filter: Filter, update: any): Promise<LocalQueryResult>;
  create(input: any): Promise<any>;
  insertMany(inputs: any[]): Promise<T[]>;
  countDocuments(filter?: Filter): Promise<number>;
  estimatedDocumentCount(): Promise<number>;
  exists(filter: Filter): Promise<{ _id: LocalId } | null>;
  distinct(field: string, filter?: Filter): Promise<any[]>;
  aggregate(pipeline: any[]): Promise<any[]>;
  syncIndexes(): Promise<void>;
  hydrate(data: LocalRecord): T;

  /** Server-side index catalogue. Kept only for the TTL-cleanup migration. */
  readonly collection: {
    name: string;
    indexes(): Promise<Array<{ name: string; key: Record<string, any>; expireAfterSeconds?: number }>>;
    dropIndex(name: string): Promise<void>;
  };
}

export function defineModel<T extends LocalDocument = any>(
  modelName: string,
  schema: Schema<T>
): LocalModelStatic<T> {
  const existing = registry.get(modelName);
  if (existing) return toStatic(existing as LocalModel<T>);

  const model = new LocalModel<T>(modelName, schema);
  registry.set(modelName, model);
  return toStatic(model);
}

/**
 * Idempotent registration, replacing `mongoose.models.X || mongoose.model(...)`.
 * The schema is ignored when the model is already registered, matching the
 * original guard's intent.
 */
export function getModel<T extends LocalDocument = any>(modelName: string, schema: Schema<T>): LocalModelStatic<T> {
  return defineModel<T>(modelName, schema);
}

export function allRegisteredModels(): LocalModel<any>[] {
  return [...registry.values()];
}

/**
 * Wrap a `LocalModel` in a callable/constructable object. Every own property and
 * prototype member is forwarded with `this` pinned to the model, so the private
 * helpers `prepare`/`validate` keep working through the facade without being
 * widened to public.
 */
function toStatic<T extends LocalDocument>(model: LocalModel<T>): LocalModelStatic<T> {
  const facade = function LocalModelDocument(this: unknown, data?: Partial<T> | Record<string, any>) {
    return new LocalDoc(model, model.prepare(stripMeta(data ?? {}), true), true);
  } as unknown as LocalModelStatic<T>;

  for (const key of Object.getOwnPropertyNames(model)) {
    Object.defineProperty(facade, key, { value: (model as any)[key], enumerable: true });
  }

  for (const descriptor of Object.getOwnPropertyNames(LocalModel.prototype).map((key) => [
    key,
    Object.getOwnPropertyDescriptor(LocalModel.prototype, key),
  ] as const)) {
    const [key, member] = descriptor;
    if (key === 'constructor' || !member) continue;
    if (typeof member.value === 'function') {
      Object.defineProperty(facade, key, { value: (model as any)[key].bind(model), enumerable: false });
    } else {
      Object.defineProperty(facade, key, {
        get: () => (model as any)[key],
        enumerable: false,
        configurable: true,
      });
    }
  }

  return facade;
}