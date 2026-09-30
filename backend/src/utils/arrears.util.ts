/**
 * ARREAR CALCULATION — SINGLE SOURCE OF TRUTH
 * ---------------------------------------------------------------------------
 * Every screen, PDF, Excel export and dashboard MUST derive arrear state from
 * this module. Rules enforced here:
 *
 *  1. The SUBJECT LIST is the source of truth. `arrearsCount` is never trusted
 *     independently of the list; when a list exists it fully determines state.
 *  2. A subject that has been cleared stays in history forever but is NOT
 *     counted as an active arrear.
 *  3. Status vocabulary is exactly "Clear" or "Active Arrear". Legacy strings
 *     such as "0", "Clear / Regular", "ALL CLEAR" are never emitted.
 *  4. Active arrears always carry semester + subject code + subject name.
 */

export interface IClearedSubjectItem {
  subjectCode: string;
  subjectName?: string;
  clearedInSemester: number;
  originalSemester?: number;
  clearedDate?: string;
  remarks?: string;
  attempt?: number;
}

export interface IArrearSubjectDetail {
  subjectCode: string;
  subjectName: string;
}

export interface IActiveArrear {
  semester: number;
  subjectCode: string;
  subjectName: string;
}

export interface IArrearHistoryRecord {
  subjectCode: string;
  subjectName: string;
  originalSemester: number;
  attempt: number;
  status: 'ACTIVE' | 'CLEARED';
  statusLabel: string;
  clearedInSemester: number | null;
  clearedDate: string | null;
  remarks: string;
}

export interface IFormattedSemester {
  semester_number: number;
  cgpa: number;
  sgpa: number;
  /** ACTIVE arrears only (0 once cleared). */
  arrears_count: number;
  /** Original count at the time the arrear was incurred. */
  historical_arrears_count: number;
  /** Active subject codes joined, or "—" when clear. */
  arrears_subjects: string;
  /** Full original subject string as recorded. */
  original_arrears_subjects: string;
  /** Structured active arrears for this semester. */
  arrear_subject_details: IArrearSubjectDetail[];
  status: 'Clear' | 'Active Arrear';
  status_label: string;
  clearance_remarks: string;
  cleared_subjects: IClearedSubjectItem[];
  cleared_in_later_semesters: IClearedSubjectItem[];
  active_arrears_in_sem: number;
  has_active_arrear: boolean;
  remarks: string;
}

export interface IArrearStatistics {
  historicalArrearsCount: number;
  activeArrearsCount: number;
  clearedCount: number;
  clearedSubjects: IClearedSubjectItem[];
  activeArrearSubjects: string[];
  /** Structured active arrears: semester + code + name. */
  activeArrearDetails: IActiveArrear[];
  arrearHistory: IArrearHistoryRecord[];
  /** Exactly "Clear" or "Active Arrear". */
  statusLabel: string;
  formattedSemesters: IFormattedSemester[];
}

const PLACEHOLDER_TOKENS = ['NIL', 'NONE', 'CLEAR', 'REGULAR', 'NA', 'N/A', '—', '-', 'NO ARREAR', 'NO ARREARS'];

/** Split a free-text subject list ("24ITT36, 24ITT40") into normalised codes. */
export function parseSubjectCodes(subjectsStr?: string): string[] {
  if (!subjectsStr || !subjectsStr.trim()) return [];
  return subjectsStr
    .split(/[,;/|\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && !PLACEHOLDER_TOKENS.includes(s));
}

/** Human-friendly name for a subject code, never blank. */
function subjectNameFor(code: string, detailMap?: Map<string, string>): string {
  const fromDetail = detailMap?.get(code);
  if (fromDetail && fromDetail.trim()) return fromDetail.trim();
  return 'Not Provided';
}

/**
 * Read the authoritative subject list for a semester.
 * Prefers the structured `arrearSubjectDetails` array (carries names); falls
 * back to parsing the legacy comma-separated `arrearsSubjects` string.
 */
function readSubjectList(
  sem: any,
  semNum: number
): { codes: string[]; detailMap: Map<string, string> } {
  const detailMap = new Map<string, string>();
  const details: any[] = Array.isArray(sem?.arrearSubjectDetails)
    ? sem.arrearSubjectDetails
    : Array.isArray(sem?.arrear_subject_details)
      ? sem.arrear_subject_details
      : [];

  details.forEach((d: any) => {
    const rawCode = d?.subjectCode ?? d?.subject_code ?? d?.code;
    if (!rawCode) return;
    const code = String(rawCode).trim().toUpperCase();
    if (!code || PLACEHOLDER_TOKENS.includes(code)) return;
    const name = d?.subjectName ?? d?.subject_name ?? d?.name ?? '';
    detailMap.set(code, String(name).trim());
  });

  const parsed = parseSubjectCodes(sem?.arrearsSubjects ?? sem?.arrears_subjects);

  // Structured details win; the string only contributes codes we have no detail for.
  const codes = new Set<string>(parsed);
  detailMap.forEach((_v, k) => codes.add(k));

  if (codes.size === 0) {
    // Legacy fallback: a record that only ever stored a bare count.
    const legacyCount = Number(sem?.arrearsCount ?? sem?.arrears_count ?? 0);
    if (Number.isFinite(legacyCount) && legacyCount > 0) {
      return { codes: [], detailMap };
    }
  }

  return { codes: Array.from(codes).sort(), detailMap };
}

/** Legacy rows that stored only a numeric count and no subject list. */
function legacyCountFor(sem: any): number {
  const n = Number(sem?.arrearsCount ?? sem?.arrears_count ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function calculateArrearStatistics(
  semesters: any[],
  studentClearedSubjects: IClearedSubjectItem[] = [],
  savedArrearHistory: any[] = []
): IArrearStatistics {
  const list = Array.isArray(semesters) ? semesters : [];

  // ---- 1. Collect clearance declarations from every source -------------------
  const clearedMap = new Map<string, IClearedSubjectItem>();
  const remember = (c: any, fallbackSem: number) => {
    const raw = c?.subjectCode ?? c?.subject_code;
    if (!raw) return;
    const code = String(raw).trim().toUpperCase();
    if (!code || clearedMap.has(code)) return;
    clearedMap.set(code, {
      subjectCode: code,
      subjectName: c?.subjectName ? String(c.subjectName).trim() : '',
      clearedInSemester: Number(c?.clearedInSemester) || fallbackSem || 0,
      originalSemester: c?.originalSemester ? Number(c.originalSemester) : undefined,
      clearedDate: c?.clearedDate || '',
      remarks: c?.remarks || `${code} Cleared`,
      attempt: Number(c?.attempt) || 1,
    });
  };

  (Array.isArray(studentClearedSubjects) ? studentClearedSubjects : []).forEach((c) => remember(c, 0));
  list.forEach((sem) => {
    const semNum = Number(sem?.semesterNumber ?? sem?.semester_number) || 0;
    (Array.isArray(sem?.clearedSubjects) ? sem.clearedSubjects : []).forEach((c: any) => remember(c, semNum));
  });

  const savedHistoryMap = new Map<string, any>();
  (Array.isArray(savedArrearHistory) ? savedArrearHistory : []).forEach((h) => {
    const raw = h?.subjectCode;
    if (raw) savedHistoryMap.set(String(raw).trim().toUpperCase(), h);
  });

  const allClearedList = Array.from(clearedMap.values());

  // ---- 2. Index semesters ----------------------------------------------------
  const semMap = new Map<number, any>();
  list.forEach((sem) => {
    const n = Number(sem?.semesterNumber ?? sem?.semester_number);
    if (n >= 1 && n <= 8) semMap.set(n, sem);
  });

  const formattedSemesters: IFormattedSemester[] = [];
  const arrearHistory: IArrearHistoryRecord[] = [];
  const activeArrearSubjects: string[] = [];
  const activeArrearDetails: IActiveArrear[] = [];

  for (let semNum = 1; semNum <= 8; semNum++) {
    const semDoc = semMap.get(semNum);

    // CGPA and SGPA are two independent published values. SGPA is NEVER
    // derived from CGPA: when the department has not published an SGPA the
    // cell is 0 ("not recorded") and the UI/PDF/Excel show it as such.
    // Silently mirroring CGPA into SGPA would misreport the student's record.
    const cgpa = semDoc && semDoc.cgpa !== undefined ? Number(semDoc.cgpa) || 0 : 0;
    const sgpa = semDoc && semDoc.sgpa !== undefined ? Number(semDoc.sgpa) || 0 : 0;

    const originalSubjectsStr = String(semDoc?.arrearsSubjects ?? semDoc?.arrears_subjects ?? '');
    const { codes: incurredCodes, detailMap } = readSubjectList(semDoc, semNum);
    const legacyCount = legacyCountFor(semDoc);

    // SOURCE OF TRUTH: the subject list. The bare count is only consulted for
    // legacy rows that never stored a list at all.
    const numArrearsIncurred = incurredCodes.length > 0 ? incurredCodes.length : legacyCount;

    const clearedInLaterSemesters: IClearedSubjectItem[] = [];
    const activeInSem: IArrearSubjectDetail[] = [];

    if (incurredCodes.length > 0) {
      incurredCodes.forEach((code) => {
        const cleared = clearedMap.get(code);
        const saved = savedHistoryMap.get(code);
        const name = subjectNameFor(code, detailMap) || saved?.subjectName || cleared?.subjectName || 'Not Provided';

        if (cleared) {
          const origSem = cleared.originalSemester || saved?.originalSemester || semNum;
          clearedInLaterSemesters.push({ ...cleared, subjectName: name, originalSemester: origSem });
          arrearHistory.push({
            subjectCode: code,
            subjectName: name,
            originalSemester: origSem,
            attempt: saved?.attempt || cleared.attempt || 1,
            status: 'CLEARED',
            statusLabel: 'Cleared',
            clearedInSemester: cleared.clearedInSemester,
            clearedDate: cleared.clearedDate || null,
            remarks: cleared.remarks || `${code} Cleared in Semester 0${cleared.clearedInSemester}`,
          });
        } else {
          activeInSem.push({ subjectCode: code, subjectName: name });
          activeArrearSubjects.push(code);
          activeArrearDetails.push({ semester: semNum, subjectCode: code, subjectName: name });
          arrearHistory.push({
            subjectCode: code,
            subjectName: name,
            originalSemester: semNum,
            attempt: saved?.attempt || 1,
            status: 'ACTIVE',
            statusLabel: 'Active Arrear',
            clearedInSemester: null,
            clearedDate: null,
            remarks: 'Active Arrear — Pending Clearance',
          });
        }
      });
    } else if (legacyCount > 0) {
      // Legacy record with a count but no codes: synthesise placeholders so the
      // count and the list can never silently disagree again.
      const clearedForSem = allClearedList.filter((c) => c.originalSemester === semNum);
      clearedInLaterSemesters.push(...clearedForSem);
      clearedForSem.forEach((c) => {
        arrearHistory.push({
          subjectCode: c.subjectCode,
          subjectName: c.subjectName || 'Not Provided',
          originalSemester: semNum,
          attempt: c.attempt || 1,
          status: 'CLEARED',
          statusLabel: 'Cleared',
          clearedInSemester: c.clearedInSemester,
          clearedDate: c.clearedDate || null,
          remarks: c.remarks || `${c.subjectCode} Cleared in Semester 0${c.clearedInSemester}`,
        });
      });
      const remaining = Math.max(0, legacyCount - clearedForSem.length);
      for (let i = 1; i <= remaining; i++) {
        const placeholder = `SEM0${semNum}_ARREAR_${i}`;
        activeInSem.push({ subjectCode: placeholder, subjectName: 'Not Provided' });
        activeArrearSubjects.push(placeholder);
        activeArrearDetails.push({ semester: semNum, subjectCode: placeholder, subjectName: 'Not Provided' });
        arrearHistory.push({
          subjectCode: placeholder,
          subjectName: 'Not Provided',
          originalSemester: semNum,
          attempt: 1,
          status: 'ACTIVE',
          statusLabel: 'Active Arrear',
          clearedInSemester: null,
          clearedDate: null,
          remarks: 'Active Arrear — Pending Clearance',
        });
      }
    }

    const subjectsClearedInThisSem = allClearedList.filter((c) => c.clearedInSemester === semNum);
    const activeCount = activeInSem.length;

    const status: 'Clear' | 'Active Arrear' = activeCount > 0 ? 'Active Arrear' : 'Clear';
    let clearanceRemarks: string;
    if (activeCount > 0) {
      const activePart = activeInSem.map((s) => s.subjectCode).join(', ');
      clearanceRemarks =
        clearedInLaterSemesters.length > 0
          ? `${clearedInLaterSemesters.map((c) => `${c.subjectCode} Cleared`).join(', ')} / Active Arrear: ${activePart}`
          : `Active Arrear: ${activePart}`;
    } else if (numArrearsIncurred > 0) {
      const clearedLabels = clearedInLaterSemesters.map((c) => `${c.subjectCode} Cleared`).join(', ');
      clearanceRemarks = clearedLabels ? `${clearedLabels} (Clear)` : 'Clear';
    } else {
      clearanceRemarks =
        subjectsClearedInThisSem.length > 0
          ? `${subjectsClearedInThisSem.map((c) => `${c.subjectCode} Cleared`).join(', ')} / Clear`
          : 'Clear';
    }

    formattedSemesters.push({
      semester_number: semNum,
      cgpa,
      sgpa,
      arrears_count: activeCount,
      historical_arrears_count: numArrearsIncurred,
      arrears_subjects: activeCount > 0 ? activeInSem.map((s) => s.subjectCode).join(', ') : '—',
      original_arrears_subjects: originalSubjectsStr,
      arrear_subject_details: activeInSem,
      status,
      status_label: status,
      clearance_remarks: clearanceRemarks,
      cleared_subjects: subjectsClearedInThisSem,
      cleared_in_later_semesters: clearedInLaterSemesters,
      active_arrears_in_sem: activeCount,
      has_active_arrear: activeCount > 0,
      remarks: clearanceRemarks,
    });
  }

  const activeArrearsCount = arrearHistory.filter((a) => a.status === 'ACTIVE').length;
  const clearedCount = arrearHistory.filter((a) => a.status === 'CLEARED').length;

  return {
    historicalArrearsCount: arrearHistory.length,
    activeArrearsCount,
    clearedCount,
    clearedSubjects: allClearedList,
    activeArrearSubjects,
    activeArrearDetails,
    arrearHistory,
    statusLabel: activeArrearsCount > 0 ? 'Active Arrear' : 'Clear',
    formattedSemesters,
  };
}

/**
 * The only sanctioned label for a student's overall arrear state.
 * Rejects "ALL CLEAR" / "N ARREAR(S)" / "Clear / Regular" style strings.
 */
export function arrearStatusLabel(activeArrearsCount: number): string {
  return activeArrearsCount > 0 ? 'Active Arrear' : 'Clear';
}
