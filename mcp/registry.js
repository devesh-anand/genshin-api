/**
 * MCP tool registry — every feature's tools() is listed here, explicitly.
 * Adding a feature with MCP tools? Add one import + one entry. (Checked by mcp/server.test.js.)
 */
import { tools as search } from '../features/search/mcp.js';
import { tools as characters } from '../features/characters/mcp.js';
import { tools as weapons } from '../features/weapons/mcp.js';
import { tools as artifacts } from '../features/artifacts/mcp.js';
import { tools as materials } from '../features/materials/mcp.js';
import { tools as enemies } from '../features/enemies/mcp.js';
import { tools as info } from '../features/info/mcp.js';
import { tools as planner } from '../features/planner/mcp.js';

export const TOOLSETS = [search, characters, weapons, artifacts, materials, enemies, info, planner];
