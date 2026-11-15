/** MCP tools for characters — thin wrappers over ./service.js (no logic here). */
import { z, enumOf, rarityOf, sectionsOf, sortOrder, nameArg, pageArgs } from '../../mcp/schema.js';
import { paginate } from '../../lib/paginate.js';
import {
   listCharacters,
   resolveCharacter,
   describeCharacter,
   toBrief,
   listElements,
   listNations,
   listCharacterWeaponTypes,
   listCharacterRarities,
   SORT_FIELDS,
   CHARACTER_SECTIONS,
} from './service.js';

export async function tools() {
   const [elements, nations, weapons, rarities] = await Promise.all([
      listElements(), listNations(), listCharacterWeaponTypes(), listCharacterRarities(),
   ]);

   return [
      {
         name: 'list_characters',
         title: 'List characters',
         description:
            'List playable Genshin Impact characters, optionally filtered by element, weapon type, nation and rarity. ' +
            'Returns brief entries (key, name, element, weapon, nation, rarity). Use get_character with a key for details. Paged (default 100): pass next_offset back as offset to get more.',
         inputSchema: {
            element: enumOf(elements, 'Element (Vision).').optional(),
            weapon: enumOf(weapons, 'Weapon type the character wields.').optional(),
            nation: enumOf(nations, 'Nation / region of origin.').optional(),
            rarity: rarityOf(rarities).optional(),
            sort: z.enum(Object.keys(SORT_FIELDS)).optional().describe('Sort field.'),
            order: sortOrder,
            ...pageArgs,
         },
         handler: async ({ limit, offset, ...filters }) => {
            const results = await listCharacters(filters);
            const { items, ...page } = paginate(results, { limit, offset });
            return { ...page, characters: items.map(toBrief) };
         },
      },
      {
         name: 'get_character',
         title: 'Get character',
         description:
            'Get one character by name. Returns only the requested sections (default: overview) — full records are large, ' +
            'so ask for what you need: overview (identity, lore), talents (skills/passives text), constellations, ' +
            'ascension_costs (materials + Mora per ascension phase), talent_costs (per talent level), images (URLs). ' +
            'If the name is ambiguous or unknown the error lists suggested keys.',
         inputSchema: {
            name: nameArg('Character'),
            sections: sectionsOf(CHARACTER_SECTIONS, 'Which parts of the record to return. Default ["overview"].'),
         },
         handler: async ({ name, sections }) => describeCharacter(await resolveCharacter(name), sections),
      },
   ];
}
