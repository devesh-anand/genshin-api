/**
 * Generates resized WebP variants of every original image in the R2 bucket
 * (see scripts/lib/variants.mjs for the naming scheme and widths).
 *
 * Separate from sync.mjs on purpose: it only reads and writes R2, never data/.
 * It never writes to an original — only `*.w{width}.webp` keys.
 * Safe to re-run — originals whose variants are already up to date are skipped.
 *
 * Dry run by default (lists what it would do, writes nothing). Pass --write to upload.
 *
 * Usage:
 *   node scripts/image-variants.mjs                          # dry run, whole bucket
 *   node scripts/image-variants.mjs --prefix nahida/         # dry run, one folder
 *   node scripts/image-variants.mjs --write --prefix nahida/ # generate + upload for one folder
 *   node scripts/image-variants.mjs --write                  # generate + upload everything missing
 *
 * Options:
 *   --write             actually upload (default: dry run)
 *   --prefix <p>        only originals whose key starts with <p>
 *   --force             regenerate even if variants are up to date
 *   --concurrency <n>   originals processed in parallel (default 8)
 */

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import { parseArgs } from 'util';
import {
   CACHE_CONTROL,
   VARIANT_WIDTHS,
   findCollisions,
   isOriginalKey,
   isVariantKey,
   planVariants,
   renderVariants,
   variantKey,
} from './lib/variants.mjs';

dotenv.config();

const BUCKET = 'genshin-images';

const { values: opts } = parseArgs({
   options: {
      write: { type: 'boolean', default: false },
      prefix: { type: 'string', default: '' },
      force: { type: 'boolean', default: false },
      concurrency: { type: 'string', default: '8' },
   },
});
const concurrency = Math.max(1, Number.parseInt(opts.concurrency, 10) || 8);

for (const name of ['R2_ID', 'AWS_ID', 'AWS_KEY']) {
   if (!process.env[name]) {
      console.error(`Missing ${name} — set R2 credentials in .env (see docs/data-pipeline.md).`);
      process.exit(1);
   }
}

const s3 = new S3({
   endpoint: `https://${process.env.R2_ID}.r2.cloudflarestorage.com/`,
   accessKeyId: process.env.AWS_ID,
   secretAccessKey: process.env.AWS_KEY,
   signatureVersion: 'v4',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function listAll(prefix) {
   const objects = [];
   let ContinuationToken;
   do {
      const page = await s3
         .listObjectsV2({ Bucket: BUCKET, Prefix: prefix || undefined, ContinuationToken })
         .promise();
      for (const o of page.Contents ?? []) objects.push({ Key: o.Key, LastModified: o.LastModified, Size: o.Size });
      ContinuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
   } while (ContinuationToken);
   return objects;
}

async function pool(items, size, worker) {
   let next = 0;
   const run = async () => {
      while (next < items.length) {
         const i = next++;
         await worker(items[i], i);
      }
   };
   await Promise.all(Array.from({ length: Math.min(size, items.length) }, run));
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)}KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(
   `${opts.write ? 'WRITE' : 'DRY RUN'} — bucket ${BUCKET}${opts.prefix ? `, prefix "${opts.prefix}"` : ''}, ` +
      `widths ${VARIANT_WIDTHS.join('/')}, concurrency ${concurrency}${opts.force ? ', force' : ''}`,
);

const objects = await listAll(opts.prefix);
let failures = 0;

const originals = objects.filter((o) => isOriginalKey(o.Key));
const sizes = new Map(objects.map((o) => [o.Key, o.Size]));
const collisions = findCollisions(objects);
const skipped = collisions.flat().length;
const plan = planVariants(objects, { force: opts.force });
const files = plan.reduce((n, p) => n + p.widths.length, 0);
const planBytes = plan.reduce((n, p) => n + (sizes.get(p.key) ?? 0), 0);

console.log(
   `Originals: ${originals.length} | up to date: ${originals.length - plan.length - skipped} | ` +
      `to generate: ${plan.length} (${files} variant files, ${mb(planBytes)} of originals to download)` +
      (skipped ? ` | skipped (name collision): ${skipped}` : ''),
);
if (collisions.length) {
   console.warn(`Skipped ${collisions.length} group(s) of originals that would share variant keys — rename one in each:`);
   for (const group of collisions) console.warn(`  ${group.join('  ↔  ')}`);
}

if (!opts.write) {
   for (const p of plan.slice(0, 20)) console.log(`  ${p.key} → ${p.widths.map((w) => `w${w}`).join(' ')}`);
   if (plan.length > 20) console.log(`  … and ${plan.length - 20} more`);
   console.log('Dry run — nothing written. Re-run with --write to upload.');
   process.exit(0);
}

let done = 0;
let inBytes = 0;
let outBytes = 0;
await pool(plan, concurrency, async ({ key, widths }) => {
   try {
      const obj = await s3.getObject({ Bucket: BUCKET, Key: key }).promise();
      const variants = await renderVariants(obj.Body, widths);
      for (const v of variants) {
         const target = variantKey(key, v.width);
         // Hard guard: this script must never overwrite an original.
         if (!isVariantKey(target) || target === key) throw new Error(`refusing to write non-variant key ${target}`);
         await s3
            .putObject({
               Bucket: BUCKET,
               Key: target,
               Body: v.buffer,
               ContentType: 'image/webp',
               CacheControl: CACHE_CONTROL,
            })
            .promise();
      }
      done++;
      inBytes += obj.Body.length;
      outBytes += variants.reduce((n, v) => n + v.buffer.length, 0);
      const small = variants.find((v) => v.width === 96) ?? variants[0];
      console.log(`  [${done}/${plan.length}] ${key} ${kb(obj.Body.length)} → w${small.width} ${kb(small.buffer.length)}`);
   } catch (e) {
      failures++;
      console.error(`  ✗ ${key}: ${e.message}`);
   }
});

console.log(
   `Done. generated=${done}, failed=${failures}, originals read ${mb(inBytes)}, variants written ${mb(outBytes)}.`,
);
process.exit(failures ? 1 : 0);
