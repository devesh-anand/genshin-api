// Runs against a real Postgres only when TEST_DATABASE_URL is set (skipped in CI by default):
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres npm test
// Covers what PGlite can't: the node-postgres pool, session settings and the migration lock.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { spawn } from 'child_process';
import { sql } from 'drizzle-orm';
import { openDatabase, POOL_DEFAULTS } from '../lib/db.js';
import { ROOT_DIR } from '../lib/paths.js';

const url = process.env.TEST_DATABASE_URL;

describe('real Postgres', { skip: !url && 'set TEST_DATABASE_URL to run' }, () => {
   it('applies pool session settings', async () => {
      const { db, close } = await openDatabase(url);
      try {
         const { rows } = await db.execute(sql`select current_setting('statement_timeout') as st,
            current_setting('application_name') as app`);
         assert.equal(rows[0].app, POOL_DEFAULTS.application_name);
         assert.equal(rows[0].st, `${POOL_DEFAULTS.statement_timeout / 1000}s`);
      } finally {
         await close();
      }
   });

   it('never opens more than POOL_DEFAULTS.max connections', async () => {
      const { db, close } = await openDatabase(url);
      try {
         await Promise.all(Array.from({ length: 20 }, () => db.execute(sql`select pg_sleep(0.2)`)));
         const { rows } = await db.execute(sql`select count(*)::int as n from pg_stat_activity
            where application_name = ${POOL_DEFAULTS.application_name}`);
         assert.ok(rows[0].n <= POOL_DEFAULTS.max, `${rows[0].n} connections`);
      } finally {
         await close();
      }
   });

   it('stops runaway queries at the statement timeout', async () => {
      const { db, close } = await openDatabase(url);
      try {
         await assert.rejects(db.execute(sql`select pg_sleep(${POOL_DEFAULTS.statement_timeout / 1000 + 2})`));
      } finally {
         await close();
      }
   });

   it('concurrent migration runs all succeed (advisory lock) and record each migration once', async () => {
      const run = () => new Promise((resolve) => {
         const p = spawn(process.execPath, [path.join(ROOT_DIR, 'scripts', 'db-migrate.mjs')], {
            env: { ...process.env, DATABASE_URL: url },
         });
         p.on('exit', resolve);
      });
      assert.deepEqual(await Promise.all([run(), run(), run()]), [0, 0, 0]);
      const { db, close } = await openDatabase(url);
      try {
         const { rows } = await db.execute(sql`select count(*)::int as n, count(distinct hash)::int as d
            from drizzle.__drizzle_migrations`);
         assert.equal(rows[0].n, rows[0].d);
      } finally {
         await close();
      }
   });
});
