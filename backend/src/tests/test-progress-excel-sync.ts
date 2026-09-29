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
  MentorAssignment,
  StudentProgress,
} from '../models/index.js';
import { generateMentorMenteesExcel } from '../modules/mentorship/mentor-export.service.js';

async function runProgressExcelSyncTest() {
  console.log('================================================================');
  console.log('TESTING MY PROGRESS -> MENTOR -> EXCEL AUTO-SYNC SYSTEM');
  console.log('================================================================\n');

  await connectDB();
  await ensureSystemBootstrap();

  const itDept = (await Department.findOne({ code: 'IT' })) || (await Department.findOne());
  assert(itDept, 'Department must exist');
  const batch = (await Batch.findOne({ name: '2023-2027' })) || (await Batch.findOne());
  assert(batch, 'Batch must exist');
  const adminUser = await User.findOne({ role: 'ADMIN' });
  assert(adminUser, 'Admin must exist');

  const salt = await bcrypt.hash('Password@123', 10);

  // Setup Mentor A
  let userMentorA = await User.findOne({ username: 'test_progress_mentor_a' });
  if (!userMentorA) {
    userMentorA = await User.create({
      username: 'test_progress_mentor_a',
      passwordHash: salt,
      role: 'FACULTY',
      email: 'test_progress_mentor_a@ksrce.ac.in',
      fullName: 'Dr. R. Senthamil',
      department: itDept._id,
      isActive: true,
    });
  }

  let facultyMentorA = await Faculty.findOne({ user: userMentorA._id });
  if (!facultyMentorA) {
    facultyMentorA = await Faculty.create({
      user: userMentorA._id,
      employeeId: 'TEST-FAC-PROG-01',
      department: itDept._id,
      designation: 'Associate Professor',
      cabinLocation: 'IT Block 3rd Floor',
      maxMentees: 25,
      isActive: true,
    });
  }

  // Setup Mentor B
  let userMentorB = await User.findOne({ username: 'test_progress_mentor_b' });
  if (!userMentorB) {
    userMentorB = await User.create({
      username: 'test_progress_mentor_b',
      passwordHash: salt,
      role: 'FACULTY',
      email: 'test_progress_mentor_b@ksrce.ac.in',
      fullName: 'Dr. K. Vignesh',
      department: itDept._id,
      isActive: true,
    });
  }

  let facultyMentorB = await Faculty.findOne({ user: userMentorB._id });
  if (!facultyMentorB) {
    facultyMentorB = await Faculty.create({
      user: userMentorB._id,
      employeeId: 'TEST-FAC-PROG-02',
      department: itDept._id,
      designation: 'Assistant Professor',
      cabinLocation: 'IT Block 2nd Floor',
      maxMentees: 25,
      isActive: true,
    });
  }

  // Setup Test Student
  const regNo = '731523205099';
  let userStudent = await User.findOne({ username: regNo });
  if (!userStudent) {
    userStudent = await User.create({
      username: regNo,
      passwordHash: salt,
      role: 'STUDENT',
      email: '731523205099@ksrce.ac.in',
      fullName: 'KAVIN S',
      department: itDept._id,
      isActive: true,
    });
  }

  let studentObj = await Student.findOne({ registerNumber: regNo });
  if (!studentObj) {
    studentObj = await Student.create({
      user: userStudent._id,
      registerNumber: regNo,
      fullName: 'KAVIN S',
      department: itDept._id,
      batch: batch._id,
      section: 'A',
      residentialType: 'DAY_SCHOLAR',
      mobileNumber: '9876543210',
    });
  }

  // Reset student progress records
  await StudentProgress.deleteMany({ registerNumber: regNo });

  // Assign Student to Mentor A
  await MentorAssignment.updateMany(
    { student: studentObj._id },
    { $set: { status: 'TRANSFERRED' } }
  );

  await MentorAssignment.create({
    student: studentObj._id,
    mentor: facultyMentorA._id,
    department: itDept._id,
    assignedBy: adminUser._id,
    status: 'ACTIVE',
    assignedFrom: new Date(),
    changeReason: 'Initial Allocation',
  });

  console.log('✓ Initial setup completed: Student assigned to Mentor A.');

  // =========================================================================
  // STEP 1: Student adds Hackathon Certificate: "Smart India Hackathon 2026"
  // =========================================================================
  console.log('\n--- Step 1: Adding Hackathon Certificate ---');
  const hackathonRecord = await StudentProgress.create({
    studentId: studentObj._id,
    registerNumber: regNo,
    studentName: studentObj.fullName,
    department: 'IT',
    batch: '2023-2027',
    section: 'A',
    category: 'Hackathon Certificate',
    activityName: 'Smart India Hackathon 2026',
    organization: 'Ministry of Education & AICTE',
    eventName: 'SIH Grand Finale 2026',
    date: new Date('2026-03-15'),
    level: 'National',
    description: 'Developed an AI-driven digital mentoring and student record platform.',
    certificateUrl: '/uploads/progress/sih2026_cert.pdf',
    status: 'Pending',
  });

  assert(hackathonRecord._id, 'Hackathon record must be created in MongoDB');
  console.log('✓ Hackathon record saved in MongoDB collection student_progress.');

  // Verify Mentor A exports Excel and Hackathon appears in HACKATHON PARTICIPATION
  console.log('Testing Mentor A Excel Export...');
  let exportResult = await generateMentorMenteesExcel(facultyMentorA._id.toString());
  assert(exportResult.buffer, 'Excel buffer must be returned');

  let workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportResult.buffer as any);

  let sheet1 = workbook.getWorksheet('MENTOR MENTEE LIST');
  assert(sheet1, 'Sheet MENTOR MENTEE LIST must exist');

  // Find student row by Reg Number (Column 4)
  let studentRowNumber = -1;
  sheet1.eachRow((row, rowNum) => {
    const val = row.getCell(4).value;
    if (val && val.toString().trim() === regNo) {
      studentRowNumber = rowNum;
    }
  });

  assert(studentRowNumber > 0, `Student ${regNo} must appear in Excel export`);
  let stuRow = sheet1.getRow(studentRowNumber);

  // Column headers in Sheet 1:
  // Col 4: REG NUMBER
  // Col 5: STUDENT NAME
  // Col 7: NPTEL COMPLETED
  // Col 8: GLOBAL CERTIFICATION
  // Col 11: HACKATHON PARTICIPATION
  // Col 12: SYMPOSIUM PARTICIPATION
  // Col 16: AWARD
  const hackathonCellVal = stuRow.getCell(11).value?.toString();
  console.log(`Cell HACKATHON PARTICIPATION: "${hackathonCellVal}"`);
  assert(
    hackathonCellVal && hackathonCellVal.includes('Smart India Hackathon 2026'),
    'HACKATHON PARTICIPATION must contain Smart India Hackathon 2026'
  );

  const nptelCellVal = stuRow.getCell(7).value?.toString();
  console.log(`Cell NPTEL COMPLETED (empty category): "${nptelCellVal}"`);
  assert.strictEqual(nptelCellVal, 'NIL', 'Empty NPTEL must be NIL');

  const globalCertVal = stuRow.getCell(8).value?.toString();
  assert.strictEqual(globalCertVal, 'NIL', 'Empty GLOBAL CERTIFICATION must be NIL');

  console.log('✓ Step 1 Passed: Hackathon certificate automatically mapped into Excel with NIL for empty categories.');

  // =========================================================================
  // STEP 2: Student adds NPTEL, Global Cert, Symposium, Award, Second Hackathon
  // =========================================================================
  console.log('\n--- Step 2: Adding Multi-category achievements ---');
  await StudentProgress.create([
    {
      studentId: studentObj._id,
      registerNumber: regNo,
      studentName: studentObj.fullName,
      department: 'IT',
      batch: '2023-2027',
      section: 'A',
      category: 'NPTEL Certificate',
      activityName: 'NPTEL Python Programming',
      organization: 'IIT Madras',
      eventName: 'NPTEL Elite Course',
      date: new Date('2026-04-10'),
      level: 'National',
      status: 'Verified',
    },
    {
      studentId: studentObj._id,
      registerNumber: regNo,
      studentName: studentObj.fullName,
      department: 'IT',
      batch: '2023-2027',
      section: 'A',
      category: 'Global Certification',
      activityName: 'AWS Cloud Practitioner',
      organization: 'Amazon Web Services',
      eventName: 'AWS Certified Cloud Practitioner (CLF-C02)',
      date: new Date('2026-05-18'),
      level: 'International',
      status: 'Verified',
    },
    {
      studentId: studentObj._id,
      registerNumber: regNo,
      studentName: studentObj.fullName,
      department: 'IT',
      batch: '2023-2027',
      section: 'A',
      category: 'Symposium Certificate',
      activityName: 'National Tech Symposium 2026',
      organization: 'PSG College of Technology',
      eventName: 'KRIYA 2026',
      date: new Date('2026-02-20'),
      level: 'National',
      status: 'Pending',
    },
    {
      studentId: studentObj._id,
      registerNumber: regNo,
      studentName: studentObj.fullName,
      department: 'IT',
      batch: '2023-2027',
      section: 'A',
      category: 'Award Certificate',
      activityName: 'Best Innovation Award',
      organization: 'Tamil Nadu State Innovation Council',
      eventName: 'State Innovation Expo',
      date: new Date('2026-06-01'),
      level: 'State',
      status: 'Verified',
    },
    {
      studentId: studentObj._id,
      registerNumber: regNo,
      studentName: studentObj.fullName,
      department: 'IT',
      batch: '2023-2027',
      section: 'A',
      category: 'Hackathon Certificate',
      activityName: 'College Innovation Hackathon',
      organization: 'K.S.R. College of Engineering',
      eventName: 'Internal Hackathon 2026',
      date: new Date('2026-01-10'),
      level: 'College',
      status: 'Verified',
    },
  ]);

  // Mentor verifies the initial hackathon
  await StudentProgress.findByIdAndUpdate(hackathonRecord._id, {
    status: 'Verified',
    reviewedBy: userMentorA._id,
    reviewerName: userMentorA.fullName,
    reviewedAt: new Date(),
  });

  console.log('Generating Excel with multiple progress records...');
  exportResult = await generateMentorMenteesExcel(facultyMentorA._id.toString());
  workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exportResult.buffer as any);

  sheet1 = workbook.getWorksheet('MENTOR MENTEE LIST');
  stuRow = sheet1.getRow(studentRowNumber);

  // Check NPTEL (Col 7)
  const nptelUpdatedVal = stuRow.getCell(7).value?.toString();
  console.log(`Cell NPTEL COMPLETED: "${nptelUpdatedVal}"`);
  assert(
    nptelUpdatedVal && nptelUpdatedVal.includes('NPTEL Python Programming'),
    'NPTEL COMPLETED must contain NPTEL Python Programming'
  );

  // Check Global Cert (Col 8)
  const globalUpdatedVal = stuRow.getCell(8).value?.toString();
  console.log(`Cell GLOBAL CERTIFICATION: "${globalUpdatedVal}"`);
  assert(
    globalUpdatedVal && globalUpdatedVal.includes('AWS Cloud Practitioner'),
    'GLOBAL CERTIFICATION must contain AWS Cloud Practitioner'
  );

  // Check Hackathons (Col 11: Both records separated by \n in a single student row)
  const hackathonsUpdatedVal = stuRow.getCell(11).value?.toString();
  console.log(`Cell HACKATHON PARTICIPATION:\n"${hackathonsUpdatedVal}"`);
  assert(
    hackathonsUpdatedVal &&
      hackathonsUpdatedVal.includes('Smart India Hackathon 2026') &&
      hackathonsUpdatedVal.includes('College Innovation Hackathon'),
    'HACKATHON PARTICIPATION must contain both hackathons combined in one cell'
  );

  // Check Symposium (Col 12)
  const symposiumUpdatedVal = stuRow.getCell(12).value?.toString();
  console.log(`Cell SYMPOSIUM PARTICIPATION: "${symposiumUpdatedVal}"`);
  assert(
    symposiumUpdatedVal && symposiumUpdatedVal.includes('National Tech Symposium 2026'),
    'SYMPOSIUM PARTICIPATION must contain National Tech Symposium 2026'
  );

  // Check Award (Col 16)
  const awardUpdatedVal = stuRow.getCell(16).value?.toString();
  console.log(`Cell AWARD: "${awardUpdatedVal}"`);
  assert(
    awardUpdatedVal && awardUpdatedVal.includes('Best Innovation Award'),
    'AWARD must contain Best Innovation Award'
  );

  // Check Sheet 3: STUDENT CERTIFICATES
  const sheet3 = workbook.getWorksheet('STUDENT CERTIFICATES');
  assert(sheet3, 'Sheet STUDENT CERTIFICATES must exist');
  let certCount = 0;
  sheet3.eachRow((row, rowNum) => {
    if (rowNum >= 6) {
      const reg = row.getCell(2).value?.toString();
      if (reg === regNo) {
        certCount++;
      }
    }
  });
  console.log(`Sheet 3 certificate rows for student ${regNo}: ${certCount}`);
  assert(certCount >= 6, 'Sheet 3 must log all student progress records in certificates ledger');

  console.log('✓ Step 2 Passed: All categories auto-mapped with line breaks and certificate ledger populated.');

  // =========================================================================
  // STEP 3: Mentor Reassignment Verification
  // =========================================================================
  console.log('\n--- Step 3: Mentor Reassignment Preservation ---');
  // Reassign student to Mentor B
  await MentorAssignment.updateMany(
    { student: studentObj._id },
    { $set: { status: 'TRANSFERRED' } }
  );

  await MentorAssignment.create({
    student: studentObj._id,
    mentor: facultyMentorB._id,
    department: itDept._id,
    assignedBy: adminUser._id,
    status: 'ACTIVE',
    assignedFrom: new Date(),
    changeReason: 'Departmental Mentor Load Balancing',
  });

  // Verify records still exist in MongoDB
  const remainingRecords = await StudentProgress.find({ registerNumber: regNo });
  assert.strictEqual(remainingRecords.length, 6, 'All 6 progress records must remain in MongoDB after reassignment');
  console.log(`✓ Verified: MongoDB still contains all ${remainingRecords.length} records. Nothing deleted.`);

  // Verify Old Mentor A's export no longer contains the student
  const exportResA = await generateMentorMenteesExcel(facultyMentorA._id.toString());
  assert.strictEqual(exportResA.count, 0, 'Old Mentor A has 0 active mentees after reassignment');
  assert.strictEqual(exportResA.buffer, null, 'Old Mentor A has null buffer when 0 mentees assigned');
  console.log('✓ Old Mentor A export no longer includes reassigned student (count: 0).');

  // Verify New Mentor B's export contains the student with all progress intact
  const exportResB = await generateMentorMenteesExcel(facultyMentorB._id.toString());
  const wbB = new ExcelJS.Workbook();
  await wbB.xlsx.load(exportResB.buffer as any);
  const sheet1B = wbB.getWorksheet('MENTOR MENTEE LIST');
  let foundInNewMentor = false;
  let newMentorRow: ExcelJS.Row | null = null;
  sheet1B.eachRow((row) => {
    if (row.getCell(4).value?.toString() === regNo) {
      foundInNewMentor = true;
      newMentorRow = row;
    }
  });
  assert(foundInNewMentor, 'New Mentor B must have the reassigned student in export');
  assert(
    newMentorRow?.getCell(11).value?.toString().includes('Smart India Hackathon 2026'),
    'New Mentor B must see all previous progress data in export'
  );
  console.log('✓ New Mentor B export automatically inherits all student progress data.');

  console.log('\n================================================================');
  console.log('ALL MY PROGRESS -> MENTOR -> EXCEL AUTO-SYNC TESTS PASSED!');
  console.log('================================================================\n');

  await closeDB();
  process.exit(0);
}

runProgressExcelSyncTest().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
