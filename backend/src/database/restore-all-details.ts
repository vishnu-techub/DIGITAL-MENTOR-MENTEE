/**
 * ============================================================================
 * LEGACY ONE-OFF TOOL -- KEEP FOR REFERENCE, DO NOT RUN ON A LIVE STORE
 * ============================================================================
 * TEMPORARY LOCAL FILE STORAGE. Replace with a persistent database/storage
 * implementation before production deployment.
 *
 * This was the original migration path: it read the project's first SQLite
 * prototype (`backend/data/ksrce_mentoring.db`, an immutable backup that predates
 * the MongoDB era) and re-inserted it into the live database. It is NOT wired to
 * any npm script and is only run by hand.
 *
 * It is retained, not deleted, because the SQLite file it reads is a real
 * historical backup and there is no other tool that can import it. It is the ONLY
 * remaining consumer of the `sqlite3` package, which is therefore kept as a
 * devDependency for this file alone.
 *
 * It has been repointed from MongoDB at the local file store, so running it now
 * would import the 2019-era rows into `backend/data/*.json` alongside live
 * records. Back up `backend/data/` first if you ever need it.
 */
import sqlite3 from 'sqlite3';
import bcrypt from 'bcryptjs';
import path from 'path';
import { connectDB } from '../config/database.js';
import {
  Department,
  Batch,
  User,
  Faculty,
  Student,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
  School,
  SystemSetting,
} from '../models/index.js';
import { isValidId, toLocalId, type LocalId } from '../services/localId.js';

function querySqlite(db: sqlite3.Database, sql: string, params: any[] = []): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

export async function restoreAllDetails(): Promise<void> {
  console.log('============================================================');
  console.log('RESTORING ALL PREVIOUS DATA FROM SQLITE TO THE LOCAL FILE STORE...');
  console.log('============================================================');

  await connectDB();

  const sqlitePath = path.resolve(process.cwd(), 'data/ksrce_mentoring.db');
  const sqliteDb = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);

  try {
    // 1. Departments Map
    console.log('1. Restoring / Mapping Departments...');
    const sqliteDepts = await querySqlite(sqliteDb, 'SELECT * FROM departments');
    const deptIdMap = new Map<string, LocalId>();

    for (const d of sqliteDepts) {
      let deptDoc = await Department.findOne({ code: d.code });
      if (!deptDoc) {
        deptDoc = await Department.create({
          code: d.code,
          name: d.name,
        });
      }
      deptIdMap.set(d.id, deptDoc._id);
      deptIdMap.set(d.code, deptDoc._id);
    }
    // Ensure IT department is available
    let itDept = await Department.findOne({ code: 'IT' });
    if (!itDept) {
      itDept = await Department.create({ code: 'IT', name: 'Information Technology' });
    }
    deptIdMap.set('dept-it', itDept._id);
    deptIdMap.set('IT', itDept._id);

    // 2. Batches Map
    console.log('2. Restoring / Mapping Batches...');
    const sqliteBatches = await querySqlite(sqliteDb, 'SELECT * FROM batches');
    const batchIdMap = new Map<string, LocalId>();

    for (const b of sqliteBatches) {
      let batchDoc = await Batch.findOne({ name: b.name });
      if (!batchDoc) {
        batchDoc = await Batch.create({
          name: b.name,
          startYear: b.start_year,
          endYear: b.end_year,
          isActive: Boolean(b.is_active),
        });
      }
      batchIdMap.set(b.id, batchDoc._id);
      batchIdMap.set(b.name, batchDoc._id);
    }
    let batch2024 = await Batch.findOne({ name: '2024-2028' });
    if (!batch2024) {
      batch2024 = await Batch.create({ name: '2024-2028', startYear: 2024, endYear: 2028, isActive: true });
    }
    batchIdMap.set('batch-2024-2028', batch2024._id);
    batchIdMap.set('2024-2028', batch2024._id);

    // 3. Users Map
    console.log('3. Restoring Users...');
    const sqliteUsers = await querySqlite(sqliteDb, 'SELECT * FROM users');
    const userIdMap = new Map<string, LocalId>();

    for (const u of sqliteUsers) {
      const deptMongoId = u.department_id ? deptIdMap.get(u.department_id) : undefined;
      let userDoc = await User.findOne({
        $or: [{ username: u.username }, { email: u.email }],
      });

      if (!userDoc) {
        userDoc = await User.create({
          username: u.username,
          passwordHash: u.password_hash,
          role: u.role,
          email: u.email,
          fullName: u.full_name,
          department: deptMongoId,
          isActive: Boolean(u.is_active),
        });
      }
      userIdMap.set(u.id, userDoc._id);
      userIdMap.set(u.username, userDoc._id);
    }

    // 4. Faculty Map
    console.log('4. Restoring Faculty...');
    const sqliteFaculty = await querySqlite(sqliteDb, 'SELECT * FROM faculty');
    const facultyIdMap = new Map<string, LocalId>();

    for (const f of sqliteFaculty) {
      const userMongoId = userIdMap.get(f.user_id);
      if (!userMongoId) continue;

      const userRow = sqliteUsers.find((u) => u.id === f.user_id);
      const deptMongoId = userRow && userRow.department_id ? deptIdMap.get(userRow.department_id) : itDept._id;

      let facultyDoc = await Faculty.findOne({ employeeId: f.employee_id });
      if (!facultyDoc) {
        facultyDoc = await Faculty.create({
          user: userMongoId,
          employeeId: f.employee_id,
          department: deptMongoId,
          designation: f.designation,
          cabinLocation: f.cabin_location,
          phoneNumber: f.phone_number,
          isActive: Boolean(f.is_active),
        });
      } else {
        facultyDoc.user = userMongoId;
        facultyDoc.designation = f.designation;
        facultyDoc.cabinLocation = f.cabin_location;
        facultyDoc.phoneNumber = f.phone_number;
        await facultyDoc.save();
      }
      facultyIdMap.set(f.id, facultyDoc._id);
      facultyIdMap.set(f.employee_id, facultyDoc._id);
    }

    // Also restore Pavithra S (Assistant Professor, IT lab 3) if not present
    let pavithraUser = await User.findOne({ username: 'KSRCE_F001' });
    if (!pavithraUser) {
      const defaultHash = await bcrypt.hash('Ksrce@1234', 10);
      pavithraUser = await User.create({
        username: 'KSRCE_F001',
        passwordHash: defaultHash,
        role: 'FACULTY',
        email: 'pavithra.s@ksrce.ac.in',
        fullName: 'Pavithra S',
        department: itDept._id,
        isActive: true,
      });
    }
    let pavithraFaculty = await Faculty.findOne({ employeeId: 'KSRCE_F001' });
    if (!pavithraFaculty) {
      pavithraFaculty = await Faculty.create({
        user: pavithraUser._id,
        employeeId: 'KSRCE_F001',
        department: itDept._id,
        designation: 'Assistant Professor',
        cabinLocation: 'IT lab 3 ( 1st Cabin)',
        phoneNumber: '9842100099',
        isActive: true,
      });
    }
    facultyIdMap.set('KSRCE_F001', pavithraFaculty._id);

    // 5. Students Map
    console.log('5. Restoring Students with Demographics, Parents, and Schooling...');
    const sqliteStudents = await querySqlite(sqliteDb, 'SELECT * FROM students');
    const sqliteParents = await querySqlite(sqliteDb, 'SELECT * FROM parent_details');
    const sqliteSchools = await querySqlite(sqliteDb, 'SELECT * FROM academic_school_details');
    const sqliteSiblings = await querySqlite(sqliteDb, 'SELECT * FROM sibling_details');
    const studentIdMap = new Map<string, LocalId>();

    for (const s of sqliteStudents) {
      let userMongoId = userIdMap.get(s.user_id) || userIdMap.get(s.register_number);
      if (!userMongoId) {
        const defaultHash = await bcrypt.hash('Ksrce@1234', 10);
        const newUser = await User.create({
          username: s.register_number,
          passwordHash: defaultHash,
          role: 'STUDENT',
          email: s.email || `${s.register_number}@ksrce.ac.in`,
          fullName: s.full_name,
          department: deptIdMap.get(s.department_id),
          isActive: Boolean(s.is_active),
        });
        userMongoId = newUser._id;
        userIdMap.set(s.register_number, newUser._id);
      }

      const p = sqliteParents.find((x) => x.student_id === s.id);
      const sch = sqliteSchools.find((x) => x.student_id === s.id);
      const sibs = sqliteSiblings.filter((x) => x.student_id === s.id);

      let studentDoc = await Student.findOne({ registerNumber: s.register_number });
      const studentPayload: any = {
        user: userMongoId,
        registerNumber: s.register_number,
        fullName: s.full_name,
        department: deptIdMap.get(s.department_id) || itDept._id,
        batch: batchIdMap.get(s.batch_id) || batch2024._id,
        dob: s.dob || undefined,
        bloodGroup: s.blood_group || 'B+ve',
        residentialType: s.residential_type || 'DAY_SCHOLAR',
        mobileNumber: s.mobile_number || undefined,
        email: s.email || undefined,
        address: s.address || undefined,
        parent: {
          fatherName: p?.father_name || '',
          fatherContact: p?.father_contact || '',
          fatherOccupation: p?.father_occupation || '',
          motherName: p?.mother_name || '',
          motherContact: p?.mother_contact || '',
          motherOccupation: p?.mother_occupation || '',
        },
        siblings: sibs.map((sib) => ({
          siblingName: sib.sibling_name,
          siblingContact: sib.sibling_contact || '',
          siblingOccupation: sib.sibling_occupation || '',
        })),
        school: {
          tenthMark: sch?.tenth_mark ? Number(sch.tenth_mark) : 0,
          tenthSchool: sch?.tenth_school || '',
          twelfthMark: sch?.twelfth_mark ? Number(sch.twelfth_mark) : 0,
          twelfthSchool: sch?.twelfth_school || '',
          cutoffMark: sch?.cutoff_mark ? Number(sch.cutoff_mark) : 0,
          admissionType: sch?.admission_type || 'COUNSELLING',
          scholarshipDetails: sch?.scholarship_details || 'Nil',
        },
        profileCompleted: Boolean(s.profile_completed),
        profileCompletedAt: s.profile_completed_at ? new Date(s.profile_completed_at) : undefined,
        isActive: Boolean(s.is_active),
      };

      if (!studentDoc) {
        studentDoc = await Student.create(studentPayload);
      } else {
        Object.assign(studentDoc, studentPayload);
        await studentDoc.save();
      }
      studentIdMap.set(s.id, studentDoc._id);
      studentIdMap.set(s.register_number, studentDoc._id);
    }

    // Also restore Pooja VG (73152421077) if not present
    let poojaUser = await User.findOne({ username: '73152421077' });
    if (!poojaUser) {
      const defaultHash = await bcrypt.hash('Ksrce@1234', 10);
      poojaUser = await User.create({
        username: '73152421077',
        passwordHash: defaultHash,
        role: 'STUDENT',
        email: '73152421077@ksrce.ac.in',
        fullName: 'Pooja VG',
        department: itDept._id,
        isActive: true,
      });
    }
    let poojaStudent = await Student.findOne({ registerNumber: '73152421077' });
    if (!poojaStudent) {
      poojaStudent = await Student.create({
        user: poojaUser._id,
        registerNumber: '73152421077',
        fullName: 'Pooja VG',
        department: itDept._id,
        batch: batch2024._id,
        residentialType: 'DAY_SCHOLAR',
        bloodGroup: 'B+ve',
        parent: {
          fatherName: 'Gopal V',
          fatherContact: '9842100077',
          fatherOccupation: 'Business',
          motherName: 'Vasanthi G',
          motherContact: '9842100078',
          motherOccupation: 'Home Maker',
        },
        school: {
          tenthMark: 468,
          tenthSchool: 'Govt Girls HSS',
          twelfthMark: 554,
          twelfthSchool: 'Govt Girls HSS',
          cutoffMark: 184.5,
          admissionType: 'COUNSELLING',
          scholarshipDetails: 'Nil',
        },
        profileCompleted: true,
        profileCompletedAt: new Date(),
        isActive: true,
      });
    }
    studentIdMap.set('73152421077', poojaStudent._id);

    // 6. Semester Academic Records
    console.log('6. Restoring Semester Academic Records (Semesters 1-8)...');
    const sqliteAcademics = await querySqlite(sqliteDb, 'SELECT * FROM semester_academics');

    for (const a of sqliteAcademics) {
      const studentMongoId = studentIdMap.get(a.student_id);
      if (!studentMongoId) continue;

      let acadDoc = await AcademicRecord.findOne({
        student: studentMongoId,
        semesterNumber: a.semester_number,
      });

      const acadPayload = {
        student: studentMongoId,
        semesterNumber: a.semester_number,
        cgpa: a.cgpa ? Number(a.cgpa) : 0,
        sgpa: a.sgpa ? Number(a.sgpa) : 0,
        arrearsCount: a.arrears_count ? Number(a.arrears_count) : 0,
        arrearsSubjects: a.arrears_subjects || '',
        remarks: a.remarks || '',
      };

      if (!acadDoc) {
        await AcademicRecord.create(acadPayload);
      } else {
        Object.assign(acadDoc, acadPayload);
        await acadDoc.save();
      }
    }

    // 7. Mentor Assignments
    console.log('7. Restoring Mentor Assignments...');
    const adminUser = await User.findOne({ role: 'ADMIN' });
    const defaultAssignerId = adminUser?._id || pavithraUser._id;

    const sqliteAssignments = await querySqlite(sqliteDb, 'SELECT * FROM mentor_assignments');

    for (const ma of sqliteAssignments) {
      const studentMongoId = studentIdMap.get(ma.student_id);
      const mentorMongoId = facultyIdMap.get(ma.mentor_id);
      if (!studentMongoId || !mentorMongoId) continue;

      const studentDoc = await Student.findById(studentMongoId);
      const deptMongoId = studentDoc?.department || itDept._id;

      let asgDoc = await MentorAssignment.findOne({
        student: studentMongoId,
        mentor: mentorMongoId,
      });

      const asgPayload = {
        student: studentMongoId,
        mentor: mentorMongoId,
        department: deptMongoId,
        assignedBy: defaultAssignerId,
        assignedFrom: ma.assigned_from ? new Date(ma.assigned_from) : new Date('2024-08-01'),
        assignedUntil: ma.assigned_until ? new Date(ma.assigned_until) : undefined,
        status: ma.status || 'ACTIVE',
        changeReason: ma.change_reason || 'Initial Allocation',
      };

      if (!asgDoc) {
        await MentorAssignment.create(asgPayload);
      } else {
        Object.assign(asgDoc, asgPayload);
        await asgDoc.save();
      }
    }

    // Ensure Pooja VG is assigned to Pavithra S
    let poojaAsg = await MentorAssignment.findOne({
      student: poojaStudent._id,
      mentor: pavithraFaculty._id,
    });
    if (!poojaAsg) {
      await MentorAssignment.create({
        student: poojaStudent._id,
        mentor: pavithraFaculty._id,
        department: itDept._id,
        assignedBy: defaultAssignerId,
        assignedFrom: new Date('2024-08-01'),
        status: 'ACTIVE',
        changeReason: 'Institutional Allocation',
      });
    }

    // Helper functions for valid enums and types
    const mapCategory = (cat?: string): any => {
      if (!cat) return 'Academic';
      const c = cat.toUpperCase();
      if (c.includes('ACADEMIC')) return 'Academic';
      if (c.includes('TRAIN') || c.includes('PLACE')) return 'Training & Placement';
      if (c.includes('EXTRA') || c.includes('CO-CURR')) return 'Extra-Curricular / Co-Curricular';
      if (c.includes('INNOV')) return 'Innovation';
      if (c.includes('SKILL')) return 'Skill Development';
      return 'Academic';
    };

    const parseRating = (r: any): number => {
      if (typeof r === 'number' && !isNaN(r)) return Math.max(1, Math.min(5, Math.round(r)));
      if (!r) return 4;
      const num = Number(r);
      if (!isNaN(num) && num >= 1 && num <= 5) return Math.round(num);
      const str = String(r).toUpperCase();
      if (str.includes('OUTSTANDING') || str.includes('EXCELLENT')) return 5;
      if (str.includes('GOOD')) return 4;
      if (str.includes('SATISFACTORY') || str.includes('AVERAGE')) return 3;
      if (str.includes('NEEDS_IMPROVEMENT') || str.includes('POOR')) return 2;
      return 3;
    };

    // 8. Meetings
    console.log('8. Restoring Saturday Meeting Records...');
    const sqliteMeetings = await querySqlite(sqliteDb, 'SELECT * FROM meetings');

    for (const m of sqliteMeetings) {
      const studentMongoId = studentIdMap.get(m.student_id);
      const mentorMongoId = facultyIdMap.get(m.mentor_id);
      if (!studentMongoId || !mentorMongoId) continue;

      const meetingDoc = await Meeting.findOne({
        student: studentMongoId,
        meetingDate: m.meeting_date,
      });

      const meetingPayload = {
        student: studentMongoId,
        mentor: mentorMongoId,
        meetingDate: m.meeting_date,
        meetingTime: m.meeting_time || '10:30 AM',
        location: m.location || 'Faculty Cabin / Mentoring Room',
        attendanceStatus: (['PRESENT', 'ABSENT', 'ON_DUTY'].includes(m.attendance_status?.toUpperCase()) ? m.attendance_status.toUpperCase() : 'PRESENT') as any,
        meetingStatus: (['SCHEDULED', 'COMPLETED', 'PENDING', 'PENDING_UPDATE'].includes(m.meeting_status?.toUpperCase()) ? m.meeting_status.toUpperCase() : 'COMPLETED') as any,
        challengesDiscussed: m.challenges_discussed || 'Academic progress and attendance review.',
        correctiveAction: m.corrective_action || 'Advised to adhere to weekly study plan and regular attendance.',
        studentFeedback: m.student_feedback || 'Acknowledged',
        mentorRemarks: m.mentor_remarks || 'Satisfactory progress observed.',
      };

      if (!meetingDoc) {
        await Meeting.create(meetingPayload);
      } else {
        Object.assign(meetingDoc, meetingPayload);
        await meetingDoc.save();
      }
    }

    // 9. Counselling Records
    console.log('9. Restoring Counselling Records...');
    const sqliteCounselling = await querySqlite(sqliteDb, 'SELECT * FROM counselling_records');

    for (const c of sqliteCounselling) {
      const studentMongoId = studentIdMap.get(c.student_id);
      const mentorMongoId = facultyIdMap.get(c.mentor_id);
      if (!studentMongoId || !mentorMongoId) continue;

      const cDoc = await CounsellingRecord.findOne({
        student: studentMongoId,
        sessionDate: c.session_date,
      });

      const cPayload = {
        student: studentMongoId,
        studentId: studentMongoId,
        mentor: mentorMongoId,
        mentorId: mentorMongoId,
        date: c.session_date,
        sessionDate: c.session_date,
        category: mapCategory(c.category),
        challengeObserved: c.challenge_observed || 'General academic performance and guidance session.',
        correctiveAction: c.corrective_action || 'Individual guidance provided on core subject fundamentals.',
        expectedImprovement: c.expected_improvement || 'Targeting improvement in upcoming internal assessments.',
        studentFeedback: c.student_feedback || 'Understood guidance and agreed to follow instructions.',
        mentorRemarks: c.mentor_remarks || 'Student is receptive to suggestions.',
      };

      if (!cDoc) {
        await CounsellingRecord.create(cPayload);
      } else {
        Object.assign(cDoc, cPayload);
        await cDoc.save();
      }
    }

    // 10. Monthly Progress
    console.log('10. Restoring Monthly Progress Evaluations...');
    const sqliteProgress = await querySqlite(sqliteDb, 'SELECT * FROM monthly_progress');

    for (const p of sqliteProgress) {
      const studentMongoId = studentIdMap.get(p.student_id);
      const mentorMongoId = facultyIdMap.get(p.mentor_id);
      if (!studentMongoId || !mentorMongoId) continue;

      const pDoc = await MonthlyProgress.findOne({
        student: studentMongoId,
        academicYear: p.academic_year || '2026-2027',
        monthName: p.month_name || 'Month 1',
      });

      const pPayload = {
        student: studentMongoId,
        mentor: mentorMongoId,
        academicYear: p.academic_year || '2026-2027',
        monthName: p.month_name || 'Month 1',
        academicRating: parseRating(p.academic_rating),
        academicNotes: p.academic_notes || 'Consistent engagement.',
        placementRating: parseRating(p.placement_rating),
        placementNotes: p.placement_notes || 'Active training participation.',
        ecRating: parseRating(p.ec_rating),
        ecNotes: p.ec_notes || 'Club activities attended.',
        innovationRating: parseRating(p.innovation_rating),
        innovationNotes: p.innovation_notes || 'Project work progressing.',
        skillRating: parseRating(p.skill_rating),
        skillNotes: p.skill_notes || 'Skill development track followed.',
      };

      if (!pDoc) {
        await MonthlyProgress.create(pPayload);
      } else {
        Object.assign(pDoc, pPayload);
        await pDoc.save();
      }
    }

    const finalStudentCount = await Student.countDocuments();
    const finalFacultyCount = await Faculty.countDocuments();
    const finalUserCount = await User.countDocuments();
    const finalAcademicCount = await AcademicRecord.countDocuments();
    const finalMeetingCount = await Meeting.countDocuments();

    console.log('============================================================');
    console.log('✓ ALL PREVIOUS DETAILS SUCCESSFULLY RESTORED TO MONGODB!');
    console.log(`- Students: ${finalStudentCount}`);
    console.log(`- Faculty: ${finalFacultyCount}`);
    console.log(`- Users: ${finalUserCount}`);
    console.log(`- Semester Academic Records: ${finalAcademicCount}`);
    console.log(`- Saturday Meeting Logs: ${finalMeetingCount}`);
    console.log('============================================================');
  } finally {
    sqliteDb.close();
  }
}

if (process.argv[1]?.endsWith('restore-all-details.ts')) {
  restoreAllDetails()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Restoration error:', err);
      process.exit(1);
    });
}
