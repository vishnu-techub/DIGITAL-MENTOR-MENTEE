/**
 * STRICT INPUT VALIDATION
 * ---------------------------------------------------------------------------
 * `parseFloat("9.5xyz")` returns 9.5, which silently corrupts academic records.
 * Every numeric field that reaches MongoDB must first pass a full-format check
 * here. No controller is allowed to use bare parseFloat/Number on user input.
 */

/** A strict decimal literal: optional sign, digits, optional fraction. Rejects "9.5xyz", "1e5", "abc", " 9 ". */
const STRICT_DECIMAL = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/;

const MOBILE_10 = /^[0-9]{10}$/;
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export interface ParseResult<T = number> {
  ok: boolean;
  value?: T;
  error?: string;
}

const ok = <T,>(value: T): ParseResult<T> => ({ ok: true, value });
const bad = <T,>(error: string): ParseResult<T> => ({ ok: false, error });

export interface NumberOptions {
  field: string;
  min?: number;
  max?: number;
  /** Reject empty/absent values instead of treating them as "not supplied". */
  required?: boolean;
  /** When false (default) an empty value yields ok with `value: undefined`. */
  integer?: boolean;
}

/**
 * Parse a number from unknown input with a strict format check.
 * Returns `{ ok:false, error }` for anything that is not a clean decimal in range.
 */
export function parseStrictNumber(input: unknown, opts: NumberOptions): ParseResult<number> {
  const { field, min, max, required = false, integer = false } = opts;

  if (input === null || input === undefined || (typeof input === 'string' && input.trim() === '')) {
    return required
      ? bad(`${field} is required.`)
      : ok(undefined as unknown as number);
  }

  if (typeof input === 'boolean' || typeof input === 'object') {
    return bad(`${field} must be a number.`);
  }

  const raw = String(input).trim();
  if (!STRICT_DECIMAL.test(raw)) {
    return bad(`${field} must be a valid number (received "${raw}").`);
  }

  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return bad(`${field} must be a finite number.`);
  }
  if (integer && !Number.isInteger(num)) {
    return bad(`${field} must be a whole number.`);
  }
  if (min !== undefined && num < min) {
    return bad(`${field} must be between ${min} and ${max ?? 'infinity'} (received ${num}).`);
  }
  if (max !== undefined && num > max) {
    return bad(`${field} must be between ${min ?? '-infinity'} and ${max} (received ${num}).`);
  }

  return ok(num);
}

/** CGPA / SGPA (and any other 0..10 scale grade): strict decimal, 0 <= value <= 10. */
export function parseGrade(input: unknown, field = 'CGPA', required = true): ParseResult<number> {
  return parseStrictNumber(input, { field, min: 0, max: 10, required });
}

/** Exactly 10 digits. Rejects '+91...', spaces, letters, negatives, and 9/11 digit values. */
export function parseMobile(input: unknown, required = true): ParseResult<string> {
  if (input === null || input === undefined || String(input).trim() === '') {
    return required ? bad('Mobile number is required.') : ok('');
  }
  const raw = String(input).trim();
  if (!MOBILE_10.test(raw)) {
    return bad('Mobile number must be exactly 10 digits (letters, symbols and country codes are not allowed).');
  }
  return ok(raw);
}

export function parseEmail(input: unknown, required = false): ParseResult<string> {
  if (input === null || input === undefined || String(input).trim() === '') {
    return required ? bad('Email address is required.') : ok('');
  }
  const raw = String(input).trim().toLowerCase();
  if (!EMAIL_RE.test(raw)) {
    return bad(`"${String(input).trim()}" is not a valid email address.`);
  }
  return ok(raw);
}

/** Study year: integer 1..4. */
export function parseStudyYear(input: unknown, required = false): ParseResult<number> {
  return parseStrictNumber(input, { field: 'Year', min: 1, max: 4, required, integer: true });
}

/** Section label: 1-3 letters, uppercased. */
export function parseSection(input: unknown, required = false): ParseResult<string> {
  if (input === null || input === undefined || String(input).trim() === '') {
    return required ? bad('Section is required.') : ok('');
  }
  const raw = String(input).trim().toUpperCase();
  if (!/^[A-Z]{1,3}$/.test(raw)) {
    return bad('Section must be 1 to 3 letters (e.g. A, B, C).');
  }
  return ok(raw);
}

export function parseSemesterNumber(input: unknown): ParseResult<number> {
  return parseStrictNumber(input, { field: 'Semester number', min: 1, max: 8, integer: true });
}

/** Collapses multiple validation failures into a single readable message. */
export function joinErrors(errors: string[]): string {
  return errors.filter(Boolean).join(' ');
}
