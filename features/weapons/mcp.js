/** MCP tools for weapons — thin wrappers over ./service.js (no logic here). */
import { z, enumOf, rarityOf, sectionsOf, sortOrder, nameArg, pageArgs } from '../../mcp/schema.js';
import { paginate } from '../../lib/paginate.js';
import {
   listWeapons,
   resolveWeapon,
   describeWeapon,
   toBrief,
   listWeaponTypes,
   listWeaponRarities,
   SORT_FIELDS,
   WEAPON_SECTIONS,
} from './service.js';

export async function tools() {
   const [types, rarities] = await Promise.all([listWeaponTypes(), listWeaponRarities()]);

   return [
      {
         name: 'list_weapons',
         title: 'List weapons',
         description:
            'List weapons, optionally filtered by type and rarity. Returns brief entries (key, name, type, rarity, sub_stat). ' +
            'Use get_weapon for passive, stats and costs. Paged (default 100): pass next_offset back as offset to get more.',
         inputSchema: {
            type: enumOf(types, 'Weapon type.').optional(),
            rarity: rarityOf(rarities).optional(),
            sort: z.enum(Object.keys(SORT_FIELDS)).optional().describe('Sort field.'),
            order: sortOrder,
            ...pageArgs,
         },
         handler: async ({ limit, offset, ...filters }) => {
            const results = await listWeapons(filters);
            const { items, ...page } = paginate(results, { limit, offset });
            return { ...page, weapons: items.map(toBrief) };
         },
      },
      {
         name: 'get_weapon',
         title: 'Get weapon',
         description:
            'Get one weapon by name. Sections (default: overview): overview (type, rarity, base ATK, sub-stat, passive text), ' +
            'refinements (passive text at R1–R5), ascension_costs, images.',
         inputSchema: {
            name: nameArg('Weapon'),
            sections: sectionsOf(WEAPON_SECTIONS, 'Which parts of the record to return. Default ["overview"].'),
         },
         handler: async ({ name, sections }) => describeWeapon(await resolveWeapon(name), sections),
      },
   ];
}
