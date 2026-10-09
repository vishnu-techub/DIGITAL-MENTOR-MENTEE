import bcrypt from 'bcryptjs';
import {
  Department,
  Batch,
  User,
  SystemSetting,
  School,
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

  console.log('Ensuring clean institutional configuration in the local file store...');

  // 2. Institutional Master Lookups: Academic Departments (if not existing)
  const institutionalDepartments = [
    { code: 'AUTO', name: 'Automobile Engineering' },
    { code: 'BME', name: 'Biomedical Engineering' },
    { code: 'CSE', name: 'Computer Science and Engineering' },
    { code: 'CIVIL', name: 'Civil Engineering' },
    { code: 'CSD', name: 'Computer Science and Design' },
    { code: 'CSE_IOT', name: 'Computer Science and Engineering (IOT)' },
    { code: 'CSE_CS', name: 'Computer Science and Engineering (Cyber Security)' },
    { code: 'ECE', name: 'Electronics and Communication Engineering' },
    { code: 'EEE', name: 'Electrical and Electronics Engineering' },
    { code: 'MECH', name: 'Mechanical Engineering' },
    { code: 'IT', name: 'Information Technology' },
    { code: 'SFE', name: 'Safety and Fire Engineering' },
    { code: 'MCA', name: 'Master of Computer Applications (MCA)' },
    { code: 'MBA', name: 'Management Studies (MBA)' },
    { code: 'AIDS', name: 'Artificial Intelligence and Data Science' },
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
      fullName: 'System admin',
      department: adminDept?._id,
      isActive: true,
    });
    console.log(`[Bootstrap] Initialized primary Administrator account (${adminUsername}).`);
  } else {
    // An administrator already exists. PRESERVE the account and, critically, the
    // stored password.
    //
    // The previous behaviour re-hashed ADMIN_PASSWORD and wrote it over the stored
    // hash on EVERY startup. If the admin had changed their password in the app, or
    // ADMIN_PASSWORD had drifted from what was actually stored, the next restart
    // silently reverted the credential and the password the user actually held was
    // rejected with HTTP 401. Bootstrap must be able to re-create a missing admin,
    // but it must never overwrite one that already exists.
    //
    // A deliberate, explicit reset remains available: set
    // ADMIN_FORCE_PASSWORD_RESET=true together with ADMIN_PASSWORD to re-apply the
    // configured password once.
    const forcePasswordReset = ['1', 'true', 'yes', 'on'].includes(
      (process.env.ADMIN_FORCE_PASSWORD_RESET || '').trim().toLowerCase()
    );

    if (forcePasswordReset) {
      adminUser.passwordHash = passwordHash;
      console.log('[Bootstrap] ADMIN_FORCE_PASSWORD_RESET is set - resetting the Administrator password from ADMIN_PASSWORD.');
    }

    // Keep the account usable as the system administrator, but never clobber the
    // identity/credential fields an operator or the admin themselves may have set.
    if (adminUser.role !== 'ADMIN') {
      adminUser.role = 'ADMIN';
    }
    if (adminUser.isActive !== true) {
      adminUser.isActive = true;
    }

    await adminUser.save();
    console.log(
      forcePasswordReset
        ? `[Bootstrap] Administrator password reset for (${adminUser.username}); account preserved.`
        : `[Bootstrap] Existing Administrator (${adminUser.username}) preserved (password unchanged). Set ADMIN_FORCE_PASSWORD_RESET=true to reset it.`
    );
  }

  // 6. Institutional Master Lookups: Standard Feeder Schools (if empty)
  const schoolCount = await School.countDocuments();
  if (schoolCount === 0) {
    console.log('[Bootstrap] Initializing institutional feeder schools directory...');
    await School.insertMany(FEEDER_SCHOOLS);
    console.log(`[Bootstrap] Seeded ${FEEDER_SCHOOLS.length} feeder schools across Tamil Nadu.`);
  } else {
    console.log(`[Bootstrap] Feeder schools already present (${schoolCount} schools in database).`);
  }

  // NOTE: Existing student, faculty, mentorship, academic, and counselling data are strictly preserved.
  // No deletion or clearing operations are ever performed during bootstrap or server startup.
  console.log('✓ Institutional bootstrap completed: System configuration and indexes verified.');
}

if (process.argv[1]?.endsWith('bootstrap.ts')) {
  ensureSystemBootstrap()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Bootstrap error:', err);
      process.exit(1);
    });
}
