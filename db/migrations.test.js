import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { openDatabase } from '../lib/db.js';
import { MIGRATIONS_DIR } from './migrations.js';
import { ROOT_DIR } from '../lib/paths.js';

const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf-8'));

describe('migrations', () => {
   it('journal and SQL files match one-to-one, in order', () => {
      const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
      assert.deepEqual(files, journal.entries.map((e) => `${e.tag}.sql`));
      journal.entries.forEach((e, i) => assert.equal(e.idx, i));
      assert.equal(journal.dialect, 'postgresql');
   });

   it('apply cleanly to a fresh database, and re-running changes nothing', async () => {
      const { db, close } = await openDatabase('pglite://memory');
      try {
         await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
         await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
         const { rows } = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
         assert.equal(rows[0].n, journal.entries.length);
      } finally {
         await close();
      }
   });

   it('scripts/db-migrate.mjs: migrates a file-backed database, is re-runnable, and needs DATABASE_URL', () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genshin-db-'));
      const run = (env) => spawnSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'db-migrate.mjs')], {
         cwd: os.tmpdir(), // must not depend on the working directory
         env: { PATH: process.env.PATH, ...env },
         encoding: 'utf-8',
      });
      try {
         const first = run({ DATABASE_URL: `pglite://${dir}` });
         assert.equal(first.status, 0, first.stderr);
         assert.match(first.stdout, /up to date \(pglite/);
         assert.equal(run({ DATABASE_URL: `pglite://${dir}` }).status, 0);
         const missing = run({});
         assert.equal(missing.status, 1);
         assert.match(missing.stderr, /DATABASE_URL is not set/);
      } finally {
         fs.rmSync(dir, { recursive: true, force: true });
      }
   });
});
