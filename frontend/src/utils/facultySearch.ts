/**
 * Shared client-side search matcher for the Faculty / Mentor screens.
 *
 * A Faculty record IS the mentor record in this data model (a mentor is a
 * Faculty member with an ACTIVE MentorAssignment), so one matcher serves both
 * the Admin "Faculty / Mentors" page and the HOD "Faculty Mentors" page.
 *
 * Matching is deliberately simple and safe:
 *   - case-insensitive;
 *   - the query is trimmed, and blank/whitespace-only queries match everything;
 *   - partial substrings match (e.g. "vish" matches "Vishnu");
 *   - every whitespace-separated token must appear somewhere in the record, so
 *     "vish cse" matches a faculty member named "Vishnu" in the CSE department.
 *
 * The caller always passes the already role-scoped list the API returned: an
 * HOD only ever receives their own department's records, so filtering here can
 * never surface a record the backend withheld.
 */
export interface FacultySearchFields {
  full_name?: string | null;
  employee_id?: string | null;
  email?: string | null;
  designation?: string | null;
  department?: string | null;
  /** Admin `/admin/faculty` payload field. */
  department_name?: string | null;
  /** Admin `/admin/faculty` payload field. */
  department_code?: string | null;
  /** Defensive alias used by some legacy Admin views. */
  dept_name?: string | null;
}

/** Fields searched for every faculty/mentor record (one shared vocabulary). */
const searchableValues = (record: FacultySearchFields): Array<string | null | undefined> => [
  record.full_name,
  record.employee_id,
  record.email,
  record.designation,
  record.department,
  record.department_name,
  record.department_code,
  record.dept_name,
];

/** True when the (possibly empty) query matches the record. */
export const facultyMatchesQuery = (
  record: FacultySearchFields,
  query: string
): boolean => {
  const tokens = String(query ?? '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = searchableValues(record)
    .filter((value) => value !== null && value !== undefined)
    .map((value) => String(value).toLowerCase())
    .join(' ');

  return tokens.every((token) => haystack.includes(token));
};
