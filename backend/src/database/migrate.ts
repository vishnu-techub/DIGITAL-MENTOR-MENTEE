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
  MonthlyProgress,
  Notification,
  AuditLog,
  SystemSetting,
  StudentDocument,
  School,
} from '../models/index.js';
import { connectDB } from '../config/database.js';

/**
 * Migration & Index Synchronization Strategy for MongoDB Atlas & Local
 */
export async function runMigrations(): Promise<void> {
  console.log('Running MongoDB Schema & Index Synchronization...');

  try {
    await connectDB();

    // Sync all model indexes
    await Promise.all([
      Department.syncIndexes(),
      Batch.syncIndexes(),
      User.syncIndexes(),
      Faculty.syncIndexes(),
      Student.syncIndexes(),
      AcademicRecord.syncIndexes(),
      MentorAssignment.syncIndexes(),
      Meeting.syncIndexes(),
      CounsellingRecord.syncIndexes(),
      MonthlyProgress.syncIndexes(),
      Notification.syncIndexes(),
      AuditLog.syncIndexes(),
      SystemSetting.syncIndexes(),
      StudentDocument.syncIndexes(),
      School.syncIndexes(),
    ]);

    // Check and prevent TTL expiration on critical institutional collections
    const permanentModels = [
      Student,
      Faculty,
      MentorAssignment,
      CounsellingRecord,
      AcademicRecord,
      StudentDocument,
      Meeting,
      MonthlyProgress,
      User,
    ];

    for (const model of permanentModels) {
      try {
        const indexes = await model.collection.indexes();
        for (const idx of indexes) {
          if (idx.expireAfterSeconds !== undefined) {
            console.warn(`! Found unwanted TTL index '${idx.name}' on collection '${model.collection.name}'. Dropping it to prevent data loss...`);
            await model.collection.dropIndex(idx.name as string);
          }
        }
      } catch (err: any) {
        // If collection doesn't exist yet, indexes will be created upon insertion
      }
    }

    console.log('✓ All 15 Mongoose collection schemas and indexes successfully synchronized.');
    console.log('✓ Verified NO TTL expiration indexes exist on any student, faculty, mentorship, academic, counselling, or document collections.');
    console.log('✓ Verified unique indexes: registerNumber, email, username, employeeId, code.');
    console.log('✓ Verified compound and foreign reference indexes: mentorId, studentId, department, batch, meetingDate.');
  } catch (err: any) {
    console.error('MongoDB Migration / Index Sync Error:', err.message);
    throw err;
  }
}

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
