import path from 'path';
import { ROOT_DIR } from '../lib/paths.js';

/** Where drizzle-kit writes migrations and the migrator reads them (absolute, cwd-independent). */
export const MIGRATIONS_DIR = path.join(ROOT_DIR, 'db', 'migrations');

/** Advisory lock key held while migrating, so concurrent deploys can't both migrate. */
export const MIGRATION_LOCK_ID = 726473120; // arbitrary, fixed: "genshin-api migrations"
