/**
 * Game-wide reference info: valid filter values and dataset freshness.
 * Aggregates other features through their services only.
 */
import fs from 'fs/promises';
import path from 'path';
import { DATA_DIR } from '../../lib/paths.js';
import { listElements, listNations, listCharacterWeaponTypes, countCharacters } from '../characters/service.js';
import { listWeaponTypes, countWeapons } from '../weapons/service.js';
import { countArtifacts } from '../artifacts/service.js';
import { listMaterialCategories, countMaterials } from '../materials/service.js';
import { listEnemyTypes, countEnemies } from '../enemies/service.js';

/** data/meta.json, written by scripts/sync.mjs. Missing or invalid → null. */
async function readMeta() {
   try {
      return JSON.parse(await fs.readFile(path.join(DATA_DIR, 'meta.json'), 'utf-8'));
   } catch {
      return null;
   }
}

export async function getGameInfo() {
   const [
      elements, nations, characterWeapons, weaponTypes, materialCategories, enemyTypes,
      characters, weapons, artifacts, materials, enemies, meta,
   ] = await Promise.all([
      listElements(), listNations(), listCharacterWeaponTypes(), listWeaponTypes(),
      listMaterialCategories(), listEnemyTypes(),
      countCharacters(), countWeapons(), countArtifacts(), countMaterials(), countEnemies(),
      readMeta(),
   ]);
   return {
      elements,
      nations,
      character_weapon_types: characterWeapons,
      weapon_types: weaponTypes,
      material_categories: materialCategories,
      enemy_types: enemyTypes,
      counts: { characters, weapons, artifacts, materials, enemies },
      data_last_synced: meta?.last_synced ?? null,
      disclaimer:
         'Unofficial fan project, not affiliated with HoYoverse. Game content © HoYoverse / COGNOSPHERE. ' +
         'Data courtesy of yatta.moe, Enka.Network and the Genshin Impact Fandom Wiki.',
   };
}
