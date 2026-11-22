/** Weapons — all logic lives here. No HTTP (req/res) and no MCP types. */
import { weaponStore, queryWeapons, weaponCurves } from './store.js';
import { FIGHT_PROPS } from '../../lib/fightProps.js';
import { sortResults } from '../../lib/sort.js';
import { resolveName, resolveOrThrow, matchesSearchTerm } from '../../lib/nameResolver.js';
import { WEAPON_ALIASES } from './aliases.js';

export { WEAPON_ALIASES };
import { pick } from '../../lib/objects.js';
import { lazyIndex } from '../../lib/lazyIndex.js';

export const SORT_FIELDS = {
   name:   'name',
   rarity: 'rarity',
   type:   'type',
};

export function toSummary({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      rarity: data.rarity,
      type: data.type,
      sub_stat: data.sub_stat,
      passive_name: data.passive_name,
      img: data.img,
   };
}

export function toSearchResult({ slug, data }) {
   return {
      key: slug,
      name: data.name,
      type: data.type,
      rarity: data.rarity,
      img: data.img?.icon ?? null,
   };
}

/** @param {{ type?, rarity?, sort?: keyof SORT_FIELDS, order?: 'asc'|'desc' }} [opts] */
export async function listWeapons({ type, rarity, sort, order } = {}) {
   return sortResults(await queryWeapons({ type, rarity }), SORT_FIELDS[sort] ?? null, order);
}

export const getWeapon = (slug) => weaponStore.getOne(slug);

const byGameId = lazyIndex(weaponStore, (w) => (w.id ? Number(w.id) : null));

/** Weapon by the game's item ID (as in Enka showcases, e.g. 15508), or null. */
export const findWeaponByGameId = (id) => byGameId(Number(id));

export async function findWeapon(name) {
   return resolveName(await weaponStore.getAll(), name, { aliases: WEAPON_ALIASES });
}

export const listWeaponTypes = () => weaponStore.getDistinct('type');

export async function searchWeapons(term) {
   return (await weaponStore.query(matchesSearchTerm(term, WEAPON_ALIASES))).map(toSearchResult);
}

export async function countWeapons() {
   return (await weaponStore.getAll()).length;
}

export const listWeaponRarities = () => weaponStore.getDistinct('rarity');

/** Brief shape for model-facing lists. */
export function toBrief({ slug, data }) {
   return { key: slug, name: data.name, type: data.type, rarity: data.rarity, sub_stat: data.sub_stat };
}

/** Sections of a weapon record that callers can ask for. */
export const WEAPON_SECTIONS = {
   overview: (d, slug) => ({
      ...pick(d, ['name', 'type', 'rarity', 'base_atk', 'sub_stat', 'passive_name', 'passive_desc', 'description']),
      ...(WEAPON_ALIASES[slug] && { aliases: WEAPON_ALIASES[slug] }),
   }),
   refinements: (d) => ({ passive_upgrades: d.passive_upgrades ?? [] }),
   ascension_costs: (d) => ({ ascension_costs: d.ascension_costs ?? [] }),
   images: (d) => ({ img: d.img ?? {} }),
   stats: (d) => ({ stats: weaponStatMilestones(d) }),
};

// ── Stats by level ───────────────────────────────────────────────────────────────

/** Levels where a weapon ascends (the level cap before each ascension phase). */
const ASCENSION_LEVELS = [20, 40, 50, 60, 70, 80];

/**
 * A weapon's base ATK and substat at every level, computed from its growth data
 * (scripts/add-weapon-stats.mjs): stat = init × curve[level] (+ the ascension phase's ATK bonus).
 * Each ascension level appears twice — before and after ascending — so a row is identified by
 * (level, ascension). Values are rounded the way the game shows them: ATK and flat stats to whole
 * numbers, percentages to one decimal.
 * @param {object} data - a weapon record
 * @returns {null | {
 *   max_level: number,
 *   sub_stat: { key: string|null, name: string|null, percent: boolean } | null,
 *   levels: Array<{ level: number, ascension: number, atk: number, sub_stat: number|null }>,
 * }} null when the weapon has no growth data
 */
export function weaponStats(data) {
   const g = data?.growth;
   const curves = g && weaponCurves();
   const atkCurve = curves?.[g.atk?.curve];
   const subCurve = g?.sub_stat ? curves?.[g.sub_stat.curve] : null;
   if (!atkCurve || (g.sub_stat && !subCurve)) return null;

   const prop = FIGHT_PROPS[data.sub_stat_key];
   const percent = Boolean(prop?.percent);
   const sub = g.sub_stat ? { key: prop?.key ?? null, name: data.sub_stat ?? prop?.name ?? null, percent } : null;
   const subAt = (level) => {
      const v = g.sub_stat.init * subCurve[level - 1];
      return percent ? Math.round(v * 1000) / 10 : Math.round(v);
   };
   const row = (level, ascension) => ({
      level,
      ascension,
      atk: Math.round(g.atk.init * atkCurve[level - 1] + (g.ascension_atk?.[ascension] ?? 0)),
      sub_stat: sub ? subAt(level) : null,
   });

   const levels = [];
   let ascension = 0;
   for (let level = 1; level <= g.max_level; level++) {
      levels.push(row(level, ascension));
      if (ASCENSION_LEVELS.includes(level) && level < g.max_level) levels.push(row(level, ++ascension));
   }
   return { max_level: g.max_level, sub_stat: sub, levels };
}

/** weaponStats() trimmed to the levels players compare: 1, each ascension (before/after), max. */
export function weaponStatMilestones(data) {
   const stats = weaponStats(data);
   if (!stats) return null;
   const keep = (r) => r.level === 1 || r.level === stats.max_level || ASCENSION_LEVELS.includes(r.level);
   return { ...stats, levels: stats.levels.filter(keep) };
}

/** Full weapon record for GET /weapons/:name, plus its stats at every level. */
export async function getWeaponDetail(slug) {
   const data = await getWeapon(slug);
   return data && { ...data, stats: weaponStats(data) };
}

/** @throws {NotFoundError} with suggestions */
export async function resolveWeapon(name) {
   return resolveOrThrow(await weaponStore.getAll(), name, 'weapon', { aliases: WEAPON_ALIASES });
}

/** @param {Array<keyof WEAPON_SECTIONS>} [sections] - defaults to ['overview'] */
export function describeWeapon({ slug, data }, sections = ['overview']) {
   return Object.assign({ key: slug }, ...sections.map((s) => WEAPON_SECTIONS[s](data, slug)));
}
