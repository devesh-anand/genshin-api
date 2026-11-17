// Finds image URLs in data/ that point at R2 objects that don't exist.
//
// Walks every JSON file under data/, collects every image URL, and HEADs each
// one on the host it names (gi.deve.sh). Requests go out a few at a time and
// back off on 429/5xx. Old pub-….r2.dev URLs answer bursts with 429, so use
// --concurrency 1 --delay 150 for those.
//
// Usage:
//   node scripts/check-data-images.mjs                  # HEAD every URL in data/
//   node scripts/check-data-images.mjs --prefix albedo/ # only keys starting with albedo/
//   node scripts/check-data-images.mjs --variants       # also HEAD the w48…w1920 variants of each original
//
// Options: --concurrency <n> (default 6), --delay <ms> between requests per worker (default 0).
// Exits 1 if any URL is missing (or could not be checked).

import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { VARIANT_WIDTHS, variantKey } from './lib/variants.mjs';
import { DATA_DIR } from '../lib/paths.js';

const { values: opts } = parseArgs({
   options: {
      prefix: { type: 'string', default: '' },
      variants: { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '6' },
      delay: { type: 'string', default: '0' },
   },
});
const concurrency = Math.max(1, Number.parseInt(opts.concurrency, 10) || 6);
const delay = Math.max(0, Number.parseInt(opts.delay, 10) || 0);

const URL_RE = /https?:\/\/[^"\s]+\.(?:png|jpe?g|webp)(?:\?[^"\s]*)?/gi;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function* jsonFiles(dir) {
   for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) yield* jsonFiles(full);
      else if (entry.name.endsWith('.json')) yield full;
   }
}

// url (without query) → data files that reference it
const refs = new Map();
for await (const file of jsonFiles(DATA_DIR)) {
   const text = await readFile(file, 'utf8');
   for (const match of text.matchAll(URL_RE)) {
      const url = match[0].split('?')[0];
      const key = new URL(url).pathname.slice(1);
      if (opts.prefix && !key.startsWith(opts.prefix)) continue;
      const rel = path.relative(DATA_DIR, file).replaceAll('\\', '/');
      refs.set(url, new Set([...(refs.get(url) ?? []), rel]));
   }
}

const targets = [...refs.keys()].flatMap((url) => {
   if (!opts.variants) return [url];
   const { origin, pathname } = new URL(url);
   return [url, ...VARIANT_WIDTHS.map((w) => `${origin}/${variantKey(pathname.slice(1), w)}`)];
});

async function head(url) {
   for (let attempt = 0; ; attempt++) {
      let status;
      try {
         const r = await fetch(url, { method: 'HEAD', headers: { 'User-Agent': 'genshin-api image check' } });
         status = r.status;
      } catch {
         status = 'ERR';
      }
      const retry = status === 429 || status === 'ERR' || status >= 500;
      if (!retry || attempt >= 6) return status;
      await sleep(Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500);
   }
}

console.log(
   `Checking ${targets.length} URL(s) from ${refs.size} referenced image(s) in data/` +
      `${opts.prefix ? ` (prefix "${opts.prefix}")` : ''}, concurrency ${concurrency}…`,
);

const bad = [];
let next = 0;
let done = 0;
await Promise.all(
   Array.from({ length: Math.min(concurrency, targets.length) }, async () => {
      while (next < targets.length) {
         const url = targets[next++];
         const status = await head(url);
         if (status !== 200) bad.push({ url, status });
         if (++done % 250 === 0) console.log(`  … ${done}/${targets.length} (${bad.length} bad)`);
         if (delay) await sleep(delay);
      }
   }),
);

bad.sort((a, b) => a.url.localeCompare(b.url));
for (const { url, status } of bad) {
   const files = refs.get(url);
   console.log(`  ✗ ${status} ${url}${files ? `  ← ${[...files].join(', ')}` : ''}`);
}
console.log(`Done. checked=${targets.length}, bad=${bad.length}`);
process.exit(bad.length ? 1 : 0);
