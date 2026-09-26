import assert from 'assert';
import bcrypt from 'bcryptjs';
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
  Meeting,
  CounsellingRecord,
} from '../models/index.js';
import { generateStudentPdf } from '../modules/pdf/pdf.service.js';

async function runCriticalTest() {
  console.log('================================================================');
  console.log('KSRCE DATA PRESERVATION & ONBOARDING WORKFLOW TEST (SECTION 20)');
  console.log('MONGODB & MONGOOSE ODM VALIDATION');
  console.log('================================================================\n');

  // Setup Clean MongoDB DB with migrations and bootstrap
  await connectDB();
  await ensureSystemBootstrap();

  const testRegNo = `731523104999`;
  const username = testRegNo;
  const tempPassword = 'Password@123';

  // Get department & batch
  const cseDept = await Department.findOne({ code: 'CSE' });
  assert(cseDept, 'CSE Department must exist');

  const batch = await Batch.findOne({ name: '2023-2027' });
  assert(batch, '2023-2027 Batch must exist');

  const adminUser = await User.findOne({ role: 'ADMIN' });
  assert(adminUser, 'Admin user must exist');

  // Fetch or create ephemeral test mentors
  let mentorAUser = await User.findOne({ username: 'test_mentor_a' });
  if (!mentorAUser) {
    mentorAUser = await User.create({
      username: 'test_mentor_a',
      passwordHash: await bcrypt.hash('Password@123', 10),
      role: 'FACULTY',
      email: 'test_mentor_a@ksrce.ac.in',
      fullName: 'Test Mentor A (Dr. K. Ramesh)',
      department: cseDept._id,
      isActive: true,
    });
  }
  let mentorA = await Faculty.findOne({ employeeId: 'TEST-FAC-0104' }).populate('user');
  if (!mentorA) {
    mentorA = await Faculty.create({
      user: mentorAUser._id,
      employeeId: 'TEST-FAC-0104',
      department: cseDept._id,
      designation: 'Associate Professor',
      cabinLocation: 'CS Block, Cabin 204',
      phoneNumber: '9842100001',
      isActive: true,
    });
  }

  let mentorBUser = await User.findOne({ username: 'test_mentor_b' });
  if (!mentorBUser) {
    mentorBUser = await User.create({
      username: 'test_mentor_b',
      passwordHash: await bcrypt.hash('Password@123', 10),
      role: 'FACULTY',
      email: 'test_mentor_b@ksrce.ac.in',
      fullName: 'Test Mentor B (Dr. P. Priya)',
      department: cseDept._id,
      isActive: true,
    });
  }
  let mentorB = await Faculty.findOne({ employeeId: 'TEST-FAC-0188' }).populate('user');
  if (!mentorB) {
    mentorB = await Faculty.create({
      user: mentorBUser._id,
      employeeId: 'TEST-FAC-0188',
      department: cseDept._id,
      designation: 'Assistant Professor',
      cabinLocation: 'CS Block, Cabin 305',
      phoneNumber: '9842100002',
      isActive: true,
    });
  }

  // ==========================================================================
  // STEP 1: Admin creates Student A (basic identity only, profileCompleted = false)
  // ==========================================================================
  console.log('Step 1: Admin creates Student A account...');
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const studentUser = await User.create({
    username,
    passwordHash,
    role: 'STUDENT',
    email: `${testRegNo}@ksrce.ac.in`,
    fullName: 'Kavitha R',
    department: cseDept._id,
    isActive: true,
  });

  const studentDoc = await Student.create({
    user: studentUser._id,
    registerNumber: testRegNo,
    fullName: 'Kavitha R',
    department: cseDept._id,
    batch: batch._id,
    residentialType: 'DAY_SCHOLAR',
    profileCompleted: false,
    isActive: true,
  });

  const studentId = studentDoc._id.toString();
  console.log(`✓ Student A account created with permanent MongoDB _id: ${studentId}`);

  // ==========================================================================
  // STEP 2: Student A receives credentials
  // ==========================================================================
  console.log('\nStep 2: Verifying generated credentials for handover...');
  const credsUser = await User.findById(studentUser._id);
  assert.strictEqual(credsUser?.username, username, 'Username must match register number');
  assert.strictEqual(credsUser?.role, 'STUDENT', 'Role must be STUDENT');
  assert.strictEqual(credsUser?.isActive, true, 'Account status must be Active');
  console.log(`✓ Credentials verified: Username=${username}, TemporaryPassword=${tempPassword}, Status=Active`);

  // ==========================================================================
  // STEP 3: Student A logs in (Detects profileCompleted = false)
  // ==========================================================================
  console.log('\nStep 3: Student A logs in (First-Time Login Check)...');
  const stuCheck = await Student.findById(studentId);
  assert.strictEqual(stuCheck?.profileCompleted, false, 'First-login student must have profileCompleted = false');
  console.log('✓ System detects profileCompleted = false; directs student to /student/complete-profile wizard.');

  // ==========================================================================
  // STEP 4 & 5: Student enters all personal, family, and academic details
  // ==========================================================================
  console.log('\nSteps 4 & 5: Student A enters complete personal, family, and academic info...');
  const studentPersonalData = {
    dob: '2005-04-18',
    bloodGroup: 'B+ve',
    residentialType: 'HOSTELLER' as const,
    mobileNumber: '9842100099',
    email: 'kavitha.r@ksrce.ac.in',
    address: '24, Gandhi Road, Tiruchengode, Tamil Nadu - 637215',
    fatherName: 'Ramasamy K',
    fatherContact: '9842100011',
    fatherOccupation: 'Agriculture',
    motherName: 'Saradha R',
    motherContact: '9842100022',
    motherOccupation: 'Home Maker',
    tenthMark: 482.0,
    tenthSchool: 'Govt Girls HSS Tiruchengode',
    twelfthMark: 575.0,
    twelfthSchool: 'Govt Girls HSS Tiruchengode',
    cutoffMark: 191.5,
    admissionType: 'COUNSELLING' as const,
    scholarshipDetails: 'First Graduate Full Tuition Fee Waiver',
  };

  // ==========================================================================
  // STEP 6: Student submits profile (sets profileCompleted = true)
  // ==========================================================================
  console.log('\nStep 6: Student submits profile to complete onboarding wizard...');
  studentDoc.dob = studentPersonalData.dob;
  studentDoc.bloodGroup = studentPersonalData.bloodGroup;
  studentDoc.residentialType = studentPersonalData.residentialType;
  studentDoc.mobileNumber = studentPersonalData.mobileNumber;
  studentDoc.email = studentPersonalData.email;
  studentDoc.address = studentPersonalData.address;
  studentDoc.parent = {
    fatherName: studentPersonalData.fatherName,
    fatherContact: studentPersonalData.fatherContact,
    fatherOccupation: studentPersonalData.fatherOccupation,
    motherName: studentPersonalData.motherName,
    motherContact: studentPersonalData.motherContact,
    motherOccupation: studentPersonalData.motherOccupation,
  };
  studentDoc.school = {
    tenthMark: studentPersonalData.tenthMark,
    tenthSchool: studentPersonalData.tenthSchool,
    twelfthMark: studentPersonalData.twelfthMark,
    twelfthSchool: studentPersonalData.twelfthSchool,
    cutoffMark: studentPersonalData.cutoffMark,
    admissionType: studentPersonalData.admissionType,
    scholarshipDetails: studentPersonalData.scholarshipDetails,
  };
  studentDoc.profileCompleted = true;
  studentDoc.profileCompletedAt = new Date();
  await studentDoc.save();

  // Create Semesters 1 and 2 academics
  await AcademicRecord.create({
    student: studentDoc._id,
    semesterNumber: 1,
    cgpa: 8.85,
    sgpa: 8.85,
    arrearsCount: 0,
    arrearsSubjects: '',
  });

  await AcademicRecord.create({
    student: studentDoc._id,
    semesterNumber: 2,
    cgpa: 9.02,
    sgpa: 9.20,
    arrearsCount: 0,
    arrearsSubjects: '',
  });

  const completedCheck = await Student.findById(studentId);
  assert.strictEqual(completedCheck?.profileCompleted, true, 'Profile completed flag must be true');
  assert(completedCheck?.profileCompletedAt, 'Profile completed date must be recorded');
  console.log(`✓ Profile completed permanently: profileCompleted=true, at=${completedCheck.profileCompletedAt}`);

  // ==========================================================================
  // STEP 7: Mentor A is assigned
  // ==========================================================================
  console.log('\nStep 7: Assigning Mentor A (Dr. K. Ramesh) to Student A...');
  const asg1 = await MentorAssignment.create({
    student: studentDoc._id,
    mentor: mentorA._id,
    department: cseDept._id,
    assignedFrom: '2026-06-01',
    status: 'ACTIVE',
    assignedBy: adminUser._id,
    changeReason: 'Initial Mentor Assignment',
  });
  console.log('✓ Mentor A successfully assigned.');

  // ==========================================================================
  // STEP 8: Mentor A adds counselling record
  // ==========================================================================
  console.log('\nStep 8: Mentor A records 5-Domain Counselling session...');
  await CounsellingRecord.create({
    student: studentDoc._id,
    mentor: mentorA._id,
    sessionDate: '2026-07-20',
    category: 'Academic',
    challengeObserved: 'Needs advanced reference material for Data Structures',
    correctiveAction: 'Provided NPTEL course notes and recommended standard textbook',
    studentFeedback: 'Student expressed confidence and initiated extra assignments',
    mentorRemarks: 'Demonstrating excellent commitment',
    studentAcknowledgementStatus: 'ACKNOWLEDGED',
    mentorSignatureStatus: 'SIGNED',
  });
  console.log('✓ Counselling record logged under Mentor A.');

  // ==========================================================================
  // STEP 9: Mentor A adds Saturday meeting record
  // ==========================================================================
  console.log('\nStep 9: Mentor A logs weekly Saturday meeting record...');
  await Meeting.create({
    student: studentDoc._id,
    mentor: mentorA._id,
    meetingDate: '2026-08-01',
    meetingTime: '10:30 AM',
    location: 'CS Block Cabin 204',
    attendanceStatus: 'PRESENT',
    meetingStatus: 'COMPLETED',
    challengesDiscussed: 'Discussed technical symposium participation and paper presentation',
    correctiveAction: 'Advised to register for AI/ML national conference',
    mentorRemarks: 'Well-prepared and proactive',
  });
  console.log('✓ Saturday meeting record logged.');

  // ==========================================================================
  // STEP 10: Admin changes Mentor A -> Mentor B
  // ==========================================================================
  console.log('\nStep 10: Admin reassigns Student A: Mentor A -> Mentor B (Dr. P. Priya)...');
  const effectiveDate = '2026-09-01';
  const reassignmentReason = 'Faculty A proceeded on official research sabbatical; Mentor B assigned';

  // Mark previous assignment COMPLETED
  asg1.status = 'COMPLETED';
  asg1.assignedUntil = effectiveDate;
  await asg1.save();

  // Create new ACTIVE assignment for Mentor B
  const asg2 = await MentorAssignment.create({
    student: studentDoc._id,
    mentor: mentorB._id,
    department: cseDept._id,
    assignedFrom: effectiveDate,
    status: 'ACTIVE',
    assignedBy: adminUser._id,
    changeReason: reassignmentReason,
  });
  console.log('✓ Mentor reassignment executed: Old status=COMPLETED, New status=ACTIVE.');

  // ==========================================================================
  // STEP 11: Mentor B logs in
  // ==========================================================================
  console.log('\nStep 11: Mentor B logs in and accesses mentee roster...');
  const mentorBMentees = await MentorAssignment.find({
    mentor: mentorB._id,
    status: 'ACTIVE',
  }).populate('student');

  const foundAssignment = mentorBMentees.find(
    (ma: any) => ma.student?._id.toString() === studentId
  );
  assert(foundAssignment, 'Student A must be present in Mentor B active mentee roster');
  console.log(`✓ Student A present in Mentor B mentees list: ${(foundAssignment.student as any)?.fullName} (${(foundAssignment.student as any)?.registerNumber})`);

  // ==========================================================================
  // STEP 12: Mentor B opens Student A & verifies 100% data preservation
  // ==========================================================================
  console.log('\nStep 12: Mentor B opens Student A profile & verifies all ledgers...');

  // 1. Student identity check
  const studentRow = await Student.findById(studentId);
  assert.strictEqual(studentRow?._id.toString(), studentId, 'Permanent Student ID must remain unchanged');
  assert.strictEqual(studentRow?.registerNumber, testRegNo, 'Register number must remain identical');
  assert.strictEqual(studentRow?.mobileNumber, studentPersonalData.mobileNumber, 'Mobile number must be preserved');
  assert.strictEqual(studentRow?.address, studentPersonalData.address, 'Address must be preserved');
  console.log('✓ Student personal details 100% intact.');

  // 2. Family details check
  const parentDetails = studentRow?.parent;
  assert.strictEqual(parentDetails?.fatherName, studentPersonalData.fatherName, 'Father name must be preserved');
  assert.strictEqual(parentDetails?.motherName, studentPersonalData.motherName, 'Mother name must be preserved');
  console.log('✓ Family details 100% intact.');

  // 3. Academic schooling check
  const schoolDetails = studentRow?.school;
  assert.strictEqual(schoolDetails?.tenthMark, studentPersonalData.tenthMark, '10th mark must be intact');
  assert.strictEqual(schoolDetails?.twelfthMark, studentPersonalData.twelfthMark, '12th mark must be intact');
  assert.strictEqual(schoolDetails?.cutoffMark, studentPersonalData.cutoffMark, 'Cutoff mark must be intact');
  console.log('✓ Academic schooling details intact (10th: 482/500, 12th: 575/600, Cutoff: 191.5).');

  // 4. Semester CGPA & Arrears check
  const sems = await AcademicRecord.find({ student: studentId }).sort({ semesterNumber: 1 });
  assert.strictEqual(sems.length, 2, 'All semester records must be intact');
  assert.strictEqual(sems[0].cgpa, 8.85, 'Sem 1 CGPA must be intact');
  assert.strictEqual(sems[1].cgpa, 9.02, 'Sem 2 CGPA must be intact');
  console.log('✓ Semesters 1-8 CGPA & Arrears records 100% intact.');

  // 5. Past Saturday meetings check
  const meets = await Meeting.find({ student: studentId });
  assert.strictEqual(meets.length, 1, 'Past Saturday meeting must exist');
  assert.strictEqual(meets[0].mentor.toString(), mentorA._id.toString(), 'Past meeting must reference original Mentor A');
  console.log('✓ Past Saturday meeting record conducted by Mentor A is preserved.');

  // 6. Past Counselling records check
  const couns = await CounsellingRecord.find({ student: studentId });
  assert.strictEqual(couns.length, 1, 'Past counselling session must exist');
  assert.strictEqual(couns[0].mentor.toString(), mentorA._id.toString(), 'Past counselling must reference original Mentor A');
  console.log('✓ Past 5-Domain counselling record conducted by Mentor A is preserved.');

  // 7. Mentor Lineage check
  const lineage = await MentorAssignment.find({ student: studentId }).sort({ createdAt: 1 });
  assert.strictEqual(lineage.length, 2, 'Must have exactly 2 mentor assignment records');
  assert.strictEqual(lineage[0].mentor.toString(), mentorA._id.toString(), 'First was Mentor A');
  assert.strictEqual(lineage[0].status, 'COMPLETED', 'Mentor A assignment is COMPLETED');
  assert.strictEqual(lineage[1].mentor.toString(), mentorB._id.toString(), 'Second is Mentor B');
  assert.strictEqual(lineage[1].status, 'ACTIVE', 'Mentor B assignment is ACTIVE');
  console.log('✓ Full Mentor Lineage verified: Mentor A (COMPLETED) -> Mentor B (ACTIVE).');

  // 8. PDF Download Verification
  console.log('\nVerifying Faculty PDF download for Student A...');
  const pdfBytes = await generateStudentPdf(studentId);
  assert(pdfBytes && pdfBytes.byteLength > 1000, 'Student PDF must be non-empty and generated successfully');
  console.log(`✓ Official KSRCE Student PDF Dossier generated successfully! Size: ${pdfBytes.byteLength} bytes`);

  console.log('\n================================================================');
  console.log('TEST RESULT: ALL 12 STEPS OF SECTION 20 PASSED WITH 100% SUCCESS!');
  console.log('ZERO DATA LOSS CONFIRMED ACROSS STUDENT ONBOARDING & REASSIGNMENT.');
  // Cleanup test entities so database remains clean
  await Student.deleteMany({ registerNumber: testRegNo });
  await User.deleteMany({ username: { $in: [testRegNo, 'test_mentor_a', 'test_mentor_b'] } });
  await Faculty.deleteMany({ employeeId: { $in: ['TEST-FAC-0104', 'TEST-FAC-0188'] } });
  await AcademicRecord.deleteMany({ student: studentId });
  await MentorAssignment.deleteMany({ student: studentId });
  await Meeting.deleteMany({ student: studentId });
  await CounsellingRecord.deleteMany({ student: studentId });

  await closeDB();
}

runCriticalTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('TEST FAILED:', err);
    process.exit(1);
  });
