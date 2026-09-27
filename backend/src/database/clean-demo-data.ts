import fs from 'fs';
import path from 'path';
import { connectDB } from '../config/database.js';
import {
  User,
  Student,
  Faculty,
  AcademicRecord,
  MentorAssignment,
  Meeting,
  CounsellingRecord,
  MonthlyProgress,
  Notification,
  AuditLog,
  StudentDocument,
} from '../models/index.js';
import { ensureSystemBootstrap } from './bootstrap.js';

export async function removeAllDemoData(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || process.env.RENDER === 'true') {
    throw new Error('CRITICAL SAFETY PRECAUTION: Purging data is strictly forbidden in production or Render environments.');
  }

  await connectDB();
  console.log('============================================================');
  console.log('PURGING ALL DEMO / SAMPLE DATA FROM MONGODB...');
  console.log('============================================================');

  // 1. Delete all non-admin users (students, sample mentors, sample HOD)
  const deletedUsers = await User.deleteMany({ role: { $ne: 'ADMIN' } });
  console.log(`- Removed ${deletedUsers.deletedCount} demo/sample users.`);

  // 2. Delete all student records
  const deletedStudents = await Student.deleteMany({});
  console.log(`- Removed ${deletedStudents.deletedCount} demo student profiles.`);

  // 3. Delete all faculty records
  const deletedFaculty = await Faculty.deleteMany({});
  console.log(`- Removed ${deletedFaculty.deletedCount} demo faculty profiles.`);

  // 4. Delete all academic records
  const deletedAcademic = await AcademicRecord.deleteMany({});
  console.log(`- Removed ${deletedAcademic.deletedCount} demo academic records.`);

  // 5. Delete all mentor assignments
  const deletedAssignments = await MentorAssignment.deleteMany({});
  console.log(`- Removed ${deletedAssignments.deletedCount} demo mentor assignments.`);

  // 6. Delete all meetings
  const deletedMeetings = await Meeting.deleteMany({});
  console.log(`- Removed ${deletedMeetings.deletedCount} demo meeting records.`);

  // 7. Delete all counselling records
  const deletedCounselling = await CounsellingRecord.deleteMany({});
  console.log(`- Removed ${deletedCounselling.deletedCount} demo counselling records.`);

  // 8. Delete all monthly progress evaluations
  const deletedProgress = await MonthlyProgress.deleteMany({});
  console.log(`- Removed ${deletedProgress.deletedCount} demo monthly progress records.`);

  // 9. Delete all uploaded document records
  const deletedDocs = await StudentDocument.deleteMany({});
  console.log(`- Removed ${deletedDocs.deletedCount} demo document metadata records.`);

  // 10. Delete all notifications
  const deletedNotifs = await Notification.deleteMany({});
  console.log(`- Removed ${deletedNotifs.deletedCount} demo notifications.`);

  // 11. Clear audit logs
  const deletedAudits = await AuditLog.deleteMany({});
  console.log(`- Removed ${deletedAudits.deletedCount} demo audit log entries.`);

  // 12. Clean uploaded physical files from disk
  const uploadsDir = path.resolve(process.cwd(), 'uploads/documents');
  if (fs.existsSync(uploadsDir)) {
    const files = fs.readdirSync(uploadsDir);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(uploadsDir, file));
      } catch (err) {
        console.warn(`Could not delete file ${file}:`, err);
      }
    }
    console.log(`- Cleaned ${files.length} demo uploaded physical files.`);
  }

  // 13. Ensure clean bootstrap (Admin account + Master lookups)
  await ensureSystemBootstrap();

  console.log('============================================================');
  console.log('✓ ALL DEMO DATA SUCCESSFULLY PURGED FROM MONGODB.');
  console.log('✓ Clean institutional state confirmed.');
  console.log('============================================================');
}

if (process.argv[1]?.endsWith('clean-demo-data.ts')) {
  removeAllDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Data clean error:', err);
      process.exit(1);
    });
}
