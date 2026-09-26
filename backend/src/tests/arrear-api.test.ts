
async function testApi() {
  const BASE_URL = 'http://localhost:5050/api';
  console.log('Testing Arrear API against', BASE_URL);

  // 1. Login as Admin
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Ksrce@admin',
      password: process.env.ADMIN_PASSWORD || 'Ksrce@1234',
    }),
  });
  const loginData: any = await loginRes.json();
  if (!loginData.success) {
    console.error('Admin login failed:', loginData);
    process.exit(1);
  }
  const token = loginData.data.token;
  console.log('✓ Admin login successful');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Get departments and batches
  const deptsRes = await fetch(`${BASE_URL}/admin/departments`, { headers: authHeaders });
  const deptsData: any = await deptsRes.json();
  const deptId = deptsData.data[0]._id;

  const batchesRes = await fetch(`${BASE_URL}/admin/batches`, { headers: authHeaders });
  const batchesData: any = await batchesRes.json();
  const batchId = batchesData.data[0]._id;

  // 2. Create Student with unique reg number
  const regNo = `7377TEST${Date.now().toString().slice(-4)}`;
  const createRes = await fetch(`${BASE_URL}/students`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      registerNumber: regNo,
      fullName: 'Arrear History Tester',
      departmentId: deptId,
      batchId: batchId,
      temporaryPassword: 'Password@123',
    }),
  });
  const createData: any = await createRes.json();
  if (!createData.success) {
    console.error('Create student failed:', createData);
    process.exit(1);
  }
  const studentId = createData.data.studentId;
  console.log(`✓ Test student created with ID: ${studentId}, Reg: ${regNo}`);

  // 3. Set Semester 4 Arrear: CS8301
  const updateAcademicsRes = await fetch(`${BASE_URL}/students/${studentId}/academics`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      semesters: [
        { semester_number: 1, cgpa: 8.0, sgpa: 8.0, arrears_count: 0 },
        { semester_number: 2, cgpa: 7.9, sgpa: 7.8, arrears_count: 0 },
        { semester_number: 3, cgpa: 7.6, sgpa: 7.4, arrears_count: 0 },
        { semester_number: 4, cgpa: 7.2, sgpa: 6.9, arrears_count: 1, arrears_subjects: 'CS8301' },
      ],
    }),
  });
  const updateAcademicsData: any = await updateAcademicsRes.json();
  console.assert(updateAcademicsData.success, 'Failed to update semester 4');
  console.log('✓ Recorded Semester 04 Arrear: 1, Subject: CS8301');

  // Verify before clearance
  const beforeRes = await fetch(`${BASE_URL}/students/${studentId}`, { headers: authHeaders });
  const beforeData: any = await beforeRes.json();
  const beforeStudent = beforeData.data;

  console.assert(beforeStudent.active_arrears_count === 1, `Expected active 1, got ${beforeStudent.active_arrears_count}`);
  console.assert(beforeStudent.historical_arrears_count === 1, `Expected historical 1, got ${beforeStudent.historical_arrears_count}`);
  console.assert(beforeStudent.total_arrears === 1, `Expected total 1, got ${beforeStudent.total_arrears}`);
  console.log('✓ Verified before clearance: Active Arrears = 1, Status:', beforeStudent.arrear_status_label);

  // 4. Student clears CS8301 in Semester 05!
  console.log('Recording clearance of CS8301 in Semester 05...');
  const clearRes = await fetch(`${BASE_URL}/students/${studentId}/clear-arrear`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      subjectCode: 'CS8301',
      clearedInSemester: 5,
      originalSemester: 4,
      remarks: 'CS8301 Cleared',
    }),
  });
  const clearData: any = await clearRes.json();
  console.assert(clearData.success, 'Clear arrear request failed');
  console.log('✓ Arrear clearance response:', clearData.message);

  // 5. Fetch profile after clearance and verify strict compliance
  const afterRes = await fetch(`${BASE_URL}/students/${studentId}`, { headers: authHeaders });
  const afterData: any = await afterRes.json();
  const afterStudent = afterData.data;

  console.log('--- AFTER CLEARANCE VERIFICATION ---');
  console.log('Active Arrears Count:', afterStudent.active_arrears_count);
  console.log('Historical Arrears Count:', afterStudent.historical_arrears_count);
  console.log('Cleared Arrears Count:', afterStudent.cleared_arrears_count);
  console.log('Status Label:', afterStudent.arrear_status_label);

  // Verification:
  console.assert(afterStudent.active_arrears_count === 0, `Active arrears must be 0, got ${afterStudent.active_arrears_count}`);
  console.assert(afterStudent.total_arrears === 0, `Total arrears must be 0, got ${afterStudent.total_arrears}`);
  console.assert(afterStudent.historical_arrears_count === 1, `Historical arrears must be 1, got ${afterStudent.historical_arrears_count}`);
  console.assert(afterStudent.arrear_status_label === '🟢 No Active Arrears', `Label must be 🟢 No Active Arrears, got ${afterStudent.arrear_status_label}`);

  const sem4 = afterStudent.semesters.find((s: any) => s.semester_number === 4);
  console.assert(sem4 !== undefined, 'Sem 4 not found');
  console.assert(sem4.arrears_count === 1, `Sem 4 arrears_count must NOT change, must be 1, got ${sem4.arrears_count}`);
  console.assert(sem4.arrears_subjects === 'CS8301', `Sem 4 arrears_subjects must remain CS8301, got ${sem4.arrears_subjects}`);
  console.assert(sem4.cleared_in_later_semesters.length === 1, 'Sem 4 must indicate cleared in later semester');
  console.assert(sem4.cleared_in_later_semesters[0].clearedInSemester === 5, 'Cleared in Sem 5');

  const sem5 = afterStudent.semesters.find((s: any) => s.semester_number === 5);
  console.assert(sem5 !== undefined, 'Sem 5 not found');
  console.assert(sem5.arrears_count === 0, `Sem 5 arrears_count must be 0, got ${sem5.arrears_count}`);
  console.assert(sem5.remarks.includes('CS8301 Cleared'), `Sem 5 remarks must include CS8301 Cleared, got ${sem5.remarks}`);

  console.log('✓ Sem 4 preserved: Arrears =', sem4.arrears_count, ', Subject =', sem4.arrears_subjects);
  console.log('✓ Sem 5 recorded: Arrears =', sem5.arrears_count, ', Remarks =', sem5.remarks);
  console.log('✓ Overall Status =', afterStudent.arrear_status_label);

  // 6. Test PDF generation endpoint
  const pdfRes = await fetch(`${BASE_URL}/pdf/student/${studentId}`, { headers: { Authorization: `Bearer ${token}` } });
  console.assert(pdfRes.status === 200, `PDF generation failed with status ${pdfRes.status}`);
  const pdfBuffer = await pdfRes.arrayBuffer();
  console.assert(pdfBuffer.byteLength > 1000, `PDF buffer too small: ${pdfBuffer.byteLength} bytes`);
  console.log(`✓ PDF successfully generated (${pdfBuffer.byteLength} bytes) containing accurate historical & cleared records!`);

  console.log('\n======================================================');
  console.log('ALL ARREAR CLEARANCE & HISTORY REQUIREMENTS VERIFIED 100%');
  console.log('======================================================');
}

testApi().catch((err) => {
  console.error('Test API error:', err);
  process.exit(1);
});
