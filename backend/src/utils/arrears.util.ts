export interface IClearedSubjectItem {
  subjectCode: string;
  clearedInSemester: number;
  originalSemester?: number;
  clearedDate?: string;
  remarks?: string;
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

export interface IFormattedSemester {
  semester_number: number;
  cgpa: number;
  sgpa: number;
  arrears_count: number;
  arrears_subjects: string;
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
  statusLabel: string;
  formattedSemesters: IFormattedSemester[];
}

/**
 * Parses a string of arrear subject codes (e.g. "CS8301, CS8302", "CS8401/MA8451")
 */
export function parseSubjectCodes(subjectsStr?: string): string[] {
  if (!subjectsStr || !subjectsStr.trim()) return [];
  return subjectsStr
    .split(/[,;/|\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length >= 2 && !['NIL', 'NONE', 'CLEAR', 'REGULAR', 'NA', 'N/A'].includes(s));
}

/**
 * Calculate historical vs active arrear statistics preserving complete semester history.
 * Under no circumstances does clearing an arrear mutate the historical semester's arrear count.
 */
export function calculateArrearStatistics(
  semesters: any[],
  studentClearedSubjects: IClearedSubjectItem[] = []
): IArrearStatistics {
  // 1. Gather all cleared subject declarations
  const clearedMap = new Map<string, IClearedSubjectItem>();

  // Add student-level cleared subjects
  (studentClearedSubjects || []).forEach((c) => {
    if (c && c.subjectCode) {
      clearedMap.set(c.subjectCode.trim().toUpperCase(), {
        subjectCode: c.subjectCode.trim().toUpperCase(),
        clearedInSemester: Number(c.clearedInSemester) || 0,
        originalSemester: c.originalSemester ? Number(c.originalSemester) : undefined,
        clearedDate: c.clearedDate || '',
        remarks: c.remarks || `${c.subjectCode.trim().toUpperCase()} Cleared`,
      });
    }
  });

  // Add semester-level cleared subjects
  (semesters || []).forEach((sem) => {
    const semNum = Number(sem.semesterNumber || sem.semester_number) || 0;
    if (Array.isArray(sem.clearedSubjects)) {
      sem.clearedSubjects.forEach((c: any) => {
        if (c && c.subjectCode) {
          const code = c.subjectCode.trim().toUpperCase();
          clearedMap.set(code, {
            subjectCode: code,
            clearedInSemester: Number(c.clearedInSemester) || semNum,
            originalSemester: c.originalSemester ? Number(c.originalSemester) : undefined,
            clearedDate: c.clearedDate || '',
            remarks: c.remarks || `${code} Cleared`,
          });
        }
      });
    }
  });

  const allClearedList = Array.from(clearedMap.values());

  // 2. Process each semester (1 to 8)
  let totalHistoricalArrears = 0;
  const activeArrearSubjects: string[] = [];
  const semMap = new Map<number, any>();

  (semesters || []).forEach((sem) => {
    const semNum = Number(sem.semesterNumber || sem.semester_number);
    if (semNum >= 1 && semNum <= 8) {
      semMap.set(semNum, sem);
    }
  });

  const formattedSemesters: IFormattedSemester[] = [];

  for (let semNum = 1; semNum <= 8; semNum++) {
    const semDoc = semMap.get(semNum);
    const cgpa = semDoc && semDoc.cgpa !== undefined ? Number(semDoc.cgpa) : 0;
    const sgpa = semDoc && semDoc.sgpa !== undefined ? Number(semDoc.sgpa) : (semDoc && semDoc.cgpa ? Number(semDoc.cgpa) : 0);
    const historicalArrears = semDoc && semDoc.arrearsCount !== undefined ? Number(semDoc.arrearsCount) : (semDoc && semDoc.arrears_count !== undefined ? Number(semDoc.arrears_count) : 0);
    const arrearsSubjects = semDoc ? (semDoc.arrearsSubjects || semDoc.arrears_subjects || '') : '';
    const existingRemarks = semDoc ? (semDoc.remarks || '') : '';

    totalHistoricalArrears += historicalArrears;

    // Subject codes incurred in this semester
    const incurredCodes = parseSubjectCodes(arrearsSubjects);
    const clearedInLaterSemesters: IClearedSubjectItem[] = [];
    let unclearedCountInSem = 0;

    if (incurredCodes.length > 0) {
      incurredCodes.forEach((code) => {
        const clearedInfo = clearedMap.get(code);
        if (clearedInfo && clearedInfo.clearedInSemester > semNum) {
          // Cleared in a subsequent semester!
          clearedInLaterSemesters.push({
            ...clearedInfo,
            originalSemester: clearedInfo.originalSemester || semNum,
          });
        } else if (clearedInfo && clearedInfo.clearedInSemester === semNum) {
          // If recorded in same semester as cleared
          clearedInLaterSemesters.push({
            ...clearedInfo,
            originalSemester: semNum,
          });
        } else {
          unclearedCountInSem++;
          activeArrearSubjects.push(code);
        }
      });
    } else if (historicalArrears > 0) {
      // Arrears count given without explicit codes
      // Check if any cleared subjects had originalSemester === semNum
      const clearedForThisSem = allClearedList.filter(
        (c) => c.originalSemester === semNum && c.clearedInSemester > semNum
      );
      clearedInLaterSemesters.push(...clearedForThisSem);
      unclearedCountInSem = Math.max(0, historicalArrears - clearedForThisSem.length);
      for (let i = 0; i < unclearedCountInSem; i++) {
        activeArrearSubjects.push(`Sem 0${semNum} Arrear`);
      }
    }

    // Subjects cleared IN this semester (e.g. Sem 5 where CS8301 was cleared)
    const subjectsClearedInThisSem = allClearedList.filter(
      (c) => c.clearedInSemester === semNum
    );

    // Compute display remarks for this semester
    let displayRemarks = existingRemarks.trim();
    if (!displayRemarks) {
      if (subjectsClearedInThisSem.length > 0) {
        const clearedCodesStr = subjectsClearedInThisSem.map((c) => `${c.subjectCode} Cleared`).join(', ');
        displayRemarks = historicalArrears === 0 ? `${clearedCodesStr} / Clear` : clearedCodesStr;
      } else if (historicalArrears === 0) {
        displayRemarks = 'Clear / Regular';
      } else {
        displayRemarks = arrearsSubjects ? `${arrearsSubjects}` : `${historicalArrears} Arrear${historicalArrears > 1 ? 's' : ''}`;
      }
    }

    formattedSemesters.push({
      semester_number: semNum,
      cgpa,
      sgpa,
      arrears_count: historicalArrears, // PRESERVED HISTORICAL VALUE!
      arrears_subjects: arrearsSubjects,
      cleared_subjects: subjectsClearedInThisSem,
      cleared_in_later_semesters: clearedInLaterSemesters,
      active_arrears_in_sem: unclearedCountInSem,
      has_active_arrear: unclearedCountInSem > 0,
      remarks: displayRemarks,
    });
  }

  // Active arrears count
  const activeArrearsCount = Math.max(0, totalHistoricalArrears - allClearedList.length);
  const statusLabel =
    activeArrearsCount === 0
      ? '🟢 No Active Arrears'
      : `🔴 ${activeArrearsCount} Active Arrear${activeArrearsCount > 1 ? 's' : ''}`;

  return {
    historicalArrearsCount: totalHistoricalArrears,
    activeArrearsCount,
    clearedCount: allClearedList.length,
    clearedSubjects: allClearedList,
    activeArrearSubjects,
    statusLabel,
    formattedSemesters,
  };
}
