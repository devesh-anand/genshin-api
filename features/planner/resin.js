/**
 * Pure maths for resin estimates (no data access). Internal to the planner feature —
 * the public API is estimateResin() in ./service.js.
 *
 * All run counts use expected (average) drops, so they're what an average player needs;
 * real farming varies around them.
 */
import { RESIN } from './farming-rates.js';

const EPS = 1e-9;

/** Smallest real n with predicate(n) true, for a predicate that's monotone in n. */
function minimalRuns(feasible) {
   if (feasible(0)) return 0;
   let hi = 1;
   while (!feasible(hi)) {
      hi *= 2;
      if (hi > 1e7) return Infinity;
   }
   let lo = 0;
   for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (feasible(mid)) hi = mid;
      else lo = mid;
   }
   return Math.ceil(hi - EPS);
}

/**
 * Claims needed for a crafting chain (talent books, weapon materials, gems): lower tiers
 * can be crafted up `ratio` → 1, never down, so a run count is enough when every tier,
 * plus what's crafted up from below, covers its need.
 *
 * @param {number[]} need - still needed per tier, lowest first
 * @param {number[]} perRun - average drops per claim per tier, lowest first
 * @param {number} [ratio] - crafting ratio (3 in Genshin)
 * @returns {number} whole claims (Infinity if a needed tier can't be obtained)
 */
export function runsForChain(need, perRun, ratio = 3) {
   if (need.every((n) => n <= 0)) return 0;
   return minimalRuns((n) => {
      let carry = 0;
      for (let t = 0; t < need.length; t++) {
         const avail = (perRun[t] ?? 0) * n + carry;
         if (avail + EPS < need[t]) return false;
         carry = (avail - need[t]) / ratio;
      }
      return true;
   });
}

/** Claims of a single-material source (e.g. a normal boss's own material). */
export function runsForSingle(need, perRun) {
   if (need <= 0) return 0;
   return perRun > 0 ? Math.ceil(need / perRun - EPS) : Infinity;
}

/**
 * Claims of one weekly boss: each claim drops `perClaim` materials of a random one of its
 * `types` materials, plus a `solvent` chance of a Dream Solvent that converts one of its
 * materials into another.
 *
 * @param {number[]} need - still needed for each of the boss's materials
 */
export function runsForWeeklyBoss(need, perClaim, solvent, types = need.length) {
   if (need.every((n) => n <= 0)) return 0;
   if (perClaim <= 0) return Infinity;
   const each = perClaim / types;
   return minimalRuns((n) => {
      const per = each * n;
      const all = [...need, ...Array(Math.max(0, types - need.length)).fill(0)];
      const deficit = all.reduce((s, x) => s + Math.max(0, x - per), 0);
      const spare = all.reduce((s, x) => s + Math.max(0, per - x), 0);
      return deficit <= Math.min(solvent * n, spare) + EPS;
   });
}

/**
 * Resin for weekly bosses: each boss once per week; the first 3 claims each week are discounted.
 * @param {number[]} runsPerBoss
 * @returns {{ weeks: number, resin: number }}
 */
export function weeklyBossResin(runsPerBoss) {
   const weeks = Math.max(0, ...runsPerBoss);
   let resin = 0;
   for (let w = 1; w <= weeks; w++) {
      const claims = runsPerBoss.filter((r) => r >= w).length;
      const discounted = Math.min(RESIN.weekly_discounted_claims, claims);
      resin += discounted * RESIN.weekly_boss_discounted + (claims - discounted) * RESIN.weekly_boss;
   }
   return { weeks, resin };
}

/**
 * Days to spend `total` resin at `perDay`, given that each domain only opens on some days
 * (resin for it can only be spent then) and each weekly boss only once a week.
 * A lower-bound estimate: the larger of the resin, domain-day and weekly-boss limits.
 *
 * @param {{ total: number, perDay: number, domains: Array<{ resin: number, openDays: number }>, weeklyWeeks: number }} p
 */
export function estimateDays({ total, perDay, domains = [], weeklyWeeks = 0 }) {
   const fromResin = total / perDay;
   const fromDomains = Math.max(0, ...domains.map((d) => (d.resin / perDay) * (7 / Math.max(1, d.openDays))));
   const fromWeekly = weeklyWeeks > 0 ? (weeklyWeeks - 1) * 7 + 1 : 0;
   const up = (x) => Math.max(0, Math.ceil(x - EPS)); // whole days, never -0
   const days = up(Math.max(fromResin, fromDomains, fromWeekly));
   const limitedBy =
      days === 0 ? null
      : fromWeekly >= fromResin && fromWeekly >= fromDomains ? 'weekly_bosses'
      : fromDomains > fromResin ? 'domain_days'
      : 'resin';
   return {
      days,
      limited_by: limitedBy,
      from_resin: up(fromResin),
      ...(fromDomains > fromResin && { from_domain_days: up(fromDomains) }),
      ...(weeklyWeeks > 0 && { weekly_boss_weeks: weeklyWeeks }),
   };
}
