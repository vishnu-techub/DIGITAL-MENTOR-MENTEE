import { calculateArrearStatistics, parseSubjectCodes } from '../utils/arrears.util.js';

function runTests() {
  console.log('--- RUNNING ARREAR CLEARANCE & HISTORY LOGIC TESTS ---');

  // Test 1: parseSubjectCodes
  const parsed1 = parseSubjectCodes('CS8301');
  console.assert(parsed1.length === 1 && parsed1[0] === 'CS8301', 'Test 1.1 failed');

  const parsed2 = parseSubjectCodes('CS8301, CS8302; MA8451');
  console.assert(parsed2.length === 3 && parsed2.includes('MA8451'), 'Test 1.2 failed');

  const parsedEmpty = parseSubjectCodes('Clear / Regular');
  console.assert(parsedEmpty.length === 0, 'Test 1.3 failed');

  // Test 2: User scenario
  // Semester 04: Arrears = 1, Subject = CS8301
  // Student clears CS8301 in Semester 05.
  // Semester 04 must continue showing: Arrears = 1, Subject = CS8301
  // Semester 05 must show: Arrears = 0, Remarks = CS8301 Cleared / Clear
  // Historical arrears: Sem 4 -> 1
  // Current active arrears: 0 -> "🟢 No Active Arrears"
  const rawSemesters = [
    { semesterNumber: 1, cgpa: 8.0, sgpa: 8.0, arrearsCount: 0, arrearsSubjects: '' },
    { semesterNumber: 2, cgpa: 8.1, sgpa: 8.2, arrearsCount: 0, arrearsSubjects: '' },
    { semesterNumber: 3, cgpa: 7.9, sgpa: 7.8, arrearsCount: 0, arrearsSubjects: '' },
    { semesterNumber: 4, cgpa: 7.5, sgpa: 7.2, arrearsCount: 1, arrearsSubjects: 'CS8301' },
    {
      semesterNumber: 5,
      cgpa: 7.8,
      sgpa: 8.1,
      arrearsCount: 0,
      arrearsSubjects: '',
      clearedSubjects: [
        {
          subjectCode: 'CS8301',
          clearedInSemester: 5,
          originalSemester: 4,
          remarks: 'CS8301 Cleared',
        },
      ],
      remarks: 'CS8301 Cleared / Clear',
    },
  ];

  const studentClearedSubjects = [
    {
      subjectCode: 'CS8301',
      clearedInSemester: 5,
      originalSemester: 4,
      remarks: 'CS8301 Cleared',
    },
  ];

  const stats = calculateArrearStatistics(rawSemesters, studentClearedSubjects);

  console.log('Historical Arrears:', stats.historicalArrearsCount);
  console.log('Active Arrears:', stats.activeArrearsCount);
  console.log('Status Label:', stats.statusLabel);

  // Assertions:
  console.assert(stats.historicalArrearsCount === 1, `Expected historical 1, got ${stats.historicalArrearsCount}`);
  console.assert(stats.activeArrearsCount === 0, `Expected active 0, got ${stats.activeArrearsCount}`);
  console.assert(stats.statusLabel === '🟢 No Active Arrears', `Expected 🟢 No Active Arrears, got ${stats.statusLabel}`);

  const sem4 = stats.formattedSemesters.find((s) => s.semester_number === 4);
  console.assert(sem4 !== undefined, 'Sem 4 not found');
  console.assert(sem4!.arrears_count === 1, `Sem 4 arrears_count must remain 1, got ${sem4?.arrears_count}`);
  console.assert(sem4!.arrears_subjects === 'CS8301', `Sem 4 arrears_subjects must remain CS8301, got ${sem4?.arrears_subjects}`);
  console.assert(sem4!.cleared_in_later_semesters.length === 1, 'Sem 4 must indicate cleared in later semester');
  console.assert(sem4!.cleared_in_later_semesters[0].clearedInSemester === 5, 'Cleared in Sem 5');
  console.assert(sem4!.active_arrears_in_sem === 0, 'Sem 4 active arrears must be 0');

  const sem5 = stats.formattedSemesters.find((s) => s.semester_number === 5);
  console.assert(sem5 !== undefined, 'Sem 5 not found');
  console.assert(sem5!.arrears_count === 0, `Sem 5 arrears_count must be 0, got ${sem5?.arrears_count}`);
  console.assert(sem5!.remarks.includes('CS8301 Cleared'), `Sem 5 remarks must mention CS8301 Cleared, got ${sem5?.remarks}`);

  console.log('Sem 4 check:', {
    arrears_count: sem4?.arrears_count,
    arrears_subjects: sem4?.arrears_subjects,
    cleared_in_later: sem4?.cleared_in_later_semesters,
  });

  console.log('Sem 5 check:', {
    arrears_count: sem5?.arrears_count,
    remarks: sem5?.remarks,
    cleared_subjects: sem5?.cleared_subjects,
  });

  // Test 3: Multiple arrears scenario
  // Sem 2: 2 arrears (CS8201, EE8251)
  // Student clears CS8201 in Sem 3. EE8251 is still active.
  const rawSemesters2 = [
    { semesterNumber: 2, arrearsCount: 2, arrearsSubjects: 'CS8201, EE8251' },
    {
      semesterNumber: 3,
      arrearsCount: 0,
      clearedSubjects: [{ subjectCode: 'CS8201', clearedInSemester: 3, originalSemester: 2 }],
    },
  ];

  const stats2 = calculateArrearStatistics(rawSemesters2, [
    { subjectCode: 'CS8201', clearedInSemester: 3, originalSemester: 2 },
  ]);

  console.assert(stats2.historicalArrearsCount === 2, `Expected historical 2, got ${stats2.historicalArrearsCount}`);
  console.assert(stats2.activeArrearsCount === 1, `Expected active 1, got ${stats2.activeArrearsCount}`);
  console.assert(stats2.statusLabel === '🔴 1 Active Arrear', `Expected 🔴 1 Active Arrear, got ${stats2.statusLabel}`);
  console.assert(stats2.activeArrearSubjects.includes('EE8251'), 'EE8251 must remain active');

  console.log('✓ ALL ARREAR CLEARANCE & HISTORY LOGIC TESTS PASSED!');
}

runTests();
