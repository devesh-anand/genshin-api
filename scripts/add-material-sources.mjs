/**
 * Adds a source field to all material JSON files.
 *
 * For talent-book and weapon-material: { type: "domain", name, days }
 * For boss-drop, weekly-boss-drop, ascension-gem, common-drop: { type: "boss"|"enemy", description }
 * Local specialties: skipped (no meaningful source from yatta)
 *
 * Data sourced from gi.yatta.moe. No image uploads.
 *
 * Usage:
 *   node scripts/add-material-sources.mjs                    # all materials missing source
 *   node scripts/add-material-sources.mjs slime-condensate   # one material (by file slug)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATS_DIR = path.join(__dirname, '../data/materials');
const YATTA    = 'https://gi.yatta.moe';

// Categories where yatta source data is useful
const INCLUDE_CATEGORIES = new Set([
  'talent-book',
  'weapon-material',
  'boss-drop',
  'weekly-boss-drop',
  'ascension-gem',
  'common-drop',
]);

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'genshin-api/1.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Extract the most useful source entry from yatta's source array.
// Prefers domain entries (have days); falls back to first non-placeholder single.
function parseSource(sources) {
  if (!sources || sources.length === 0) return null;

  const domain = sources.find(s => s.type === 'domain');
  if (domain) {
    return {
      type: 'domain',
      name: domain.name,
      days: domain.days,
    };
  }

  const single = sources.find(
    s => s.type === 'single' && !s.name.startsWith('Placeholder')
  );
  if (single) {
    return {
      type: 'boss',
      description: single.name,
    };
  }

  return null;
}

async function main() {
  const files = (await fs.readdir(MATS_DIR)).sort();
  const targetSlug = process.argv[2] ?? null;

  let processed = 0, skipped = 0, noSource = 0, failed = 0;

  for (const file of files) {
    const slug = file.replace('.json', '');
    if (targetSlug && slug !== targetSlug) continue;

    const matData = JSON.parse(await fs.readFile(path.join(MATS_DIR, file), 'utf8'));

    if (!targetSlug && matData.source !== undefined) {
      skipped++;
      continue;
    }

    if (!INCLUDE_CATEGORIES.has(matData.category)) {
      // local-specialty — skip, no useful source from yatta
      skipped++;
      continue;
    }

    process.stdout.write(`\n→ ${slug.padEnd(52)}`);

    try {
      const res = await fetchJSON(`${YATTA}/api/v2/en/material/${matData.id}`);
      const source = parseSource(res.data.source);

      if (!source) {
        process.stdout.write(' (no source)');
        noSource++;
        // Still write null so we don't re-fetch on next run
        await fs.writeFile(path.join(MATS_DIR, file), JSON.stringify({ ...matData, source: null }, null, 2));
        continue;
      }

      await fs.writeFile(path.join(MATS_DIR, file), JSON.stringify({ ...matData, source }, null, 2));
      process.stdout.write(source.type === 'domain'
        ? ` domain(${source.days?.join('/')})`
        : ' boss');
      processed++;
    } catch (e) {
      process.stdout.write(` ERROR: ${e.message}`);
      failed++;
    }

    await sleep(300);
  }

  console.log(`\n\nDone. processed=${processed}, no-source=${noSource}, skipped=${skipped}, failed=${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
