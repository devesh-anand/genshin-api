import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import {
   POOL_DEFAULTS, isDbConfigured, driverFor, openDatabase, getDb, setDatabase, closeDb, checkDb,
} from './db.js';
import { UnavailableError } from './errors.js';

describe('db: configuration', () => {
   it('detects whether a database is configured', () => {
      assert.equal(isDbConfigured({}), false);
      assert.equal(isDbConfigured({ DATABASE_URL: '  ' }), false);
      assert.equal(isDbConfigured({ DATABASE_URL: 'postgres://x' }), true);
   });

   it('picks the driver from the URL scheme', () => {
      assert.equal(driverFor('postgres://u@h/db'), 'postgres');
      assert.equal(driverFor('postgresql://u@h/db'), 'postgres');
      assert.equal(driverFor('pglite://memory'), 'pglite');
      assert.throws(() => driverFor('mysql://x'), /must start with/);
   });

   it('keeps the pool small enough for the Railway instance (max_connections = 20)', () => {
      assert.ok(POOL_DEFAULTS.max <= 5);
      assert.ok(POOL_DEFAULTS.statement_timeout > 0 && POOL_DEFAULTS.statement_timeout <= 10_000);
      assert.ok(POOL_DEFAULTS.idleTimeoutMillis <= 60_000);
      assert.ok(Object.isFrozen(POOL_DEFAULTS));
   });
});

describe('db: without a database', () => {
   it('getDb() throws UnavailableError (503), checkDb() reports not_configured', async () => {
      const saved = process.env.DATABASE_URL;
      delete process.env.DATABASE_URL;
      try {
         setDatabase(null);
         await assert.rejects(getDb(), (e) => e instanceof UnavailableError && e.status === 503);
         assert.deepEqual(await checkDb(), { status: 'not_configured' });
      } finally {
         if (saved !== undefined) process.env.DATABASE_URL = saved;
      }
   });
});

describe('db: with a database (PGlite in memory)', () => {
   after(() => closeDb());

   it('opens, answers health checks, and closes', async () => {
      const handle = await openDatabase('pglite://memory');
      assert.equal(handle.kind, 'pglite');
      setDatabase(handle);
      const db = await getDb();
      const { rows } = await db.execute(sql`select 1 + 1 as two`);
      assert.equal(Number(rows[0].two), 2);
      const health = await checkDb();
      assert.equal(health.status, 'ok');
      assert.ok(Number.isInteger(health.latency_ms));
      await closeDb();
   });

   it('reports error (never throws, never leaks details) when the database fails', async () => {
      const original = console.error;
      console.error = () => {};
      try {
         setDatabase({ db: { execute: async () => { throw new Error('password authentication failed for "secret"'); } }, close: async () => {} });
         const health = await checkDb();
         assert.deepEqual(health, { status: 'error' });
      } finally {
         console.error = original;
         setDatabase(null);
      }
   });
});
