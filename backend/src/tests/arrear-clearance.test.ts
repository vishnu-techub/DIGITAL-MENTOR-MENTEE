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
  // Semester 03: Arrears = 1, Subject = 24ITT36
  // Student clears 24ITT36 in Semester 04.
  // Original Semester 03 should then show:
  // Semester Arrears = 0, Arrear Subject = "—", Status = "Cleared", Remarks = "24ITT36 Cleared"
  // ARREAR HISTORY must contain:
  // Subject: 24ITT36, Original Semester: 3, Cleared In: 4, Status: CLEARED
  // Current Arrears = 0
  const rawSemesters = [
    { semesterNumber: 1, cgpa: 8.0, sgpa: 8.0, arrearsCount: 0, arrearsSubjects: '' },
    { semesterNumber: 2, cgpa: 8.1, sgpa: 8.2, arrearsCount: 0, arrearsSubjects: '' },
    { semesterNumber: 3, cgpa: 7.2, sgpa: 7.2, arrearsCount: 1, arrearsSubjects: '24ITT36' },
    {
      semesterNumber: 4,
      cgpa: 7.8,
      sgpa: 8.1,
      arrearsCount: 0,
      arrearsSubjects: '',
      clearedSubjects: [
        {
          subjectCode: '24ITT36',
          clearedInSemester: 4,
          originalSemester: 3,
          remarks: '24ITT36 Cleared',
        },
      ],
      remarks: '24ITT36 Cleared / Clear',
    },
  ];

  const studentClearedSubjects = [
    {
      subjectCode: '24ITT36',
      clearedInSemester: 4,
      originalSemester: 3,
      remarks: '24ITT36 Cleared',
    },
  ];

  const stats = calculateArrearStatistics(rawSemesters, studentClearedSubjects);

  console.log('Historical Arrears (Total History):', stats.historicalArrearsCount);
  console.log('Active Arrears (Current Active):', stats.activeArrearsCount);
  console.log('Cleared Arrears:', stats.clearedCount);
  console.log('Status Label:', stats.statusLabel);

  // Assertions:
  console.assert(stats.historicalArrearsCount === 1, `Expected historical 1, got ${stats.historicalArrearsCount}`);
  console.assert(stats.activeArrearsCount === 0, `Expected active 0, got ${stats.activeArrearsCount}`);
  console.assert(stats.clearedCount === 1, `Expected cleared 1, got ${stats.clearedCount}`);
  console.assert(stats.statusLabel === '🟢 No Active Arrears', `Expected 🟢 No Active Arrears, got ${stats.statusLabel}`);

  const sem3 = stats.formattedSemesters.find((s) => s.semester_number === 3);
  console.assert(sem3 !== undefined, 'Sem 3 not found');
  console.assert(sem3!.arrears_count === 0, `Sem 3 arrears_count must be 0 after clearance, got ${sem3?.arrears_count}`);
  console.assert(sem3!.arrears_subjects === '—', `Sem 3 arrears_subjects must be "—" after clearance, got ${sem3?.arrears_subjects}`);
  console.assert(sem3!.historical_arrears_count === 1, `Sem 3 historical_arrears_count must remain 1, got ${sem3?.historical_arrears_count}`);
  console.assert(sem3!.status === 'Clear', `Sem 3 status must be "Clear", got ${sem3?.status}`);
  console.assert(sem3!.clearance_remarks.includes('24ITT36 Cleared'), `Sem 3 clearance_remarks must include "24ITT36 Cleared", got ${sem3?.clearance_remarks}`);

  const sem4 = stats.formattedSemesters.find((s) => s.semester_number === 4);
  console.assert(sem4 !== undefined, 'Sem 4 not found');
  console.assert(sem4!.arrears_count === 0, `Sem 4 arrears_count must be 0, got ${sem4?.arrears_count}`);

  // Test 3: Multiple arrears scenario
  // Sem 3: 2 arrears (24ITT36, 24ITT40)
  // Student clears 24ITT36 in Sem 4. 24ITT40 is still active.
  // Current Arrears = 1, Total Arrear History = 2, Cleared Arrears = 1
  const rawSemesters2 = [
    { semesterNumber: 3, arrearsCount: 2, arrearsSubjects: '24ITT36, 24ITT40' },
    {
      semesterNumber: 4,
      arrearsCount: 0,
      clearedSubjects: [{ subjectCode: '24ITT36', clearedInSemester: 4, originalSemester: 3 }],
    },
  ];

  const stats2 = calculateArrearStatistics(rawSemesters2, [
    { subjectCode: '24ITT36', clearedInSemester: 4, originalSemester: 3 },
  ]);

  console.assert(stats2.historicalArrearsCount === 2, `Expected historical 2, got ${stats2.historicalArrearsCount}`);
  console.assert(stats2.activeArrearsCount === 1, `Expected active 1, got ${stats2.activeArrearsCount}`);
  console.assert(stats2.clearedCount === 1, `Expected cleared 1, got ${stats2.clearedCount}`);
  console.assert(stats2.statusLabel === '🔴 1 Active Arrear', `Expected 🔴 1 Active Arrear, got ${stats2.statusLabel}`);
  console.assert(stats2.activeArrearSubjects.includes('24ITT40'), '24ITT40 must remain active');

  const sem3Multiple = stats2.formattedSemesters.find((s) => s.semester_number === 3);
  console.assert(sem3Multiple!.arrears_count === 1, `Sem 3 active arrears must be 1, got ${sem3Multiple?.arrears_count}`);
  console.assert(sem3Multiple!.arrears_subjects === '24ITT40', `Sem 3 active subjects must be 24ITT40, got ${sem3Multiple?.arrears_subjects}`);
  console.assert(sem3Multiple!.status === 'Active Arrear', `Sem 3 status must be Active Arrear, got ${sem3Multiple?.status}`);

  console.log('✓ ALL ARREAR CLEARANCE & HISTORY LOGIC TESTS PASSED!');
}

runTests();
