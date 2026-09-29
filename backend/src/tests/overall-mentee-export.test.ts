import assert from 'assert';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { connectDB, closeDB } from '../config/database.js';
import { ensureSystemBootstrap } from '../database/bootstrap.js';
import {
  User,
  Student,
  Faculty,
  Department,
  Batch,
  AcademicRecord,
  MentorAssignment,
  CounsellingRecord,
  StudentDocument,
  MonthlyProgress,
} from '../models/index.js';
import { generateMentorMenteesExcel } from '../modules/mentorship/mentor-export.service.js';

async function runOverallMenteeExportTest() {
  console.log('================================================================');
  console.log('KSRCE OVERALL MENTEE DATA EXPORT TEST');
  console.log('VERIFYING INSTITUTIONAL EXCEL GENERATION & REASSIGNMENT SECURITY');
  console.log('================================================================\n');

  await connectDB();
  await ensureSystemBootstrap();

  const itDept = await Department.findOne({ code: 'IT' }) || await Department.findOne();
  assert(itDept, 'Department must exist');
  const batch = await Batch.findOne({ name: '2023-2027' }) || await Batch.findOne();
  assert(batch, 'Batch must exist');
  const adminUser = await User.findOne({ role: 'ADMIN' });
  assert(adminUser, 'Admin must exist');

  // 1. Create Test Mentors A and B
  const salt = await bcrypt.hash('Password@123', 10);

  let userMentorA = await User.findOne({ username: 'test_export_mentor_a' });
  if (!userMentorA) {
    userMentorA = await User.create({
      username: 'test_export_mentor_a',
      passwordHash: salt,
      role: 'FACULTY',
      email: 'test_export_mentor_a@ksrce.ac.in',
      fullName: 'Dr. S. Pavithra',
      department: itDept._id,
      isActive: true,
    });
  }

  let facultyMentorA = await Faculty.findOne({ user: userMentorA._id });
  if (!facultyMentorA) {
    facultyMentorA = await Faculty.create({
      user: userMentorA._id,
      employeeId: 'TEST-FAC-EXPORT-01',
      department: itDept._id,
      designation: 'Associate Professor',
      cabinLocation: 'IT Block 3rd Floor',
      maxMentees: 25,
      isActive: true,
    });
  }

  let userMentorB = await User.findOne({ username: 'test_export_mentor_b' });
  if (!userMentorB) {
    userMentorB = await User.create({
      username: 'test_export_mentor_b',
      passwordHash: salt,
      role: 'FACULTY',
      email: 'test_export_mentor_b@ksrce.ac.in',
      fullName: 'Dr. M. Karthik',
      department: itDept._id,
      isActive: true,
    });
  }

  let facultyMentorB = await Faculty.findOne({ user: userMentorB._id });
  if (!facultyMentorB) {
    facultyMentorB = await Faculty.create({
      user: userMentorB._id,
      employeeId: 'TEST-FAC-EXPORT-02',
      department: itDept._id,
      designation: 'Assistant Professor',
      cabinLocation: 'IT Block 2nd Floor',
      maxMentees: 25,
      isActive: true,
    });
  }

  // 2. Create Test Students
  // Student 1: All Clear Student
  const reg1 = '731523205001';
  let stu1User = await User.findOne({ username: reg1 });
  if (!stu1User) {
    stu1User = await User.create({
      username: reg1,
      passwordHash: salt,
      role: 'STUDENT',
      email: `${reg1}@ksrce.ac.in`,
      fullName: 'Aravind Kumar K',
      department: itDept._id,
      isActive: true,
    });
  }

  let stu1 = await Student.findOne({ registerNumber: reg1 });
  if (!stu1) {
    stu1 = await Student.create({
      user: stu1User._id,
      registerNumber: reg1,
      fullName: 'Aravind Kumar K',
      department: itDept._id,
      batch: batch._id,
      year: 3,
      section: 'A',
      residentialType: 'DAY_SCHOLAR',
      mobileNumber: '9876543210',
      isActive: true,
      profileCompleted: true,
    });
  }

  // Student 2: Arrear Student with Achievements & Placement
  const reg2 = '731523205002';
  let stu2User = await User.findOne({ username: reg2 });
  if (!stu2User) {
    stu2User = await User.create({
      username: reg2,
      passwordHash: salt,
      role: 'STUDENT',
      email: `${reg2}@ksrce.ac.in`,
      fullName: 'Bhavani Shankar R',
      department: itDept._id,
      isActive: true,
    });
  }

  let stu2 = await Student.findOne({ registerNumber: reg2 });
  if (!stu2) {
    stu2 = await Student.create({
      user: stu2User._id,
      registerNumber: reg2,
      fullName: 'Bhavani Shankar R',
      department: itDept._id,
      batch: batch._id,
      year: 4,
      section: 'B',
      residentialType: 'HOSTELLER',
      mobileNumber: '9876543211',
      isActive: true,
      profileCompleted: true,
    });
  }

  // 3. Clear any existing active assignments for test students
  await MentorAssignment.deleteMany({
    student: { $in: [stu1._id, stu2._id] },
  });

  // Assign both students to Mentor A initially
  await MentorAssignment.create({
    student: stu1._id,
    mentor: facultyMentorA._id,
    department: itDept._id,
    assignedFrom: '2025-06-01',
    status: 'ACTIVE',
    assignedBy: adminUser._id,
    changeReason: 'Initial Allocation',
  });

  await MentorAssignment.create({
    student: stu2._id,
    mentor: facultyMentorA._id,
    department: itDept._id,
    assignedFrom: '2025-06-01',
    status: 'ACTIVE',
    assignedBy: adminUser._id,
    changeReason: 'Initial Allocation',
  });

  // 4. Create Academic Records
  // Student 1: 0 arrears across sem 1, 2, 3 -> ALL CLEAR
  await AcademicRecord.deleteMany({ student: { $in: [stu1._id, stu2._id] } });

  await AcademicRecord.create([
    { student: stu1._id, semesterNumber: 1, cgpa: 8.5, sgpa: 8.5, arrearsCount: 0, arrearsSubjects: '' },
    { student: stu1._id, semesterNumber: 2, cgpa: 8.7, sgpa: 8.9, arrearsCount: 0, arrearsSubjects: '' },
    { student: stu1._id, semesterNumber: 3, cgpa: 8.6, sgpa: 8.4, arrearsCount: 0, arrearsSubjects: '' },
  ]);

  // Student 2: Sem 1 has 1 active arrear, Sem 2 has 1 active arrear -> 2 ARREARS
  await AcademicRecord.create([
    { student: stu2._id, semesterNumber: 1, cgpa: 7.1, sgpa: 7.1, arrearsCount: 1, arrearsSubjects: '24ITT11' },
    { student: stu2._id, semesterNumber: 2, cgpa: 7.2, sgpa: 7.3, arrearsCount: 1, arrearsSubjects: '24ITT22' },
  ]);

  // 5. Create Documents (Certificates)
  await StudentDocument.deleteMany({ studentId: { $in: [stu1._id, stu2._id] } });

  await StudentDocument.create([
    {
      studentId: stu1._id,
      documentType: 'certificate',
      fileName: 'nptel_cloud.pdf',
      fileUrl: '/uploads/documents/nptel_cloud.pdf',
      title: 'Cloud Computing (Elite)',
      category: 'NPTEL Certificate',
      verificationStatus: 'Verified',
    },
    {
      studentId: stu1._id,
      documentType: 'certificate',
      fileName: 'aws_cloud.pdf',
      fileUrl: '/uploads/documents/aws_cloud.pdf',
      title: 'AWS Certified Cloud Practitioner',
      category: 'Global Certification',
      verificationStatus: 'Verified',
    },
    {
      studentId: stu2._id,
      documentType: 'certificate',
      fileName: 'sih_hackathon.pdf',
      fileUrl: '/uploads/documents/sih_hackathon.pdf',
      title: 'Smart India Hackathon 2025',
      category: 'Hackathon Certificate',
      verificationStatus: 'Verified',
    },
    {
      studentId: stu2._id,
      documentType: 'certificate',
      fileName: 'tech_symposium.pdf',
      fileUrl: '/uploads/documents/tech_symposium.pdf',
      title: 'National Level Symposium - Paper Presentation',
      category: 'Symposium',
      verificationStatus: 'Verified',
    },
    {
      studentId: stu2._id,
      documentType: 'certificate',
      fileName: 'bangalore_conclave.pdf',
      fileUrl: '/uploads/documents/bangalore_conclave.pdf',
      title: 'National Tech Conclave, Bengaluru',
      eventName: 'Other State Technical Fest',
      organizer: 'IISc Bengaluru, Karnataka',
      category: 'Technical Event',
      verificationStatus: 'Verified',
    },
    {
      studentId: stu2._id,
      documentType: 'certificate',
      fileName: 'award_webathon.pdf',
      fileUrl: '/uploads/documents/award_webathon.pdf',
      title: 'First Prize - National Webathon 2026',
      category: 'Award',
      verificationStatus: 'Verified',
    },
  ]);

  // 6. Create Counselling Record with Multi-Categories
  await CounsellingRecord.deleteMany({ student: { $in: [stu1._id, stu2._id] } });

  await CounsellingRecord.create({
    student: stu1._id,
    mentor: facultyMentorA._id,
    sessionDate: '2026-03-14',
    date: '2026-03-14',
    categories: ['Skill Development', 'Career Development'],
    challengeObserved: 'Need guidance for core cloud engineering recruitment',
    correctiveAction: 'Assigned system design tasks and mock interviews',
  });

  // 7. Create Monthly Progress with Placement Record
  await MonthlyProgress.deleteMany({ student: { $in: [stu1._id, stu2._id] } });
  await MonthlyProgress.create({
    student: stu2._id,
    mentor: facultyMentorA._id,
    academicYear: '2025-2026',
    monthName: 'February',
    placementRating: 5,
    placementNotes: 'Placed at TCS (Prime Offer)',
  });

  // ==========================================
  // TEST STEP 1: EXPORT FOR MENTOR A (Both Students)
  // ==========================================
  console.log('\n--- Step 1: Exporting overall data for Mentor A ---');
  const exportA = await generateMentorMenteesExcel(facultyMentorA._id.toString(), '2025-2026');
  assert.strictEqual(exportA.count, 2, 'Mentor A should have exactly 2 mentees');
  assert(exportA.buffer, 'Excel buffer must be generated');
  assert(exportA.filename?.startsWith('KSRCE_Mentor_Mentee_List_Dr_S_Pavithra_2025-2026.xlsx'), `Filename mismatch: ${exportA.filename}`);

  // Inspect generated workbook using ExcelJS
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exportA.buffer as any);

  // Check Sheet 1
  const ws1 = wb.getWorksheet('MENTOR MENTEE LIST');
  assert(ws1, 'Worksheet "MENTOR MENTEE LIST" must exist');

  // Verify Header Structure
  assert.strictEqual(ws1.getCell('A1').value, 'K.S.R. COLLEGE OF ENGINEERING (AUTONOMOUS), TIRUCHENGODE');
  assert.strictEqual(ws1.getCell('A2').value, 'DEPARTMENT OF INFORMATION TECHNOLOGY');
  assert.strictEqual(ws1.getCell('A3').value, 'MENTOR MENTEE LIST - DOMAIN WISE');
  assert(String(ws1.getCell('A4').value).includes('ACADEMIC YEAR: 2025-2026'));

  // Verify Columns in exact order (Row 6)
  const expectedCols = [
    'S.NO',
    'MENTOR NAME',
    'S.NO',
    'REG NUMBER',
    'STUDENT NAME (MENTEE)',
    'CLASS & SECTION',
    'NPTEL COMPLETED',
    'GLOBAL CERTIFICATION',
    'ALL CLEAR',
    'FINAL YEAR PLACED',
    'HACKATHON PARTICIPATION',
    'SYMPOSIUM PARTICIPATION',
    'PROGRAM ATTENDED IN OTHER STATE',
    'EXTENSION ACTIVITIES',
    'EXTRA CURRICULAR',
    'AWARD',
  ];

  expectedCols.forEach((colName, idx) => {
    const val = ws1.getRow(6).getCell(idx + 1).value;
    assert.strictEqual(val, colName, `Column ${idx + 1} header must be "${colName}", got "${val}"`);
  });

  // Verify Student 1 Data Row (Row 7)
  const row7 = ws1.getRow(7);
  assert.strictEqual(row7.getCell(1).value, 1, 'Col 1 Mentor S.No should be 1');
  assert.strictEqual(row7.getCell(2).value, 'Dr. S. Pavithra', 'Col 2 Mentor Name mismatch');
  assert.strictEqual(row7.getCell(3).value, 1, 'Col 3 Student S.No should be 1');
  assert.strictEqual(row7.getCell(4).value, reg1, 'Col 4 Reg Number mismatch');
  assert.strictEqual(row7.getCell(5).value, 'Aravind Kumar K', 'Col 5 Student Name mismatch');
  assert.strictEqual(row7.getCell(6).value, 'III IT A', 'Col 6 Class & Section mismatch');
  assert(String(row7.getCell(7).value).includes('Cloud Computing'), 'Col 7 NPTEL should show Cloud Computing');
  assert(String(row7.getCell(8).value).includes('AWS Certified'), 'Col 8 Global Cert should show AWS');
  assert.strictEqual(row7.getCell(9).value, 'ALL CLEAR', 'Col 9 should be "ALL CLEAR" for 0 arrears');

  // Verify Student 2 Data Row (Row 8)
  const row8 = ws1.getRow(8);
  assert.strictEqual(row8.getCell(4).value, reg2, 'Col 4 Reg Number mismatch for Student 2');
  assert.strictEqual(row8.getCell(5).value, 'Bhavani Shankar R', 'Col 5 Student Name mismatch for Student 2');
  assert.strictEqual(row8.getCell(6).value, 'IV IT B', 'Col 6 Class & Section mismatch for Student 2');
  assert.strictEqual(row8.getCell(9).value, '2 ARREARS', 'Col 9 should be "2 ARREARS" for 2 active arrears');
  assert(String(row8.getCell(10).value).includes('Placed at TCS'), 'Col 10 Final Year Placed mismatch');
  assert(String(row8.getCell(11).value).includes('Smart India Hackathon'), 'Col 11 Hackathon mismatch');
  assert(String(row8.getCell(12).value).includes('National Level Symposium'), 'Col 12 Symposium mismatch');
  assert(String(row8.getCell(13).value).includes('National Tech Conclave, Bengaluru'), 'Col 13 Other State mismatch');
  assert(String(row8.getCell(16).value).includes('First Prize'), 'Col 16 Award mismatch');

  console.log('✓ Sheet 1 structure, column headers, and data mappings verified.');

  // Check Sheet 2: COUNSELLING RECORDS
  const ws2 = wb.getWorksheet('COUNSELLING RECORDS');
  assert(ws2, 'Worksheet "COUNSELLING RECORDS" must exist');
  assert.strictEqual(ws2.getRow(5).getCell(5).value, 'COUNSELLING CATEGORIES (5 DOMAINS)');
  // Verify multiple categories are comma-separated
  const cRow6 = ws2.getRow(6);
  assert.strictEqual(cRow6.getCell(5).value, 'Skill Development, Career Development');
  console.log('✓ Sheet 2 Counselling Records with multi-category comma-separation verified.');

  // Check Sheet 3: STUDENT CERTIFICATES
  const ws3 = wb.getWorksheet('STUDENT CERTIFICATES');
  assert(ws3, 'Worksheet "STUDENT CERTIFICATES" must exist');
  assert.strictEqual(ws3.getRow(5).getCell(4).value, 'DOCUMENT TITLE');
  console.log('✓ Sheet 3 Student Certificates verified.');

  // ==========================================
  // TEST STEP 2: MENTOR REASSIGNMENT SECURITY (Section 5)
  // Reassign Student 2 from Mentor A to Mentor B
  // ==========================================
  console.log('\n--- Step 2: Testing Mentor Reassignment Security ---');
  const asgToUpdate = await MentorAssignment.findOne({
    student: stu2._id,
    status: 'ACTIVE',
  });
  assert(asgToUpdate, 'Active assignment for Student 2 must exist');
  asgToUpdate.status = 'COMPLETED';
  asgToUpdate.assignedUntil = new Date();
  await asgToUpdate.save();

  // Create new active assignment for Mentor B
  await MentorAssignment.create({
    student: stu2._id,
    mentor: facultyMentorB._id,
    department: itDept._id,
    assignedFrom: new Date(),
    status: 'ACTIVE',
    assignedBy: adminUser._id,
    changeReason: 'Domain Realignment Reassignment',
  });

  // Now Mentor A should ONLY export Student 1
  const exportAAfter = await generateMentorMenteesExcel(facultyMentorA._id.toString(), '2025-2026');
  assert.strictEqual(exportAAfter.count, 1, 'Mentor A should now have only 1 mentee');
  const wbAAfter = new ExcelJS.Workbook();
  await wbAAfter.xlsx.load(exportAAfter.buffer as any);
  const wsAAfter = wbAAfter.getWorksheet('MENTOR MENTEE LIST');
  assert.strictEqual(wsAAfter?.getRow(7).getCell(4).value, reg1);
  assert.strictEqual(wsAAfter?.getRow(8).getCell(4).value, null, 'Student 2 must NOT appear in Mentor A export after reassignment');

  // Mentor B should now export Student 2
  const exportB = await generateMentorMenteesExcel(facultyMentorB._id.toString(), '2025-2026');
  assert.strictEqual(exportB.count, 1, 'Mentor B should now have 1 mentee');
  const wbB = new ExcelJS.Workbook();
  await wbB.xlsx.load(exportB.buffer as any);
  const wsB = wbB.getWorksheet('MENTOR MENTEE LIST');
  assert.strictEqual(wsB?.getRow(7).getCell(4).value, reg2, 'Student 2 must appear in Mentor B export');
  assert.strictEqual(wsB?.getRow(7).getCell(2).value, 'Dr. M. Karthik', 'Mentor B name must appear');

  console.log('✓ Reassignment verified: Student 2 correctly removed from Old Mentor A and added to New Mentor B.');

  // Clean up test data
  await MentorAssignment.deleteMany({ student: { $in: [stu1._id, stu2._id] } });
  await AcademicRecord.deleteMany({ student: { $in: [stu1._id, stu2._id] } });
  await StudentDocument.deleteMany({ studentId: { $in: [stu1._id, stu2._id] } });
  await CounsellingRecord.deleteMany({ student: { $in: [stu1._id, stu2._id] } });
  await MonthlyProgress.deleteMany({ student: { $in: [stu1._id, stu2._id] } });
  await Student.deleteMany({ _id: { $in: [stu1._id, stu2._id] } });
  await User.deleteMany({ _id: { $in: [stu1User._id, stu2User._id, userMentorA._id, userMentorB._id] } });
  await Faculty.deleteMany({ _id: { $in: [facultyMentorA._id, facultyMentorB._id] } });

  await closeDB();
  console.log('\n================================================================');
  console.log('ALL OVERALL MENTEE EXPORT TESTS PASSED SUCCESSFULLY! (100% GREEN)');
  console.log('================================================================\n');
}

runOverallMenteeExportTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
