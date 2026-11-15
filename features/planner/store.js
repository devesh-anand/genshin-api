import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '../../lib/paths.js';

/**
 * data/progression.json — EXP curves, level caps, EXP items, Mora rates.
 * Data access only; loaded once and cached for the process lifetime.
 */
let cache = null;

export async function getProgression() {
   cache ??= fs.readFile(path.join(DATA_DIR, 'progression.json'), 'utf-8').then(JSON.parse).catch((e) => {
      cache = null;
      throw e;
   });
   return cache;
}
