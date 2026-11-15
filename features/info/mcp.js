/** MCP tool for game-wide reference info — thin wrapper over ./service.js. */
import { getGameInfo } from './service.js';

export async function tools() {
   return [
      {
         name: 'get_game_info',
         title: 'Get game info',
         description:
            'Valid filter values (elements, nations, weapon types, material categories, enemy types), dataset sizes, ' +
            'when the data was last synced, and the data attribution/disclaimer.',
         inputSchema: {},
         handler: async () => getGameInfo(),
      },
   ];
}
