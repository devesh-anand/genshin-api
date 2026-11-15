/**
 * Applying an inventory to a plan: use what's owned, craft up within a family
 * (3 lower → 1 higher, with Mora), and report what's still missing.
 * Internal to the planner feature — the public API is ./service.js.
 */

/**
 * One crafting family. Owned items are used first at their own tier; any surplus is crafted
 * upward to cover shortfalls above, and only crafts that are actually needed cost Mora.
 *
 * @param {Array<{ key, tier, need, owned, craft?: { quantity, mora } }>} tiers - ascending by tier
 * @returns {Array<{ key, used_owned, crafted, missing, crafts: number, craft_mora: number }>}
 */
export function resolveFamily(tiers) {
   // Upward pass: how much of each tier could exist (owned + crafted from surplus below).
   const pool = [];
   const covered = [];
   const craftable = [];
   let carry = 0;
   tiers.forEach((t, i) => {
      craftable[i] = carry;
      pool[i] = t.owned + carry;
      covered[i] = Math.min(t.need, pool[i]);
      const next = tiers[i + 1];
      carry = next?.craft ? Math.floor((pool[i] - covered[i]) / next.craft.quantity) : 0;
   });

   // Downward pass: crafts actually required = demand at a tier not met by owned items there.
   const out = tiers.map((t) => ({ key: t.key, used_owned: 0, crafted: 0, missing: 0, crafts: 0, craft_mora: 0 }));
   let demandFromAbove = 0; // units of this tier consumed to craft the tier above
   for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i];
      const demand = covered[i] + demandFromAbove;
      const fromOwned = Math.min(t.owned, demand);
      const crafts = Math.min(demand - fromOwned, craftable[i]);
      out[i].used_owned = Math.min(fromOwned, t.need); // owned items going to this tier's own need
      out[i].crafted = covered[i] - Math.min(fromOwned, covered[i]);
      out[i].missing = t.need - covered[i];
      out[i].crafts = crafts;
      out[i].craft_mora = crafts * (t.craft?.mora ?? 0);
      demandFromAbove = crafts * (t.craft?.quantity ?? 0);
   }
   return out;
}
