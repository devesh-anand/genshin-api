// HTTP integration tests + structural checks that keep the codebase conventions honest.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createApp, ROUTES } from './app.js';
import { ROOT_DIR } from './lib/paths.js';

let server, base;
before(async () => {
   server = createApp({ rateLimit: false }).listen(0);
   await new Promise((r) => server.once('listening', r));
   base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const get = async (p) => {
   const res = await fetch(base + p);
   const type = res.headers.get('content-type') ?? '';
   return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() : await res.text() };
};

describe('REST API', () => {
   it('GET / says hello', async () => assert.equal((await get('/')).body, 'Welcome to genshin-api'));

   it('lists return slugs by default and summaries with ?details=true', async () => {
      for (const key of ['characters', 'weapons', 'artifacts', 'materials', 'enemies']) {
         const slugs = await get(`/${key}`);
         assert.equal(slugs.status, 200, key);
         assert.ok(slugs.body[key].length > 0 && typeof slugs.body[key][0] === 'string', key);
         const details = await get(`/${key}?details=true`);
         assert.equal(details.body[key][0].key, slugs.body[key][0], key);
      }
   });

   it('singular and plural mounts are equivalent', async () => {
      assert.deepEqual((await get('/character/nahida')).body, (await get('/characters/nahida')).body);
   });

   it('unknown entities are 404 with a message', async () => {
      for (const [p, msg] of [
         ['/characters/nope', 'Character not found.'],
         ['/weapons/nope', 'Weapon not found.'],
         ['/artifacts/nope', 'Artifact set not found.'],
         ['/materials/nope', 'Material not found.'],
         ['/enemies/nope', 'Enemy not found.'],
      ]) {
         const r = await get(p);
         assert.equal(r.status, 404, p);
         assert.deepEqual(r.body, { error: msg }, p);
      }
   });

   it('legacy character endpoints still work', async () => {
      assert.ok((await get('/characters/element/pyro')).body.characters.length > 0);
      assert.ok((await get('/characters/weapon/bow')).body.characters.length > 0);
      assert.ok((await get('/characters/imglist')).body.characters[0].key);
      assert.ok((await get('/characters/imglist/pyro')).body.characters[0].key);
   });

   it('search validates input and sets a 5-minute cache', async () => {
      assert.equal((await get('/search?q=a')).status, 400);
      const r = await get('/search?q=nahida');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'public, max-age=300');
   });

   it('health is never cached', async () => {
      const r = await get('/health');
      assert.equal(r.body.status, 'ok');
      assert.equal(r.headers.get('cache-control'), 'no-store');
   });

   it('default cache header is 1 hour', async () => {
      assert.equal((await get('/weapons')).headers.get('cache-control'), 'public, max-age=3600');
   });
});

describe('REST rate limiting', () => {
   it('counts each client IP separately behind the proxy (trust proxy)', async () => {
      const limited = createApp({ rateLimit: true }).listen(0);
      await new Promise((r) => limited.once('listening', r));
      const url = `http://127.0.0.1:${limited.address().port}/health`;
      const as = (ip) => fetch(url, { headers: { 'x-forwarded-for': ip } });
      try {
         let res;
         for (let i = 0; i < 101; i++) res = await as('198.51.100.1');
         assert.equal(res.status, 429, 'client A should be limited after 100 requests');
         assert.equal((await as('198.51.100.2')).status, 200, 'client B must not share A\'s bucket');
      } finally {
         limited.close();
      }
   });
});

describe('codebase conventions', () => {
   const featuresDir = path.join(ROOT_DIR, 'features');
   const features = fs.readdirSync(featuresDir).filter((f) => fs.statSync(path.join(featuresDir, f)).isDirectory());
   const has = (f, file) => fs.existsSync(path.join(featuresDir, f, file));

   it('every feature has a service.js and a service.test.js', () => {
      for (const f of features) {
         assert.ok(has(f, 'service.js'), `features/${f}/service.js missing`);
         assert.ok(has(f, 'service.test.js'), `features/${f}/service.test.js missing`);
      }
   });

   it('every features/*/rest.js is mounted in app.js ROUTES', async () => {
      const mounted = new Set(ROUTES.map(([, router]) => router));
      for (const f of features.filter((f) => has(f, 'rest.js'))) {
         const { default: router } = await import(`./features/${f}/rest.js`);
         assert.ok(mounted.has(router), `features/${f}/rest.js is not in ROUTES (app.js)`);
      }
   });

   it("features import other features only through their service.js", () => {
      for (const f of features) {
         for (const file of fs.readdirSync(path.join(featuresDir, f)).filter((x) => x.endsWith('.js'))) {
            const src = fs.readFileSync(path.join(featuresDir, f, file), 'utf8');
            for (const [, spec] of src.matchAll(/from\s+['"](\.\.\/[^'"]+)['"]/g)) {
               const m = /^\.\.\/([^/]+)\/(.+)$/.exec(spec);
               if (m && m[1] !== '..' && !spec.startsWith('../../')) {
                  assert.equal(m[2], 'service.js', `features/${f}/${file} imports ${spec} — use ../${m[1]}/service.js`);
               }
            }
         }
      }
   });

   it('services stay transport-agnostic (no express / req / res)', () => {
      for (const f of features) {
         const src = fs.readFileSync(path.join(featuresDir, f, 'service.js'), 'utf8');
         assert.ok(!/from ['"]express['"]/.test(src), `features/${f}/service.js imports express`);
         assert.ok(!/\b(req|res)\.(query|params|body|send|status)\b/.test(src), `features/${f}/service.js touches req/res`);
      }
   });
});
