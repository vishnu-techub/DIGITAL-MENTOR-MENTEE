import { ensureSystemBootstrap } from './bootstrap.js';

/**
 * Legacy Seed Script - Replaced by Clean Institutional Bootstrap
 * Demo data seeding is permanently disabled.
 * The local file store is the sole source of truth for this deployment.
 */
export async function seedDatabase(): Promise<void> {
  console.log('[Notice] Demo seed script is disabled. Performing clean institutional bootstrap instead.');
  await ensureSystemBootstrap();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
