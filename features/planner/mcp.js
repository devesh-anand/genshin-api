/** MCP tools for the material planner — thin wrappers over ./service.js (no logic here). */
import { z } from '../../mcp/schema.js';
import { omitKeys } from '../../lib/objects.js';
import { planMaterials, getFarmingSchedule, targetSchema, inventorySchema, resinOptionsSchema, DAYS, MAX_TARGETS } from './service.js';

const targets = z
   .array(targetSchema)
   .min(1)
   .max(MAX_TARGETS)
   .describe(
      'Characters/weapons to build. Each: { type: "character"|"weapon", name, level?: { from, to }, talents?: ' +
         '{ normal_attack?|elemental_skill?|elemental_burst?: { from, to } } }. Give level and/or talents. ' +
         'At cap levels (20/40/…/80) set level.from_ascended if already ascended.'
   );

export async function tools() {
   return [
      {
         name: 'plan_materials',
         title: 'Plan materials',
         description:
            'Calculate everything needed to level/ascend characters and weapons and raise talents: every material with ' +
            'quantity and source (domain + days, boss, region), Mora split into leveling/ascension/talents, and EXP. ' +
            'Several targets are combined into one list. Pass `inventory` (what the player owns) to get owned/crafted/missing ' +
            'per material — lower tiers are crafted up automatically, with the crafting Mora. Use get_farming_schedule ' +
            'for where/when to farm what is missing.',
         inputSchema: { targets, inventory: inventorySchema.optional() },
         // Enemy lists are long and get_farming_schedule has them; keep plans compact.
         handler: async (args) => omitKeys(await planMaterials(args), ['dropped_by']),
      },
      {
         name: 'get_farming_schedule',
         title: 'Get farming schedule',
         description:
            'For the same targets (and optional inventory) as plan_materials: what is still needed, grouped by where to ' +
            'farm it — domains with their open weekdays (filter with `day`; Sunday opens all), bosses and weekly bosses, ' +
            'local specialties by region, and common drops with the enemies that drop them — plus a resin estimate: ' +
            'resin per activity (domain/boss/weekly boss/Ley Line runs), total resin, and estimated days (limited by ' +
            'resin, domain open days and once-a-week weekly bosses), from average drop rates. Use for "what should I farm ' +
            'today/this week?" and "how long will this build take?".',
         inputSchema: {
            targets,
            inventory: inventorySchema.optional(),
            day: z.enum(DAYS).optional().describe('Only domains open on this day. Default: the whole week.'),
            resin: resinOptionsSchema.optional(),
         },
         handler: async (args) => getFarmingSchedule(args),
      },
   ];
}
