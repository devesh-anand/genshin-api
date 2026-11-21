/**
 * Adds game IDs to character JSON files, so player data that only carries numeric IDs
 * (Enka.Network showcases) can be matched to our records. No image uploads.
 *
 *   id             — the game's avatar ID (10000022 = Venti). Travelers share one per gender:
 *                    10000005 (aether-*) and 10000007 (lumine-*).
 *   skillTalents[].id — on the NORMAL_ATTACK / ELEMENTAL_SKILL / ELEMENTAL_BURST entries: the skill
 *                    IDs that key a showcase's talent levels. From yatta's talent list, in game
 *                    order: the first combat talent is the Normal Attack, the second is the
 *                    Elemental Skill (alternate sprints like Ayaka's come later), the burst is the
 *                    type-1 talent. Other entries (sprints, alternate attacks) get no id.
 *
 * Travelers share one id per gender; their talent ids (each element has its own Elemental Skill)
 * tell the elements apart.
 *
 * Source: gi.yatta.moe (avatar list + one detail request per character).
 *
 * Usage:
 *   node scripts/add-game-ids.mjs          # characters missing any of the fields
 *   node scripts/add-game-ids.mjs --all    # refresh every character
 *   node scripts/add-game-ids.mjs venti
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON, sleep, YATTA, TRAVELER_IDS } from './lib/discover.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data/characters');

// Same slug rule as populate-characters.mjs (yatta `route` → file name)
const SLUG_OVERRIDES = {
  'kamisato-ayaka': 'ayaka',
  'kamisato-ayato': 'ayato',
  'kujou-sara': 'sara',
  'yae-miko': 'yae',
  'kuki-shinobu': 'kuki',
  'arataki-itto': 'itto',
  'sangonomiya-kokomi': 'kokomi',
  'raiden-shogun': 'raiden',
  'kaedehara-kazuha': 'kazuha',
  'shikanoin-heizou': 'heizou',
};
const routeSlug = route => {
  const base = route.toLowerCase().replace(/\s+/g, '-');
  return SLUG_OVERRIDES[base] || base;
};

const TRAVELER_GENDER = { 10000005: 'aether', 10000007: 'lumine' };

/** yatta talents → { NORMAL_ATTACK, ELEMENTAL_SKILL, ELEMENTAL_BURST } skill IDs, or null */
function skillIds(talent) {
  const list = Object.entries(talent || {}).sort(([a], [b]) => Number(a) - Number(b)).map(([, t]) => t);
  const combat = list.filter(t => t.type === 0);
  const burst = list.find(t => t.type === 1);
  if (combat.length < 2 || !burst) return null;
  return { NORMAL_ATTACK: combat[0].skillId, ELEMENTAL_SKILL: combat[1].skillId, ELEMENTAL_BURST: burst.skillId };
}

const LEVELED = ['NORMAL_ATTACK', 'ELEMENTAL_SKILL', 'ELEMENTAL_BURST'];

/** skillTalents with the game skill ID on each levelable talent, or null if they don't line up */
function withSkillIds(skillTalents, ids) {
  if (!Array.isArray(skillTalents)) return null;
  if (LEVELED.some(type => skillTalents.filter(t => t.type === type).length !== 1)) return null;
  return skillTalents.map(t => (LEVELED.includes(t.type) ? { ...t, id: ids[t.type] } : t));
}

/** Every yatta avatar entry → our slug (non-travelers by route, travelers by gender + element) */
function slugFor(item) {
  const [base, element] = String(item.id).split('-');
  if (TRAVELER_IDS.has(Number(base))) return element ? `${TRAVELER_GENDER[base]}-${element}` : null;
  return routeSlug(item.route);
}

const needsWork = c => !Number.isInteger(c.id) ||
  LEVELED.some(type => !Number.isInteger((c.skillTalents || []).find(t => t.type === type)?.id));

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const target = args.find(a => !a.startsWith('--')) ?? null;

  const files = (await fs.readdir(DATA_DIR)).filter(f => f.endsWith('.json')).sort();
  const chars = new Map();
  for (const f of files) chars.set(f.slice(0, -5), JSON.parse(await fs.readFile(path.join(DATA_DIR, f), 'utf8')));

  const list = await fetchJSON(`${YATTA}/avatar`);
  if (!list) throw new Error('Failed to fetch yatta avatar list');
  const yattaBySlug = new Map();
  for (const item of Object.values(list.data.items)) {
    const slug = slugFor(item);
    if (slug && chars.has(slug)) yattaBySlug.set(slug, item);
  }

  let done = 0, failed = 0, written = 0;
  const problems = [];
  for (const [slug, c] of chars) {
    if (target ? slug !== target : !(all || needsWork(c))) continue;
    const item = yattaBySlug.get(slug);
    if (!item) { problems.push(`${slug}: not in yatta's avatar list`); continue; }
    process.stdout.write(`\n→ ${slug.padEnd(24)}`);

    const res = await fetchJSON(`${YATTA}/avatar/${item.id}`);
    if (!res?.data) { process.stdout.write(' FETCH_ERROR'); failed++; continue; }
    const ids = skillIds(res.data.talent);
    if (!ids) { problems.push(`${slug}: couldn't tell the three talents apart`); continue; }

    const skillTalents = withSkillIds(c.skillTalents, ids);
    if (!skillTalents) { problems.push(`${slug}: skillTalents doesn't have one entry per talent type`); continue; }
    const { skill_depot_id, ...rest } = c; // no longer written: talent ids tell travelers apart
    const next = { ...rest, skillTalents, id: Number(String(item.id).split('-')[0]) };
    process.stdout.write(` id:${next.id} skills:${Object.values(ids).join('/')}`);

    const p = path.join(DATA_DIR, `${slug}.json`);
    const out = JSON.stringify(next, null, 2);
    if (out !== await fs.readFile(p, 'utf8')) { await fs.writeFile(p, out); written++; }
    done++;
    await sleep(250);
  }

  console.log(`\n\nDone. updated=${done}, failed=${failed}, files written=${written}`);
  if (problems.length) console.error(`\n${problems.length} problem(s):\n  ` + problems.join('\n  '));
  if (failed || problems.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
