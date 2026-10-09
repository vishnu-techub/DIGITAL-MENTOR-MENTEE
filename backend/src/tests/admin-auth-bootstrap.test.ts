/**
 * REGRESSION SUITE — Administrator credential lifecycle across restarts.
 *
 * Defect this suite locks down:
 * `ensureSystemBootstrap()` used to re-hash `ADMIN_PASSWORD` and write it over the
 * stored admin `passwordHash` on EVERY startup. An admin who changed their password
 * in the app (or whose stored hash had simply drifted from `ADMIN_PASSWORD`) had
 * that password silently reverted on the next server start, so the password they
 * actually held was rejected with HTTP 401.
 *
 * Expected behaviour now:
 *   - a missing admin is created from `ADMIN_PASSWORD` (unchanged);
 *   - an existing admin's password and identity are PRESERVED across restarts;
 *   - an explicit `ADMIN_FORCE_PASSWORD_RESET=true` re-applies `ADMIN_PASSWORD`
 *     to the existing account.
 *
 * TEMPORARY LOCAL FILE STORAGE. The suite runs against a throwaway data directory,
 * so it can never touch `backend/data/`. Application modules are imported
 * dynamically because `config/database.js` -> `services/localStorage.service.ts`
 * resolves `DATA_DIR` at import time.
 */
import assert from 'assert';
import { useTemporaryLocalStore } from './helpers/local-test-store.js';

const store = useTemporaryLocalStore('admin-auth-bootstrap');

const checks: Array<{ name: string; ok: boolean }> = [];
function check(name: string, ok: boolean): void {
  checks.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
}

async function run(): Promise<void> {
  console.log('================================================================');
  console.log('ADMIN CREDENTIAL LIFECYCLE REGRESSION (bootstrap preserves the account)');
  console.log('================================================================\n');

  const { connectDB, disconnectDB } = await import('../config/database.js');
  const { ensureSystemBootstrap } = await import('../database/bootstrap.js');
  const { User } = await import('../models/index.js');
  const bcrypt = (await import('bcryptjs')).default;

  const BOOT_PASSWORD = 'Ksrce@1234';
  const IN_APP_PASSWORD = 'MyOwnNew@777';

  process.env.ADMIN_USERNAME = 'Ksrce@admin';
  process.env.ADMIN_EMAIL = 'admin@ksrce.ac.in';
  process.env.ADMIN_PASSWORD = BOOT_PASSWORD;
  process.env.ADMIN_DEPT = 'IT';
  delete process.env.ADMIN_FORCE_PASSWORD_RESET;

  await connectDB();

  // --- 1. First boot on an empty store still creates the admin -------------
  await ensureSystemBootstrap();
  let admin: any = await User.findOne({ role: 'ADMIN' });
  check('fresh store: an ADMIN account is created', !!admin);
  check('fresh store: ADMIN_PASSWORD matches the stored hash', await bcrypt.compare(BOOT_PASSWORD, admin.passwordHash));
  check('fresh store: the account is active', admin.isActive === true);

  // --- 2. Admin changes their own password in the app, plus identity fields -
  admin.passwordHash = await bcrypt.hash(IN_APP_PASSWORD, 10);
  admin.email = 'owner.personal@example.com';
  admin.fullName = 'Renamed Administrator';
  await admin.save();

  // --- 3. Next server start must PRESERVE that account ---------------------
  await ensureSystemBootstrap();
  admin = await User.findOne({ role: 'ADMIN' });
  check('restart: the password changed in the app still works', await bcrypt.compare(IN_APP_PASSWORD, admin.passwordHash));
  check('restart: the stale ADMIN_PASSWORD no longer works (was silently reverted before)', !(await bcrypt.compare(BOOT_PASSWORD, admin.passwordHash)));
  check('restart: operator-managed email is preserved', admin.email === 'owner.personal@example.com');
  check('restart: operator-managed fullName is preserved', admin.fullName === 'Renamed Administrator');
  check('restart: account remains an active ADMIN', admin.role === 'ADMIN' && admin.isActive === true);

  // A second restart must not change anything either.
  const hashAfterFirstRestart = admin.passwordHash;
  await ensureSystemBootstrap();
  admin = await User.findOne({ role: 'ADMIN' });
  check('second restart: stored hash is byte-identical', admin.passwordHash === hashAfterFirstRestart);

  // --- 4. Explicit opt-in reset re-applies ADMIN_PASSWORD ------------------
  process.env.ADMIN_FORCE_PASSWORD_RESET = 'true';
  await ensureSystemBootstrap();
  admin = await User.findOne({ role: 'ADMIN' });
  check('ADMIN_FORCE_PASSWORD_RESET=true: ADMIN_PASSWORD works again', await bcrypt.compare(BOOT_PASSWORD, admin.passwordHash));
  check('ADMIN_FORCE_PASSWORD_RESET=true: previous app password no longer works', !(await bcrypt.compare(IN_APP_PASSWORD, admin.passwordHash)));
  check('ADMIN_FORCE_PASSWORD_RESET=true: email is still not clobbered', admin.email === 'owner.personal@example.com');

  // --- 5. The reset is one-shot, not sticky --------------------------------
  delete process.env.ADMIN_FORCE_PASSWORD_RESET;
  admin.passwordHash = await bcrypt.hash(IN_APP_PASSWORD, 10);
  await admin.save();
  await ensureSystemBootstrap();
  admin = await User.findOne({ role: 'ADMIN' });
  check('reset is one-shot: a later restart preserves the new password', await bcrypt.compare(IN_APP_PASSWORD, admin.passwordHash));

  await disconnectDB();
  await store.teardown();
}

run()
  .then(() => {
    const failed = checks.filter((c) => !c.ok);
    console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
    if (failed.length > 0) {
      console.error(`\nFAILED: ${failed.map((f) => f.name).join('; ')}`);
      process.exit(1);
    }
    console.log('All admin credential lifecycle checks passed.');
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('\nSuite error:', err);
    try {
      await store.teardown();
    } catch {
      /* ignore teardown errors on failure */
    }
    process.exit(1);
  });
