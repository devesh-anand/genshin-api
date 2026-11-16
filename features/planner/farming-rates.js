/**
 * Average drops per claim and resin costs, for estimating how much resin a plan needs.
 *
 * Hand-curated (not synced), so it lives in code rather than data/. Every number comes
 * from the Genshin Impact Fandom wiki (CC BY-SA 3.0 — attribution in FARMING_SOURCES and
 * README), read via its MediaWiki API on 2026-11-16. Averages are community-sampled, not
 * official; they are expectations, so real farming varies around them.
 *
 * Arrays of drops are per tier, lowest first (tier 1 = 2★ book / 2★ weapon material /
 * gem sliver), matching data/materials `family` + `tier`.
 */

export const FARMING_SOURCES = [
   { what: 'Domain and boss gem drops', url: 'https://genshin-impact.fandom.com/wiki/Loot_System/Material_Drop_Distribution' },
   { what: 'Normal boss rewards', url: 'https://genshin-impact.fandom.com/wiki/Hydro_Hypostasis' },
   { what: 'Weekly boss rewards', url: 'https://genshin-impact.fandom.com/wiki/Stormterror_Dvalin' },
   { what: 'Ley Line rewards', url: 'https://genshin-impact.fandom.com/wiki/Ley_Line_Outcrop' },
   { what: 'Resin costs and regeneration', url: 'https://genshin-impact.fandom.com/wiki/Original_Resin' },
   { what: 'Weekly boss rules', url: 'https://genshin-impact.fandom.com/wiki/Weekly_Boss' },
   { what: 'Dream Solvent', url: 'https://genshin-impact.fandom.com/wiki/Dream_Solvent' },
];
export const FARMING_DATA_LICENSE = 'Drop averages from the Genshin Impact Fandom wiki, CC BY-SA 3.0.';

export const RESIN = {
   per_day: 180,          // 1 per 8 minutes
   cap: 200,
   domain: 20,
   ley_line: 20,
   normal_boss: 40,
   weekly_boss_discounted: 30, // first 3 weekly-boss claims each week
   weekly_boss: 60,
   weekly_discounted_claims: 3,
};

/** Talent book domains, by domain level I–IV: average drops per 20-resin claim, tiers 2★/3★/4★. */
export const TALENT_DOMAIN = {
   1: [3.2, 0, 0],
   2: [2.5, 1, 0],
   3: [1.8, 2, 0],
   4: [2.2, 1.98, 0.22],
};

/** Weapon ascension domains, by domain level I–IV: tiers 2★/3★/4★/5★. */
export const WEAPON_DOMAIN = {
   1: [4.7, 0, 0, 0],
   2: [2.7, 2, 0, 0],
   3: [2.26, 2.76, 0.24, 0],
   4: [2.2, 2.418, 0.62, 0.062],
};

/** Normal (world) bosses, by World Level 0–8, per 40-resin claim. */
export const NORMAL_BOSS = {
   // Boss-specific material ("2 + 55.56%" → 2.5556)
   material: { 0: 1.6185, 1: 1.6185, 2: 1.7037, 3: 1.8741, 4: 2.0445, 5: 2.2149, 6: 2.3852, 7: 2.5556, 8: 2.5556 },
   // Ascension gems of the boss's element: sliver / fragment / chunk / gemstone
   gems: {
      0: [2.1057, 0, 0, 0],
      1: [2.1057, 0, 0, 0],
      2: [1.0323, 1.2954, 0, 0],
      3: [1.2579, 1.3554, 0, 0],
      4: [1.4835, 1.4157, 0.099, 0],
      5: [1.7091, 1.4757, 0.114, 0],
      6: [1.9354, 1.5358, 0.1287, 0.0129],
      7: [2.1607, 1.5961, 0.144, 0.0141],
      8: [2.1607, 1.5961, 0.144, 0.0141],
   },
};

/** Weekly bosses, by boss domain level I–VI, per claim. */
export const WEEKLY_BOSS = {
   // Talent materials per claim; the type is one of the boss's three, at random.
   materials: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1.55, 6: 2.1 },
   dream_solvent: 0.33, // converts one of the boss's materials into another of its three
   materials_per_boss: 3,
};

/** Ley Line Outcrops by World Level 0–9, per 20-resin claim. */
export const LEY_LINE = {
   character_exp: { 0: 25000, 1: 38500, 2: 52500, 3: 67500, 4: 82500, 5: 102500, 6: 122500, 7: 122500, 8: 122500, 9: 122500 },
   mora: { 0: 12000, 1: 20000, 2: 28000, 3: 36000, 4: 44000, 5: 52000, 6: 60000, 7: 60000, 8: 60000, 9: 60000 },
};

export const MAX_WORLD_LEVEL = 9;
/** Highest World Level with published boss tables; higher levels use these values. */
export const MAX_BOSS_TABLE_WORLD_LEVEL = 8;
