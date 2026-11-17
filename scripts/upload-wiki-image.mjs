// Uploads one Fandom wiki file to an R2 key — for restoring a single missing image
// that data/ already points at (find those with scripts/check-data-images.mjs).
//
// Refuses to overwrite an existing object unless --overwrite is passed.
// Afterwards, run `node scripts/image-variants.mjs --write --prefix <folder>/` for its variants.
//
// Usage:
//   node scripts/upload-wiki-image.mjs "Canis Bellatoris.png" gorou/constellation.png
//   node scripts/upload-wiki-image.mjs "Canis Bellatoris.png" gorou/constellation.png --write

import S3 from 'aws-sdk/clients/s3.js';
import * as dotenv from 'dotenv';
import { parseArgs } from 'util';

dotenv.config();

const BUCKET = 'genshin-images';
const PUBLIC_URL = 'https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev';
const WIKI_API = 'https://genshin-impact.fandom.com/api.php';
const USER_AGENT = 'genshin-api-updater/1.0 (github.com/devesh-anand/genshin-api)';

const {
   values: opts,
   positionals: [fileName, key],
} = parseArgs({
   allowPositionals: true,
   options: {
      write: { type: 'boolean', default: false },
      overwrite: { type: 'boolean', default: false },
   },
});
if (!fileName || !key) {
   console.error('Usage: node scripts/upload-wiki-image.mjs "<Wiki File.png>" <r2/key.png> [--write] [--overwrite]');
   process.exit(1);
}
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

const info = await fetch(
   `${WIKI_API}?action=query&titles=${encodeURIComponent(`File:${fileName}`)}&prop=imageinfo&iiprop=url%7Csize&format=json`,
   { headers: { 'User-Agent': USER_AGENT } },
).then((r) => r.json());
const image = Object.values(info.query?.pages ?? {})[0]?.imageinfo?.[0];
if (!image?.url) {
   console.error(`Wiki has no file "${fileName}".`);
   process.exit(1);
}
console.log(`wiki: ${fileName} ${image.width}×${image.height} ${image.url}`);

const existing = await s3
   .headObject({ Bucket: BUCKET, Key: key })
   .promise()
   .catch((e) => (e.code === 'NotFound' ? null : Promise.reject(e)));
if (existing && !opts.overwrite) {
   console.error(`${key} already exists (${existing.ContentLength} bytes) — not overwriting. Pass --overwrite to replace it.`);
   process.exit(1);
}

if (!opts.write) {
   console.log(`Dry run — would upload to ${key}. Re-run with --write.`);
   process.exit(0);
}

const res = await fetch(image.url, { headers: { 'User-Agent': USER_AGENT } });
if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
const body = Buffer.from(await res.arrayBuffer());
// Same as populate-characters.mjs: the wiki CDN may send WebP for .png names; image/png is intentional.
await s3.putObject({ Bucket: BUCKET, Key: key, ContentType: 'image/png', Body: body }).promise();
console.log(`uploaded ${key} (${(body.length / 1024).toFixed(0)}KB) → ${PUBLIC_URL}/${key}`);
