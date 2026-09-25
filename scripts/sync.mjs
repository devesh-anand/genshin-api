/**
 * Master sync script — run after each Genshin patch to keep all data current.
 *
 * Discovers and adds new characters, weapons, materials, and enemies by
 * comparing local data against yatta.moe, then probing for characters not
 * yet in the yatta list endpoint.
 *
 * Usage:
 *   node scripts/sync.mjs              # full sync (all entity types)
 *   node scripts/sync.mjs characters   # one entity type only
 *   node scripts/sync.mjs weapons
 *   node scripts/sync.mjs materials
 *   node scripts/sync.mjs enemies
 *
 * After sync, data/meta.json is updated with the current counts and timestamp.
 */

import { execFile as _execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import {
  discoverNewCharacters,
  discoverNew,
  slugify,
  charSlug,
  sleep,
} from './lib/discover.mjs';

const execFile = promisify(_execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

// ── Helpers ───────────────────────────────────────────────────────────────────

function localSlugs(subdir) {
  return fs.readdir(path.join(DATA, subdir))
    .then(files => new Set(files.map(f => f.replace('.json', ''))));
}

async function run(script, ...args) {
  const scriptPath = path.join(__dirname, script);
  try {
    const { stdout, stderr } = await execFile('node', [scriptPath, ...args]);
    if (stdout.trim()) process.stdout.write(stdout);
    if (stderr.trim()) process.stderr.write(stderr);
    return true;
  } catch (e) {
    console.error(`  ERROR running ${script} ${args.join(' ')}: ${e.message}`);
    return false;
  }
}

function header(title) {
  const line = '─'.repeat(60);
  console.log(`\n${line}\n  ${title}\n${line}`);
}

function summary(label, added, failed) {
  const status = added === 0 ? '✓ already up to date' : `+${added} added`;
  const failNote = failed > 0 ? `  (${failed} failed)` : '';
  console.log(`  ${label.padEnd(14)} ${status}${failNote}`);
}

// ── Entity syncs ──────────────────────────────────────────────────────────────

async function syncCharacters() {
  header('Characters');

  const existing = await localSlugs('characters');
  console.log(`  Local: ${existing.size}`);

  console.log('  Discovering new characters (list + ID probe)…');
  const { fromList, fromProbe } = await discoverNewCharacters(existing);

  const allNew = [
    ...fromList,
    ...fromProbe.filter(p => !fromList.some(l => l.slug === p.slug)),
  ];

  if (allNew.length === 0) {
    console.log('  No new characters found.');
    return { added: 0, failed: 0 };
  }

  console.log(`  Found ${allNew.length} new character(s): ${allNew.map(c => c.name).join(', ')}`);

  let added = 0, failed = 0;
  for (const char of allNew) {
    process.stdout.write(`  → ${char.name.padEnd(26)}`);

    // populate-characters.mjs accepts a numeric ID for unlisted characters
    const arg = fromProbe.some(p => p.slug === char.slug)
      ? String(char.id)  // unlisted → use ID
      : char.slug;        // listed → use slug (preserves SLUG_OVERRIDES)

    const ok1 = await run('populate-characters.mjs', arg);
    if (!ok1) { process.stdout.write(' POPULATE_FAILED\n'); failed++; continue; }

    const ok2 = await run('add-character-costs.mjs', char.slug);
    if (!ok2) { process.stdout.write(' COSTS_FAILED\n'); failed++; continue; }

    process.stdout.write(' ✓\n');
    added++;
    await sleep(500);
  }

  return { added, failed };
}

async function syncWeapons() {
  header('Weapons');

  const existing = await localSlugs('weapons');
  console.log(`  Local: ${existing.size}`);

  const newWeapons = await discoverNew('weapon', existing);
  if (newWeapons.length === 0) {
    console.log('  No new weapons found.');
    return { added: 0, failed: 0 };
  }

  console.log(`  Found ${newWeapons.length} new weapon(s): ${newWeapons.map(w => w.name).join(', ')}`);

  let added = 0, failed = 0;
  for (const w of newWeapons) {
    process.stdout.write(`  → ${w.name.padEnd(36)}`);
    const ok1 = await run('populate-weapons.mjs', w.slug);
    if (!ok1) { process.stdout.write(' POPULATE_FAILED\n'); failed++; continue; }

    const ok2 = await run('add-weapon-costs.mjs', w.slug);
    if (!ok2) { process.stdout.write(' COSTS_FAILED\n'); failed++; continue; }

    process.stdout.write(' ✓\n');
    added++;
    await sleep(300);
  }

  return { added, failed };
}

async function syncMaterials() {
  header('Materials');

  const existing = await localSlugs('materials');
  const before = existing.size;
  console.log(`  Local: ${before}`);

  const newMats = await discoverNew('material', existing);
  if (newMats.length === 0) {
    console.log('  No new materials found.');
    return { added: 0, failed: 0 };
  }

  console.log(`  Found ${newMats.length} candidate(s) not in local (many may be excluded by category filter)`);

  // Run populate once for all — it handles its own filtering and skipping
  await run('populate-materials.mjs');

  const after = (await localSlugs('materials')).size;
  const added = after - before;
  console.log(`  Actually written: ${added}`);

  return { added, failed: 0 };
}

async function syncEnemies() {
  header('Enemies');

  const existing = await localSlugs('enemies');
  const before = existing.size;
  console.log(`  Local: ${before}`);

  const newEnemies = await discoverNew('monster', existing);
  if (newEnemies.length === 0) {
    console.log('  No new enemies found.');
    return { added: 0, failed: 0 };
  }

  console.log(`  Found ${newEnemies.length} candidate(s) not in local (some may be excluded by type filter)`);

  // Run populate once for all — it handles its own type filtering and skipping
  await run('populate-enemies.mjs');

  const after = (await localSlugs('enemies')).size;
  const added = after - before;
  console.log(`  Actually written: ${added}`);

  return { added, failed: 0 };
}

// ── Meta tracking ─────────────────────────────────────────────────────────────

async function updateMeta(results) {
  const metaPath = path.join(DATA, 'meta.json');

  const counts = {
    characters: (await fs.readdir(path.join(DATA, 'characters'))).filter(f => f.endsWith('.json')).length,
    weapons:    (await fs.readdir(path.join(DATA, 'weapons'))).filter(f => f.endsWith('.json')).length,
    materials:  (await fs.readdir(path.join(DATA, 'materials'))).filter(f => f.endsWith('.json')).length,
    enemies:    (await fs.readdir(path.join(DATA, 'enemies'))).filter(f => f.endsWith('.json')).length,
  };

  const meta = {
    last_synced: new Date().toISOString(),
    counts,
    last_run_results: results,
  };

  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
  return counts;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const TARGET = process.argv[2] ?? 'all';
const VALID_TARGETS = new Set(['all', 'characters', 'weapons', 'materials', 'enemies']);
if (!VALID_TARGETS.has(TARGET)) {
  console.error(`Usage: node scripts/sync.mjs [all|characters|weapons|materials|enemies]`);
  process.exit(1);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Genshin API Sync  —  ${new Date().toUTCString()}`);
console.log(`${'═'.repeat(60)}`);

const results = {};

try {
  if (TARGET === 'all' || TARGET === 'characters') results.characters = await syncCharacters();
  if (TARGET === 'all' || TARGET === 'weapons')    results.weapons    = await syncWeapons();
  if (TARGET === 'all' || TARGET === 'materials')  results.materials  = await syncMaterials();
  if (TARGET === 'all' || TARGET === 'enemies')    results.enemies    = await syncEnemies();
} catch (e) {
  console.error('\nFatal error during sync:', e);
  process.exit(1);
}

const counts = await updateMeta(results);

console.log(`\n${'═'.repeat(60)}`);
console.log('  Summary');
console.log('─'.repeat(60));
for (const [entity, res] of Object.entries(results)) {
  summary(entity, res.added, res.failed);
}
console.log('─'.repeat(60));
console.log('  Totals after sync:');
for (const [k, v] of Object.entries(counts)) {
  console.log(`    ${k.padEnd(14)} ${v}`);
}
console.log(`${'═'.repeat(60)}\n`);

const anyFailed = Object.values(results).some(r => r.failed > 0);
if (anyFailed) process.exit(1);
