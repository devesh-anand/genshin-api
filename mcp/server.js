/**
 * Builds the MCP server from the registry. Transport-agnostic: stdio.js (local) and,
 * in Phase 2, an HTTP handler connect it to a transport.
 *
 * Tool definition shape (returned by features/<name>/mcp.js → tools()):
 *   { name, title, description, inputSchema: ZodRawShape, handler(args) → value,
 *     access?: 'public' | 'auth' (default 'public'), annotations?: ToolAnnotations }
 *
 * IMPORTANT for stdio: stdout is the protocol channel. Never console.log() in code the
 * MCP server runs — use console.error() for diagnostics.
 */
import fs from 'fs';
import path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ROOT_DIR } from '../lib/paths.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { TOOLSETS } from './registry.js';

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'));

export const SERVER_NAME = 'genshin-api';

export const INSTRUCTIONS = `Genshin Impact game data: characters, weapons, artifact sets, materials and enemies.
- Names are resolved loosely ("hutao", "Raiden Shogun"); if a name is ambiguous the error lists keys to retry with.
- Not sure what something is? Call search first, then the matching get_* tool with a returned key.
- get_character and get_weapon return only the sections you request — ask for just what the question needs.
- Material keys in costs/drops can be passed to get_material.
- Abbreviations can mean different things in different categories ("HoD" is the sword Harbinger of
  Dawn and the artifact set Heart of Depth). Pick the tool for the category the user means; if
  unsure, call search and decide from context (e.g. the character's weapon type and element), or ask.
- For "what do I need to build X" use plan_materials (pass the player's inventory if known); for
  "what should I farm today" use get_farming_schedule. Don't add up costs yourself.
- Unofficial fan project, not affiliated with HoYoverse; game content belongs to HoYoverse / COGNOSPHERE.`;

const DEFAULT_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

export const MAX_LOGGED_QUERY = 64;

/** A looked-up name made safe to log: control characters stripped, whitespace collapsed, capped. */
export function cleanQuery(value) {
   return String(value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_LOGGED_QUERY);
}

/** Turns a handler's return value into an MCP tool result. */
export function toToolResult(value) {
   return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

/** Expected errors → readable isError result; anything else → generic message (details to stderr). */
export function toErrorResult(err, toolName) {
   if (err instanceof AppError) {
      return { isError: true, content: [{ type: 'text', text: err.message }] };
   }
   console.error(`[mcp] ${toolName} failed:`, err);
   return { isError: true, content: [{ type: 'text', text: 'Internal error while running this tool.' }] };
}

/** Collects every tool definition from the given toolsets (default: the registry). */
export async function loadToolDefinitions(toolsets = TOOLSETS) {
   return (await Promise.all(toolsets.map((toolset) => toolset()))).flat();
}

/**
 * @param {{ user?: object|null, toolsets?: Function[], definitions?: object[], onToolCall?: Function }} [opts]
 *   user        - authenticated user (Phase 5); tools with access 'auth' are hidden without one
 *   toolsets    - override the registry (tests only)
 *   definitions - pre-loaded tool definitions (the HTTP transport builds a server per request
 *                 and loads definitions once); defaults to loading from `toolsets`
 *   onToolCall  - called after every tool call with { tool, ok, ms, error?, unresolved? } — usage logging.
 *                 `error` is the error class name. Arguments are never passed, with one exception:
 *                 for a name that didn't resolve, `unresolved` = { entity, query } (the game-name text,
 *                 cleaned and capped at 64 chars) so missing nicknames can be found and added.
 * @returns {Promise<McpServer>}
 */
export async function createMcpServer({ user = null, toolsets = TOOLSETS, definitions, onToolCall } = {}) {
   const server = new McpServer({ name: SERVER_NAME, version }, { instructions: INSTRUCTIONS });

   for (const def of definitions ?? (await loadToolDefinitions(toolsets))) {
      if ((def.access ?? 'public') === 'auth' && !user) continue;
      server.registerTool(
         def.name,
         {
            title: def.title,
            description: def.description,
            inputSchema: def.inputSchema,
            annotations: { title: def.title, ...DEFAULT_ANNOTATIONS, ...def.annotations },
         },
         async (args) => {
            const started = performance.now();
            let result;
            let error;
            try {
               result = toToolResult(await def.handler(args ?? {}, { user }));
            } catch (err) {
               error = err;
               result = toErrorResult(err, def.name);
            }
            if (onToolCall) {
               const ms = Math.round(performance.now() - started);
               try {
                  onToolCall({
                     tool: def.name,
                     ok: !error,
                     ms,
                     ...(error && { error: error.name || 'Error' }),
                     ...(error instanceof NotFoundError && error.query !== undefined && {
                        unresolved: { entity: error.entity, query: cleanQuery(error.query) },
                     }),
                  });
               } catch {
                  // logging must never break a tool call
               }
            }
            return result;
         }
      );
   }
   return server;
}
