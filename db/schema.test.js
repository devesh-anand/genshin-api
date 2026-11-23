// Every feature's tables live in features/<name>/schema.js and are re-exported by
// db/schema.js — the registry drizzle-kit and lib/db.js read.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import * as registry from './schema.js';
import { ROOT_DIR } from '../lib/paths.js';

const featuresDir = path.join(ROOT_DIR, 'features');
const features = fs.readdirSync(featuresDir).filter((f) => fs.existsSync(path.join(featuresDir, f, 'schema.js')));

describe('schema registry', () => {
   it('every features/*/schema.js export is in db/schema.js', async () => {
      const registered = new Set(Object.values(registry));
      for (const f of features) {
         const mod = await import(`../features/${f}/schema.js`);
         for (const [name, value] of Object.entries(mod)) {
            assert.ok(registered.has(value), `features/${f}/schema.js exports "${name}", missing from db/schema.js`);
         }
      }
   });

   it('only stores and the health check touch the database', () => {
      const offenders = [];
      for (const f of fs.readdirSync(featuresDir)) {
         for (const file of fs.readdirSync(path.join(featuresDir, f)).filter((x) => x.endsWith('.js') && !x.endsWith('.test.js'))) {
            const src = fs.readFileSync(path.join(featuresDir, f, file), 'utf-8');
            const usesDb = /from ['"](\.\.\/)+lib\/db\.js['"]/.test(src);
            const allowed = file === 'store.js' || file === 'schema.js' || (f === 'health' && file === 'service.js');
            if (usesDb && !allowed) offenders.push(`features/${f}/${file}`);
         }
      }
      assert.deepEqual(offenders, [], 'import lib/db.js only from store.js (data access) — services call stores');
   });
});
