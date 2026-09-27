export interface IClearedSubjectItem {
  subjectCode: string;
  clearedInSemester: number;
  originalSemester?: number;
  clearedDate?: string;
  remarks?: string;
  attempt?: number;
}

export interface ISemesterRecordInput {
  semesterNumber: number;
  cgpa?: number;
  sgpa?: number;
  arrearsCount?: number;
  arrearsSubjects?: string;
  clearedSubjects?: IClearedSubjectItem[];
  remarks?: string;
}

export interface IArrearHistoryRecord {
  subjectCode: string;
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
  arrears_count: number; // Current active arrears for this semester (0 if cleared!)
  historical_arrears_count: number; // Original arrears count
  arrears_subjects: string; // Active arrear subjects only ("—" if cleared!)
  original_arrears_subjects: string; // Original subjects string
  status: 'Clear' | 'Active Arrear' | 'Cleared';
  status_label: string;
  clearance_remarks: string;
  cleared_subjects: IClearedSubjectItem[];
  cleared_in_later_semesters: IClearedSubjectItem[];
  active_arrears_in_sem: number;
  has_active_arrear: boolean;
  remarks: string;
}

export interface IArrearStatistics {
  historicalArrearsCount: number; // Total Arrear History
  activeArrearsCount: number;     // Current Active Arrears (latest status NOT CLEARED)
  clearedCount: number;           // Cleared Arrears
  clearedSubjects: IClearedSubjectItem[];
  activeArrearSubjects: string[];
  arrearHistory: IArrearHistoryRecord[]; // Complete separate arrear history
  statusLabel: string;
  formattedSemesters: IFormattedSemester[];
}

/**
 * Parses a string of arrear subject codes (e.g. "24ITT36, 24ITT40", "CS8301/MA8451")
 */
export function parseSubjectCodes(subjectsStr?: string): string[] {
  if (!subjectsStr || !subjectsStr.trim()) return [];
  return subjectsStr
    .split(/[,;/|\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && !['NIL', 'NONE', 'CLEAR', 'REGULAR', 'NA', 'N/A', '—', '-'].includes(s));
}

/**
 * Calculate historical vs active arrear statistics with full history preservation.
 *
 * BUSINESS RULES:
 * 1. If uncleared:
 *    Semester Arrears = 1, Arrear Subject = "24ITT36", Status = "Active Arrear"
 * 2. When cleared:
 *    Do NOT delete arrear history.
 *    Original semester displays: Semester Arrears = 0, Arrear Subject = "—", Status = "24ITT36 Cleared"
 * 3. Separate Arrear History tracks:
 *    Subject, Original Semester, Attempt, Status (Arrear / Cleared), Cleared In, Date, Remarks
 * 4. Current Arrears counts ONLY subjects whose latest status is NOT "CLEARED".
 */
export function calculateArrearStatistics(
  semesters: any[],
  studentClearedSubjects: IClearedSubjectItem[] = [],
  savedArrearHistory: any[] = []
): IArrearStatistics {
  // 1. Gather all cleared subject declarations
  const clearedMap = new Map<string, IClearedSubjectItem>();

  (studentClearedSubjects || []).forEach((c) => {
    if (c && c.subjectCode) {
      const code = c.subjectCode.trim().toUpperCase();
      clearedMap.set(code, {
        subjectCode: code,
        clearedInSemester: Number(c.clearedInSemester) || 0,
        originalSemester: c.originalSemester ? Number(c.originalSemester) : undefined,
        clearedDate: c.clearedDate || '',
        remarks: c.remarks || `${code} Cleared`,
        attempt: Number(c.attempt) || 1,
      });
    }
  });

  (semesters || []).forEach((sem) => {
    const semNum = Number(sem.semesterNumber || sem.semester_number) || 0;
    if (Array.isArray(sem.clearedSubjects)) {
      sem.clearedSubjects.forEach((c: any) => {
        if (c && c.subjectCode) {
          const code = c.subjectCode.trim().toUpperCase();
          if (!clearedMap.has(code)) {
            clearedMap.set(code, {
              subjectCode: code,
              clearedInSemester: Number(c.clearedInSemester) || semNum,
              originalSemester: c.originalSemester ? Number(c.originalSemester) : undefined,
              clearedDate: c.clearedDate || '',
              remarks: c.remarks || `${code} Cleared`,
              attempt: Number(c.attempt) || 1,
            });
          }
        }
      });
    }
  });

  // Map of saved arrear history for attempts and custom metadata
  const savedHistoryMap = new Map<string, any>();
  (savedArrearHistory || []).forEach((h) => {
    if (h && h.subjectCode) {
      savedHistoryMap.set(h.subjectCode.trim().toUpperCase(), h);
    }
  });

  const allClearedList = Array.from(clearedMap.values());

  // 2. Map semesters 1 to 8
  const semMap = new Map<number, any>();
  (semesters || []).forEach((sem) => {
    const semNum = Number(sem.semesterNumber || sem.semester_number);
    if (semNum >= 1 && semNum <= 8) {
      semMap.set(semNum, sem);
    }
  });

  const formattedSemesters: IFormattedSemester[] = [];
  const arrearHistory: IArrearHistoryRecord[] = [];
  const activeArrearSubjects: string[] = [];
  let totalHistoricalArrears = 0;

  for (let semNum = 1; semNum <= 8; semNum++) {
    const semDoc = semMap.get(semNum);
    const cgpa = semDoc && semDoc.cgpa !== undefined ? Number(semDoc.cgpa) : 0;
    const sgpa = semDoc && semDoc.sgpa !== undefined ? Number(semDoc.sgpa) : (cgpa > 0 ? cgpa : 0);
    const historicalArrears = semDoc && semDoc.arrearsCount !== undefined
      ? Number(semDoc.arrearsCount)
      : (semDoc && semDoc.arrears_count !== undefined ? Number(semDoc.arrears_count) : 0);
    const originalArrearsSubjects = semDoc ? (semDoc.arrearsSubjects || semDoc.arrears_subjects || '') : '';
    const existingRemarks = semDoc ? (semDoc.remarks || '') : '';

    const incurredCodes = parseSubjectCodes(originalArrearsSubjects);
    const numArrearsIncurred = Math.max(historicalArrears, incurredCodes.length);
    totalHistoricalArrears += numArrearsIncurred;

    const clearedInLaterSemesters: IClearedSubjectItem[] = [];
    const activeCodesInSem: string[] = [];

    if (incurredCodes.length > 0) {
      incurredCodes.forEach((code) => {
        const clearedInfo = clearedMap.get(code);
        const savedHist = savedHistoryMap.get(code);

        if (clearedInfo) {
          const origSem = clearedInfo.originalSemester || semNum;
          clearedInLaterSemesters.push({
            ...clearedInfo,
            originalSemester: origSem,
          });

          arrearHistory.push({
            subjectCode: code,
            originalSemester: origSem,
            attempt: savedHist?.attempt || clearedInfo.attempt || 1,
            status: 'CLEARED',
            statusLabel: 'Cleared',
            clearedInSemester: clearedInfo.clearedInSemester,
            clearedDate: clearedInfo.clearedDate || null,
            remarks: clearedInfo.remarks || `${code} Cleared in Semester 0${clearedInfo.clearedInSemester}`,
          });
        } else {
          activeCodesInSem.push(code);
          activeArrearSubjects.push(code);

          arrearHistory.push({
            subjectCode: code,
            originalSemester: semNum,
            attempt: savedHist?.attempt || 1,
            status: 'ACTIVE',
            statusLabel: 'Active Arrear',
            clearedInSemester: null,
            clearedDate: null,
            remarks: 'Active Arrear — Pending Clearance',
          });
        }
      });
    } else if (numArrearsIncurred > 0) {
      // Historical arrears count present without explicit subject codes
      const clearedForThisSem = allClearedList.filter(
        (c) => c.originalSemester === semNum
      );
      clearedInLaterSemesters.push(...clearedForThisSem);

      clearedForThisSem.forEach((c) => {
        arrearHistory.push({
          subjectCode: c.subjectCode,
          originalSemester: semNum,
          attempt: c.attempt || 1,
          status: 'CLEARED',
          statusLabel: 'Cleared',
          clearedInSemester: c.clearedInSemester,
          clearedDate: c.clearedDate || null,
          remarks: c.remarks || `${c.subjectCode} Cleared in Semester 0${c.clearedInSemester}`,
        });
      });

      const remainingActive = Math.max(0, numArrearsIncurred - clearedForThisSem.length);
      for (let i = 1; i <= remainingActive; i++) {
        const placeholderCode = `SEM0${semNum}_ARREAR_${i}`;
        activeCodesInSem.push(placeholderCode);
        activeArrearSubjects.push(placeholderCode);

        arrearHistory.push({
          subjectCode: placeholderCode,
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

    // Subjects cleared IN this semester (e.g. clearedInSemester === semNum)
    const subjectsClearedInThisSem = allClearedList.filter(
      (c) => c.clearedInSemester === semNum
    );

    // Business Rule 2 & 5:
    // If all arrears in this semester are cleared:
    // - Semester Arrears = 0
    // - Arrear Subjects = "—"
    // - Clearance Remarks & Status = `${subjectCode} Cleared`
    // If active arrear present:
    // - Semester Arrears = active count (e.g. 1)
    // - Arrear Subjects = active subject codes (e.g. "24ITT36")
    // - Clearance Remarks & Status = "Active Arrear"
    const activeCountInSem = activeCodesInSem.length;
    const currentSemesterArrears = activeCountInSem;
    const displayArrearSubjects = activeCountInSem > 0 ? activeCodesInSem.join(', ') : '—';

    let semStatus: 'Clear' | 'Active Arrear' | 'Cleared' = 'Clear';
    let semStatusLabel = 'Clear';
    let clearanceRemarks = '';

    if (activeCountInSem > 0) {
      semStatus = 'Active Arrear';
      semStatusLabel = 'Active Arrear';
      clearanceRemarks = clearedInLaterSemesters.length > 0
        ? `${clearedInLaterSemesters.map((c) => `${c.subjectCode} Cleared`).join(', ')} / Active Arrear`
        : 'Active Arrear';
    } else if (numArrearsIncurred > 0 && activeCountInSem === 0) {
      semStatus = 'Cleared';
      semStatusLabel = 'Cleared';
      const clearedLabels = clearedInLaterSemesters.map((c) => `${c.subjectCode} Cleared`).join(', ');
      clearanceRemarks = clearedLabels || 'Cleared';
    } else {
      semStatus = 'Clear';
      semStatusLabel = 'Clear';
      if (subjectsClearedInThisSem.length > 0) {
        clearanceRemarks = `${subjectsClearedInThisSem.map((c) => `${c.subjectCode} Cleared`).join(', ')} / Clear`;
      } else {
        clearanceRemarks = existingRemarks.trim() || 'Clear / Regular';
      }
    }

    formattedSemesters.push({
      semester_number: semNum,
      cgpa,
      sgpa,
      arrears_count: currentSemesterArrears, // 0 if cleared!
      historical_arrears_count: numArrearsIncurred, // Preserved history
      arrears_subjects: displayArrearSubjects, // "—" if cleared!
      original_arrears_subjects: originalArrearsSubjects,
      status: semStatus,
      status_label: semStatusLabel,
      clearance_remarks: clearanceRemarks,
      cleared_subjects: subjectsClearedInThisSem,
      cleared_in_later_semesters: clearedInLaterSemesters,
      active_arrears_in_sem: activeCountInSem,
      has_active_arrear: activeCountInSem > 0,
      remarks: clearanceRemarks,
    });
  }

  // Business Rule 4: Current arrears must count ONLY subjects whose latest status is NOT "CLEARED"
  const activeArrearsCount = arrearHistory.filter((a) => a.status === 'ACTIVE').length;
  const clearedCount = arrearHistory.filter((a) => a.status === 'CLEARED').length;
  const totalHistoryCount = arrearHistory.length;

  const statusLabel =
    activeArrearsCount === 0
      ? '🟢 No Active Arrears'
      : `🔴 ${activeArrearsCount} Active Arrear${activeArrearsCount > 1 ? 's' : ''}`;

  return {
    historicalArrearsCount: totalHistoryCount,
    activeArrearsCount,
    clearedCount,
    clearedSubjects: allClearedList,
    activeArrearSubjects,
    arrearHistory,
    statusLabel,
    formattedSemesters,
  };
}
