import bcrypt from 'bcryptjs';
import {
  Department,
  Batch,
  User,
  SystemSetting,
  School,
  Faculty,
  Student,
  MentorAssignment,
} from '../models/index.js';
import { runMigrations } from './migrate.js';
import { FEEDER_SCHOOLS } from './feeder-schools.data.js';

/**
 * Clean Institutional System Bootstrap
 * Initializes ONLY schema indexes, essential institutional lookups (departments, batches, Saturday meeting settings),
 * and the configurable primary Administrator account.
 *
 * ABSOLUTELY NO DEMO/SAMPLE STUDENTS, FACULTY, COUNSELLING, OR DOCUMENTS ARE INSERTED.
 */
export async function ensureSystemBootstrap(): Promise<void> {
  // 1. Ensure all collections, schemas, and indexes are synchronized
  await runMigrations();

  console.log('Ensuring clean institutional configuration in MongoDB...');

  // 2. Institutional Master Lookups: Academic Departments (if not existing)
  const institutionalDepartments = [
    { code: 'CSE', name: 'Computer Science and Engineering' },
    { code: 'ECE', name: 'Electronics and Communication Engineering' },
    { code: 'IT', name: 'Information Technology' },
    { code: 'MECH', name: 'Mechanical Engineering' },
  ];

  for (const dept of institutionalDepartments) {
    const existing = await Department.findOne({ code: dept.code });
    if (!existing) {
      await Department.create(dept);
      console.log(`[Bootstrap] Created institutional department: ${dept.code} - ${dept.name}`);
    }
  }

  // 3. Institutional Master Lookups: Academic Batches (if not existing)
  const institutionalBatches = [
    { name: '2022-2026', startYear: 2022, endYear: 2026 },
    { name: '2023-2027', startYear: 2023, endYear: 2027 },
    { name: '2024-2028', startYear: 2024, endYear: 2028 },
    { name: '2025-2029', startYear: 2025, endYear: 2029 },
  ];

  for (const b of institutionalBatches) {
    const existing = await Batch.findOne({ name: b.name });
    if (!existing) {
      await Batch.create(b);
      console.log(`[Bootstrap] Created institutional batch: ${b.name}`);
    }
  }

  // 4. Institutional Master Lookups: Fixed Saturday Mentoring Settings (if not existing)
  const settingsData = [
    { key: 'saturday_meeting_day', value: 'Saturday', description: 'Institutional fixed meeting day' },
    { key: 'saturday_meeting_time', value: '10:30 AM', description: 'Institutionally configured Saturday meeting time' },
    { key: 'saturday_meeting_location', value: 'Faculty Cabin / Mentoring Room', description: 'Default institutional meeting venue' },
    { key: 'saturday_meeting_frequency', value: 'Weekly', description: 'Weekly Saturday frequency' },
  ];

  for (const s of settingsData) {
    const existing = await SystemSetting.findOne({ key: s.key });
    if (!existing) {
      await SystemSetting.create(s);
    }
  }

  // 5. Configurable Administrator Account from Environment Variables
  const adminUsername = (process.env.ADMIN_USERNAME || 'Ksrce@admin').trim();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@ksrce.ac.in').trim();
  const rawAdminPassword = (process.env.ADMIN_PASSWORD || '').trim();

  if (!rawAdminPassword) {
    throw new Error('ADMIN_PASSWORD environment variable must be set in .env');
  }

  const adminDeptCode = (process.env.ADMIN_DEPT || 'IT').toUpperCase().trim();
  const adminDept = (await Department.findOne({ code: adminDeptCode })) || (await Department.findOne({ code: 'IT' })) || (await Department.findOne({ code: 'CSE' }));

  // Check if an Admin account already exists (by role 'ADMIN', configured username, or legacy 'admin')
  let adminUser = await User.findOne({
    $or: [
      { role: 'ADMIN' },
      { username: { $regex: new RegExp(`^${adminUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
      { username: 'admin' },
    ],
  });

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(rawAdminPassword, saltRounds);

  if (!adminUser) {
    adminUser = await User.create({
      username: adminUsername,
      email: adminEmail || 'admin@ksrce.ac.in',
      passwordHash,
      role: 'ADMIN',
      fullName: 'System Administrator',
      department: adminDept?._id,
      isActive: true,
    });
    console.log(`[Bootstrap] Initialized primary Administrator account (${adminUsername}).`);
  } else {
    adminUser.username = adminUsername;
    adminUser.email = adminEmail || adminUser.email || 'admin@ksrce.ac.in';
    adminUser.passwordHash = passwordHash;
    adminUser.role = 'ADMIN';
    adminUser.fullName = adminUser.fullName || 'System Administrator';
    adminUser.isActive = true;
    if (adminDept) {
      adminUser.department = adminDept._id;
    }
    await adminUser.save();
    console.log(`[Bootstrap] Configured/updated Administrator account (${adminUsername}).`);
  }

  // Ensure no duplicate Admin accounts exist
  await User.deleteMany({ role: 'ADMIN', _id: { $ne: adminUser._id } });

  // 6. Institutional Master Lookups: Standard Feeder Schools (if empty)
  const schoolCount = await School.countDocuments();
  if (schoolCount === 0) {
    console.log('[Bootstrap] Initializing institutional feeder schools directory...');
    await School.insertMany(FEEDER_SCHOOLS);
    console.log(`[Bootstrap] Seeded ${FEEDER_SCHOOLS.length} feeder schools across Tamil Nadu.`);
  } else {
    console.log(`[Bootstrap] Feeder schools already present (${schoolCount} schools in database).`);
  }

  // 7. Ensure clean institutional state: ONLY the Admin account exists, no other data
  await Promise.all([
    User.deleteMany({ role: { $ne: 'ADMIN' } }),
    Faculty.deleteMany({}),
    Student.deleteMany({}),
    MentorAssignment.deleteMany({}),
  ]);

  console.log('✓ Clean institutional bootstrap completed. Only Admin account exists in database.');
}

if (process.argv[1]?.endsWith('bootstrap.ts')) {
  ensureSystemBootstrap()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Bootstrap error:', err);
      process.exit(1);
    });
}
