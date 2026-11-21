/** MCP tools for character showcases — thin wrappers over ./service.js (no logic here). */
import { z } from '../../mcp/schema.js';
import { omitKeys } from '../../lib/objects.js';
import { getShowcase, findShowcaseCharacter, toBrief, toPlannerTargets } from './service.js';

export async function tools() {
   return [
      {
         name: 'get_showcase',
         title: 'Get player showcase',
         description:
            "Look up a player's in-game Character Showcase by UID (via Enka.Network): profile (Adventure Rank, World " +
            'Level, Abyss, Theater) and the builds of the showcased characters — level, constellation, talents, weapon, ' +
            'artifacts, set bonuses, crit value and final stats. Without `character`, returns a short line per ' +
            'character; with `character`, that character in full plus `planner_targets` to pass to plan_materials ' +
            '(current levels → 90 / talents 10). Only characters the player put on their showcase with "Show ' +
            'Character Details" on are visible (`details_hidden` otherwise). Data refreshes about once a minute per UID.',
         inputSchema: {
            uid: z.string().regex(/^[1-9]\d{8,9}$/).describe('The player\'s UID: 9 or 10 digits.'),
            character: z.string().min(1).optional().describe('A showcased character (loose name) for the full build.'),
         },
         annotations: { openWorldHint: true },
         handler: async ({ uid, character }) => {
            const showcase = await getShowcase(uid);
            if (character) {
               const c = await findShowcaseCharacter(showcase, character);
               return { ...omitKeys(c, ['img']), planner_targets: toPlannerTargets(c) };
            }
            return {
               player: omitKeys(showcase.player, ['profile_picture', 'namecard_id']),
               characters: showcase.characters.map(toBrief),
               details_hidden: showcase.details_hidden,
               ...(showcase.details_hidden && { listed: showcase.listed.map((c) => c.name ?? c.id) }),
               fetched_at: showcase.fetched_at,
               source: showcase.source,
            };
         },
      },
   ];
}
