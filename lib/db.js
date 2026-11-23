/**
 * The one shared database handle (Postgres via Drizzle).
 *
 * Only features' store.js files (and scripts/db-migrate.mjs) touch the database — services
 * call stores, as they already do for JSON data. Public game data stays in data/*.json; the
 * database holds platform data (accounts, player data, submissions) as those features land.
 *
 * Configured by DATABASE_URL:
 *   postgres://… / postgresql://…  production and local Postgres (node-postgres pool)
 *   pglite://<dir> | pglite://memory  in-process Postgres (dev/tests; @electric-sql/pglite is a devDependency)
 *   unset                         no database: the API runs, DB-backed features report UnavailableError
 *
 * The pool is deliberately small (Railway Hobby: 0.5 vCPU / 512 MB for Postgres, max_connections=20):
 * see POOL_DEFAULTS and docs/database.md.
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { UnavailableError } from './errors.js';
import * as schema from '../db/schema.js';

export const POOL_DEFAULTS = Object.freeze({
   max: 5,                                   // well under the server's max_connections = 20
   idleTimeoutMillis: 30_000,                // give idle connections (and their RAM) back
   connectionTimeoutMillis: 5_000,           // fail fast instead of queueing forever
   statement_timeout: 5_000,                 // no runaway query can burn CPU for long
   idle_in_transaction_session_timeout: 60_000,
   application_name: 'genshin-api',
});

let current = null; // { db, close, kind }

/** True when a database is configured for this process. */
export function isDbConfigured(env = process.env) {
   return Boolean(env.DATABASE_URL?.trim());
}

/** Which driver a DATABASE_URL selects. */
export function driverFor(url) {
   if (/^postgres(ql)?:\/\//i.test(url)) return 'postgres';
   if (/^pglite:\/\//i.test(url)) return 'pglite';
   throw new Error('DATABASE_URL must start with postgres://, postgresql:// or pglite://');
}

/**
 * Opens a database from a URL. Most code should use getDb(); this exists for scripts and tests.
 * @param {string} url
 * @param {{ pool?: object }} [opts] - node-postgres pool overrides (e.g. { max: 1 } for migrations)
 * @returns {Promise<{ db, close: () => Promise<void>, kind: 'postgres'|'pglite' }>}
 */
export async function openDatabase(url, { pool: poolOverrides = {} } = {}) {
   const kind = driverFor(url);
   if (kind === 'postgres') {
      const pool = new pg.Pool({ connectionString: url, ...POOL_DEFAULTS, ...poolOverrides });
      // An idle client erroring (e.g. Postgres restarted) must not crash the process.
      pool.on('error', (err) => console.error('[db] idle client error:', err.message));
      return { db: drizzle({ client: pool, schema }), close: () => pool.end(), kind };
   }
   const { PGlite } = await import('@electric-sql/pglite').catch(() => {
      throw new Error('pglite:// needs the @electric-sql/pglite devDependency (npm install).');
   });
   const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
   const location = url.replace(/^pglite:\/\//i, '');
   const client = location === 'memory' || location === '' ? new PGlite() : new PGlite(location);
   return { db: drizzlePglite({ client, schema }), close: () => client.close(), kind };
}

/**
 * The shared database. Opens lazily on first use.
 * @throws {UnavailableError} when no database is configured
 */
export async function getDb() {
   if (!current) {
      if (!isDbConfigured()) throw new UnavailableError('This feature needs a database, and none is configured.');
      current ??= await openDatabase(process.env.DATABASE_URL.trim());
   }
   return current.db;
}

/** Use a specific database (tests). Pass null to reset. */
export function setDatabase(handle) {
   current = handle;
}

/** Closes the shared database, if open (graceful shutdown, tests). */
export async function closeDb() {
   const handle = current;
   current = null;
   await handle?.close();
}

/**
 * Database status for /health. Never throws and never exposes connection details.
 * @returns {Promise<{ status: 'ok'|'error'|'not_configured', latency_ms?: number }>}
 */
export async function checkDb() {
   if (!current && !isDbConfigured()) return { status: 'not_configured' };
   const started = performance.now();
   try {
      const db = await getDb();
      await db.execute(sql`select 1`);
      return { status: 'ok', latency_ms: Math.round(performance.now() - started) };
   } catch (err) {
      console.error('[db] health check failed:', err.message);
      return { status: 'error' };
   }
}
