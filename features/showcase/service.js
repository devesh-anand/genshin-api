/**
 * Character showcases — a player's in-game Character Showcase, via Enka.Network.
 * All logic lives here. No HTTP (req/res) and no MCP types.
 *
 * Enka sends the game's raw numbers (avatar/skill/item/set IDs, FIGHT_PROP stat names);
 * everything is matched to our own records (characters by `id`, talents by `skillTalents[].id`, weapons by `id`,
 * artifact sets by `id`) and returned in our vocabulary. Nothing is stored beyond the
 * bounded cache in ./enka.js.
 */
import { ValidationError, NotFoundError } from '../../lib/errors.js';
import { findCharacterByGameId, resolveCharacter } from '../characters/service.js';
import { findWeaponByGameId } from '../weapons/service.js';
import { findArtifactBySetId } from '../artifacts/service.js';
import { createEnkaClient } from './enka.js';

export const SOURCE = 'Enka.Network';
export const TALENTS = ['normal_attack', 'elemental_skill', 'elemental_burst'];

// Level caps by ascension phase: phase 0 caps at 20, phase 6 at 90
const CAPS = [20, 40, 50, 60, 70, 80, 90];

const SLOTS = {
   EQUIP_BRACER: 'flower',
   EQUIP_NECKLACE: 'plume',
   EQUIP_SHOES: 'sands',
   EQUIP_RING: 'goblet',
   EQUIP_DRESS: 'circlet',
};
const SLOT_ORDER = Object.values(SLOTS);

/** FIGHT_PROP name → our stat key, display name, and whether the value is a percentage. */
export const STATS = {
   FIGHT_PROP_BASE_ATTACK:       { key: 'base_atk', name: 'Base ATK' },
   FIGHT_PROP_HP:                { key: 'hp', name: 'HP' },
   FIGHT_PROP_HP_PERCENT:        { key: 'hp_percent', name: 'HP', percent: true },
   FIGHT_PROP_ATTACK:            { key: 'atk', name: 'ATK' },
   FIGHT_PROP_ATTACK_PERCENT:    { key: 'atk_percent', name: 'ATK', percent: true },
   FIGHT_PROP_DEFENSE:           { key: 'def', name: 'DEF' },
   FIGHT_PROP_DEFENSE_PERCENT:   { key: 'def_percent', name: 'DEF', percent: true },
   FIGHT_PROP_ELEMENT_MASTERY:   { key: 'elemental_mastery', name: 'Elemental Mastery' },
   FIGHT_PROP_CHARGE_EFFICIENCY: { key: 'energy_recharge', name: 'Energy Recharge', percent: true },
   FIGHT_PROP_CRITICAL:          { key: 'crit_rate', name: 'CRIT Rate', percent: true },
   FIGHT_PROP_CRITICAL_HURT:     { key: 'crit_dmg', name: 'CRIT DMG', percent: true },
   FIGHT_PROP_HEAL_ADD:          { key: 'healing_bonus', name: 'Healing Bonus', percent: true },
   FIGHT_PROP_PHYSICAL_ADD_HURT: { key: 'physical_dmg_bonus', name: 'Physical DMG Bonus', percent: true },
   FIGHT_PROP_FIRE_ADD_HURT:     { key: 'pyro_dmg_bonus', name: 'Pyro DMG Bonus', percent: true },
   FIGHT_PROP_ELEC_ADD_HURT:     { key: 'electro_dmg_bonus', name: 'Electro DMG Bonus', percent: true },
   FIGHT_PROP_WATER_ADD_HURT:    { key: 'hydro_dmg_bonus', name: 'Hydro DMG Bonus', percent: true },
   FIGHT_PROP_GRASS_ADD_HURT:    { key: 'dendro_dmg_bonus', name: 'Dendro DMG Bonus', percent: true },
   FIGHT_PROP_WIND_ADD_HURT:     { key: 'anemo_dmg_bonus', name: 'Anemo DMG Bonus', percent: true },
   FIGHT_PROP_ROCK_ADD_HURT:     { key: 'geo_dmg_bonus', name: 'Geo DMG Bonus', percent: true },
   FIGHT_PROP_ICE_ADD_HURT:      { key: 'cryo_dmg_bonus', name: 'Cryo DMG Bonus', percent: true },
};

// fightPropMap IDs for a character's final stats. Percent stats arrive as fractions (0.131).
const TOTALS = [
   [2000, 'FIGHT_PROP_HP', true],
   [2001, 'FIGHT_PROP_ATTACK', true],
   [2002, 'FIGHT_PROP_DEFENSE', true],
   [28, 'FIGHT_PROP_ELEMENT_MASTERY', true],
   [20, 'FIGHT_PROP_CRITICAL', true],
   [22, 'FIGHT_PROP_CRITICAL_HURT', true],
   [23, 'FIGHT_PROP_CHARGE_EFFICIENCY', true],
   [26, 'FIGHT_PROP_HEAL_ADD'],
   [30, 'FIGHT_PROP_PHYSICAL_ADD_HURT'],
   [40, 'FIGHT_PROP_FIRE_ADD_HURT'],
   [41, 'FIGHT_PROP_ELEC_ADD_HURT'],
   [42, 'FIGHT_PROP_WATER_ADD_HURT'],
   [43, 'FIGHT_PROP_GRASS_ADD_HURT'],
   [44, 'FIGHT_PROP_WIND_ADD_HURT'],
   [45, 'FIGHT_PROP_ROCK_ADD_HURT'],
   [46, 'FIGHT_PROP_ICE_ADD_HURT'],
];

const round = (value, percent) => (percent ? Math.round(value * 10) / 10 : Math.round(value));

/** { key, name, value, percent } for a FIGHT_PROP stat; value is already a percentage when percent. */
export function toStat(prop, value) {
   const s = STATS[prop] ?? { key: prop.replace(/^FIGHT_PROP_/, '').toLowerCase(), name: prop };
   return { key: s.key, name: s.name, value: round(Number(value), s.percent), percent: Boolean(s.percent) };
}

/** Final stats: the core seven always, the rest only when non-zero. */
export function toStats(fightPropMap = {}) {
   const out = [];
   for (const [id, prop, always] of TOTALS) {
      const raw = Number(fightPropMap[id] ?? 0);
      if (!always && raw === 0) continue;
      out.push(toStat(prop, STATS[prop].percent ? raw * 100 : raw));
   }
   return out;
}

// ── UID ───────────────────────────────────────────────────────────────────────

const UID_RE = /^[1-9]\d{8,9}$/;

/** @throws {ValidationError} unless `uid` is 9–10 digits */
export function parseUid(uid) {
   const s = String(uid ?? '').trim();
   if (!UID_RE.test(s)) throw new ValidationError('A UID is 9 or 10 digits, e.g. 800000000.');
   return s;
}

// ── Levels ────────────────────────────────────────────────────────────────────

/**
 * Level state in planner terms. At a cap level (20/40/…/80) the game doesn't say whether
 * you've ascended yet; the ascension phase does: phase 6 at Lv 80 means "80, ascended".
 */
export function levelState(level, phase) {
   const p = Math.max(0, Math.min(6, Number(phase) || 0));
   return { level, ascension: p, ascended: p > 0 && level === CAPS[p - 1], max_level: CAPS[p] };
}

/**
 * Bonus talent levels (from constellations), as the game applies them. Enka keys them by
 * "proud skill" group ID, whose last digit says which talent: 2 = Elemental Skill,
 * 9 = Elemental Burst, 0/1 = Normal Attack (holds for all 128 entries in Enka's store).
 * @param {Record<string, number>} [extraLevelMap] - avatar.proudSkillExtraLevelMap
 */
export function talentBonuses(extraLevelMap = {}) {
   const out = { normal_attack: 0, elemental_skill: 0, elemental_burst: 0 };
   for (const [group, levels] of Object.entries(extraLevelMap)) {
      const d = Number(group) % 10;
      const t = d === 2 ? 'elemental_skill' : d === 9 ? 'elemental_burst' : d <= 1 ? 'normal_attack' : null;
      if (t) out[t] += Number(levels) || 0;
   }
   return out;
}

// ── Normalizing one character ─────────────────────────────────────────────────

/** Our talent keys → the skillTalents `type` of the entry carrying that talent's game skill ID */
const TALENT_TYPE = { normal_attack: 'NORMAL_ATTACK', elemental_skill: 'ELEMENTAL_SKILL', elemental_burst: 'ELEMENTAL_BURST' };

function toTalents(avatar, entry) {
   const skills = entry?.data.skillTalents ?? [];
   const byType = Object.fromEntries(TALENTS.map((t) => [t, skills.find((s) => s.type === TALENT_TYPE[t])]));
   if (TALENTS.some((t) => !Number.isInteger(byType[t]?.id))) return null;
   const bonus = talentBonuses(avatar.proudSkillExtraLevelMap);
   return Object.fromEntries(TALENTS.map((t) => [
      t,
      { name: byType[t].name ?? null, level: avatar.skillLevelMap?.[byType[t].id] ?? null, bonus: bonus[t] },
   ]));
}

async function toWeapon(equip) {
   const w = equip.weapon ?? {};
   const entry = await findWeaponByGameId(equip.itemId);
   const stats = equip.flat?.weaponStats ?? [];
   const base = stats.find((s) => s.appendPropId === 'FIGHT_PROP_BASE_ATTACK');
   const sub = stats.find((s) => s.appendPropId !== 'FIGHT_PROP_BASE_ATTACK');
   const refinement = Object.values(w.affixMap ?? {})[0];
   return {
      key: entry?.slug ?? null,
      id: equip.itemId,
      name: entry?.data.name ?? null,
      type: entry?.data.type ?? null,
      rarity: equip.flat?.rankLevel ?? entry?.data.rarity ?? null,
      ...levelState(w.level ?? 1, w.promoteLevel ?? 0),
      refinement: refinement === undefined ? 1 : refinement + 1,
      base_atk: base ? Math.round(base.statValue) : null,
      sub_stat: sub ? toStat(sub.appendPropId, sub.statValue) : null,
      img: entry?.data.img?.icon ?? null,
   };
}

/** Crit value of one artifact's substats: 2 × CRIT Rate + CRIT DMG. */
const critValue = (substats) =>
   round(substats.reduce((n, s) => n + (s.key === 'crit_rate' ? 2 * s.value : s.key === 'crit_dmg' ? s.value : 0), 0), true);

async function toArtifact(equip) {
   const flat = equip.flat ?? {};
   const slot = SLOTS[flat.equipType] ?? null;
   const set = await findArtifactBySetId(flat.setId);
   const main = flat.reliquaryMainstat;
   const substats = (flat.reliquarySubstats ?? []).map((s) => toStat(s.appendPropId, s.statValue));
   return {
      slot,
      set: { key: set?.slug ?? null, id: flat.setId ?? null, name: set?.data.name ?? null },
      name: (slot && set?.data.pieces?.[slot]?.name) ?? null,
      rarity: flat.rankLevel ?? null,
      level: Math.max(0, (equip.reliquary?.level ?? 1) - 1), // Enka counts 1–21; the game shows +0–+20
      main_stat: main ? toStat(main.mainPropId, main.statValue) : null,
      substats,
      crit_value: critValue(substats),
      img: (slot && set?.data.pieces?.[slot]?.img) ?? null,
   };
}

/** Sets with an active bonus: `pieces` equipped, `bonus` the highest bonus reached (2 or 4). */
function setBonuses(artifacts) {
   const counts = new Map();
   for (const a of artifacts) {
      if (!a.set.id) continue;
      const c = counts.get(a.set.id) ?? { key: a.set.key, name: a.set.name, pieces: 0 };
      c.pieces++;
      counts.set(a.set.id, c);
   }
   return [...counts.values()]
      .filter((c) => c.pieces >= 2)
      .map((c) => ({ ...c, bonus: c.pieces >= 4 ? 4 : 2 }))
      .sort((a, b) => b.pieces - a.pieces);
}

export async function toCharacter(avatar) {
   const entry = await findCharacterByGameId(avatar.avatarId, { skillIds: Object.keys(avatar.skillLevelMap ?? {}) });
   const d = entry?.data;
   const prop = (type) => Number(avatar.propMap?.[type]?.val ?? 0);
   const constellation = avatar.talentIdList?.length ?? 0;
   const equips = avatar.equipList ?? [];
   const weaponEquip = equips.find((e) => e.flat?.itemType === 'ITEM_WEAPON');
   const artifacts = (await Promise.all(equips.filter((e) => e.flat?.itemType === 'ITEM_RELIQUARY').map(toArtifact)))
      .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

   return {
      key: entry?.slug ?? null,
      id: avatar.avatarId,
      name: d?.name ?? null,
      element: d?.vision ?? null,
      rarity: d?.rarity ?? null,
      weapon_type: d?.weapon_type ?? null,
      ...levelState(prop(4001) || 1, prop(1002)),
      constellation,
      friendship: avatar.fetterInfo?.expLevel ?? null,
      talents: toTalents(avatar, entry),
      weapon: weaponEquip ? await toWeapon(weaponEquip) : null,
      artifacts,
      set_bonuses: setBonuses(artifacts),
      crit_value: round(artifacts.reduce((n, a) => n + a.crit_value, 0), true),
      stats: toStats(avatar.fightPropMap),
      img: d ? { icon: d.img?.icon ?? null, card: d.img?.card ?? null, portrait: d.img?.portrait ?? null } : null,
   };
}

// ── Whole showcase ────────────────────────────────────────────────────────────

async function toPlayer(uid, p = {}) {
   const pic = p.profilePicture?.avatarId ? await findCharacterByGameId(p.profilePicture.avatarId) : null;
   return {
      uid,
      nickname: p.nickname ?? null,
      adventure_rank: p.level ?? null,
      world_level: p.worldLevel ?? null,
      signature: p.signature ?? '',
      achievements: p.finishAchievementNum ?? null,
      abyss: p.towerFloorIndex ? `${p.towerFloorIndex}-${p.towerLevelIndex ?? 0}` : null,
      abyss_stars: p.towerStarIndex ?? null,
      theater: p.theaterActIndex ? { act: p.theaterActIndex, stars: p.theaterStarIndex ?? null } : null,
      profile_picture: pic ? { key: pic.slug, name: pic.data.name, img: pic.data.img?.icon ?? null } : null,
      namecard_id: p.nameCardId ?? null,
   };
}

/** Enka's element numbers (showAvatarInfoList.energyType) → our element names */
const ENERGY_TYPE = { 1: 'Pyro', 2: 'Hydro', 3: 'Dendro', 4: 'Electro', 5: 'Cryo', 7: 'Anemo', 8: 'Geo' };

/**
 * Enka's UID response → our showcase shape.
 * @param {string} uid
 * @param {object} raw - Enka JSON
 * @param {{ fetchedAt: number, cachedUntil: number }} meta
 */
export async function toShowcase(uid, raw, { fetchedAt, cachedUntil }) {
   const listed = await Promise.all((raw.playerInfo?.showAvatarInfoList ?? []).map(async (a) => {
      const e = await findCharacterByGameId(a.avatarId, { element: ENERGY_TYPE[a.energyType] });
      return { key: e?.slug ?? null, id: a.avatarId, name: e?.data.name ?? null, level: a.level ?? null };
   }));
   const characters = await Promise.all((raw.avatarInfoList ?? []).map(toCharacter));
   return {
      player: await toPlayer(uid, raw.playerInfo),
      characters,
      // Characters on the showcase but with "Show Character Details" off (or no showcase at all)
      details_hidden: characters.length === 0,
      listed,
      fetched_at: new Date(fetchedAt).toISOString(),
      cached_until: new Date(cachedUntil).toISOString(),
      source: SOURCE,
   };
}

const defaultClient = createEnkaClient();

/**
 * A player's showcase by UID. Fresh data at most once per Enka ttl per UID.
 * @param {string|number} uid
 * @param {{ client?: ReturnType<typeof createEnkaClient> }} [opts] - tests inject a client
 * @throws {ValidationError} bad UID · {NotFoundError} no such player · {UnavailableError} Enka down/busy
 */
export async function getShowcase(uid, { client = defaultClient } = {}) {
   const id = parseUid(uid);
   return client.get(id, (raw, meta) => toShowcase(id, raw, meta));
}

/** Seconds a showcase response may be cached downstream (until Enka's ttl runs out). */
export function cacheSeconds(showcase, now = Date.now()) {
   return Math.max(0, Math.floor((Date.parse(showcase.cached_until) - now) / 1000));
}

/**
 * One character from a showcase, by loose name ("hutao", "Raiden Shogun").
 * @throws {NotFoundError} with the showcase's characters as suggestions
 */
export async function findShowcaseCharacter(showcase, name) {
   const keys = showcase.characters.map((c) => c.key).filter(Boolean);
   let key = null;
   try {
      key = (await resolveCharacter(name)).slug;
   } catch {
      // not a character name at all — fall through to the showcase-specific error
   }
   const hit = showcase.characters.find((c) => c.key === key);
   if (!hit) {
      throw new NotFoundError(`"${name}" isn't on this player's showcase. Showcased: ${keys.join(', ') || 'none'}.`, {
         suggestions: keys,
      });
   }
   return hit;
}

/** Short form of a showcased character, for lists and model-facing output. */
export function toBrief(c) {
   const stat = (k) => c.stats.find((s) => s.key === k)?.value ?? null;
   const dmg = c.stats.filter((s) => s.key.endsWith('_dmg_bonus')).sort((a, b) => b.value - a.value)[0];
   return {
      key: c.key,
      name: c.name,
      level: c.level,
      constellation: c.constellation,
      talents: c.talents ? TALENTS.map((t) => c.talents[t].level + c.talents[t].bonus).join('/') : null,
      weapon: c.weapon ? `${c.weapon.name ?? 'Unknown weapon'} R${c.weapon.refinement} Lv${c.weapon.level}` : null,
      sets: c.set_bonuses.map((s) => `${s.bonus}pc ${s.name ?? 'Unknown set'}`),
      crit_value: c.crit_value,
      stats: {
         hp: stat('hp'), atk: stat('atk'), def: stat('def'), elemental_mastery: stat('elemental_mastery'),
         energy_recharge: stat('energy_recharge'), crit_rate: stat('crit_rate'), crit_dmg: stat('crit_dmg'),
         ...(dmg && { [dmg.key]: dmg.value }),
      },
   };
}

/**
 * Planner targets for a showcased character (and its weapon), from its current levels up to
 * `goal`. Ready for planMaterials({ targets }). Empty when there's nothing left to raise.
 * @param {object} c - a showcase character
 * @param {{ level?: number, talent?: number, weapon?: boolean }} [goal] - defaults 90 / 10 / true
 */
export function toPlannerTargets(c, { level = 90, talent = 10, weapon = true } = {}) {
   const targets = [];
   if (c.key) {
      const t = { type: 'character', name: c.key };
      if (c.level < level) {
         t.level = { from: c.level, to: level, ...(c.ascended && { from_ascended: true }) };
      }
      if (c.talents) {
         const talents = Object.fromEntries(TALENTS
            .filter((k) => c.talents[k].level !== null && c.talents[k].level < talent)
            .map((k) => [k, { from: c.talents[k].level, to: talent }]));
         if (Object.keys(talents).length) t.talents = talents;
      }
      if (t.level || t.talents) targets.push(t);
   }
   const w = c.weapon;
   const weaponMax = w && w.rarity <= 2 ? 70 : 90;
   if (weapon && w?.key && w.level < Math.min(level, weaponMax)) {
      targets.push({
         type: 'weapon',
         name: w.key,
         level: { from: w.level, to: Math.min(level, weaponMax), ...(w.ascended && { from_ascended: true }) },
      });
   }
   return targets;
}

/** Cache figures for /health. */
export const getShowcaseCacheStats = () => defaultClient.stats();
