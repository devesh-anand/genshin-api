import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Absolute paths, resolved from this file's location — NOT from process.cwd().
 * The server must work no matter which directory it's launched from
 * (e.g. an MCP host spawning `node /abs/path/mcp/stdio.js` from `/`).
 */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');

/** Absolute path to a sub-directory of data/, e.g. dataDir('characters'). */
export const dataDir = (name) => path.join(DATA_DIR, name);
