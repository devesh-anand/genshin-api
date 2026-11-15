#!/usr/bin/env node
/**
 * Local MCP entry point (stdio). Hosts spawn it as a child process:
 *   node /absolute/path/to/genshin-api/mcp/stdio.js
 * Works from any working directory. Logs go to stderr only.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './server.js';

const server = await createMcpServer();
await server.connect(new StdioServerTransport());
console.error('[mcp] genshin-api MCP server running on stdio');
