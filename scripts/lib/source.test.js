import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_AGENT, isReleased } from './source.mjs';

const NOW = Date.UTC(2026, 10, 22);
const secs = (ms) => Math.floor(ms / 1000);

describe('isReleased', () => {
   it('accepts a release time in the past (or exactly now)', () => {
      assert.equal(isReleased({ release: secs(NOW) - 86400 }, NOW), true);
      assert.equal(isReleased({ release: secs(NOW) }, NOW), true);
   });

   it('rejects future, missing and junk release times', () => {
      assert.equal(isReleased({ release: secs(NOW) + 3600 }, NOW), false);
      assert.equal(isReleased({}, NOW), false);
      assert.equal(isReleased(null, NOW), false);
      assert.equal(isReleased({ release: 0 }, NOW), false);
      assert.equal(isReleased({ release: 'soon' }, NOW), false);
   });
});

describe('User-Agent', () => {
   it('names the project, not a browser', () => {
      assert.match(USER_AGENT, /genshin-api/);
      assert.match(USER_AGENT, /github\.com\/devesh-anand\/genshin-api/);
      assert.doesNotMatch(USER_AGENT, /Mozilla|Chrome|Safari/);
   });

   it('no script sends its own User-Agent string', () => {
      const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
      const files = [...fs.readdirSync(dir).map((f) => path.join(dir, f)), ...fs.readdirSync(path.join(dir, 'lib')).map((f) => path.join(dir, 'lib', f))]
         .filter((f) => f.endsWith('.mjs') && !f.endsWith(`lib${path.sep}source.mjs`));
      for (const f of files) {
         const src = fs.readFileSync(f, 'utf8');
         assert.doesNotMatch(src, /['"]User-Agent['"]\s*:\s*['"`]/, `${path.basename(f)} hard-codes a User-Agent`);
         assert.doesNotMatch(src, /Mozilla\/5\.0/, `${path.basename(f)} sends a browser User-Agent`);
      }
   });
});
