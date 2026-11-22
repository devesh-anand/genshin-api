/**
 * The game's FIGHT_PROP_* stat names (as in Enka showcases and yatta weapon data) → our stat key,
 * display name, and whether the value is a percentage (the game stores those as fractions).
 */
export const FIGHT_PROPS = {
   FIGHT_PROP_BASE_ATTACK:       { key: 'base_atk', name: 'Base ATK' },
   FIGHT_PROP_HP:                { key: 'hp', name: 'HP' },
   FIGHT_PROP_HP_PERCENT:        { key: 'hp_percent', name: 'HP', percent: true },
   FIGHT_PROP_ATTACK:            { key: 'atk', name: 'ATK' },
   FIGHT_PROP_ATTACK_PERCENT:    { key: 'atk_percent', name: 'ATK', percent: true },
   FIGHT_PROP_DEFENSE:           { key: 'def', name: 'DEF' },
   FIGHT_PROP_DEFENSE_PERCENT:   { key: 'def_percent', name: 'DEF', percent: true },
   FIGHT_PROP_ELEMENT_MASTERY:   { key: 'elemental_mastery', name: 'Elemental Mastery' },
   FIGHT_PROP_CHARGE_EFFICIENCY: { key: 'energy_recharge', name: 'Energy Recharge', percent: true },
   FIGHT_PROP_CRITICAL:          { key: 'crit_rate', name: 'CRIT Rate', percent: true },
   FIGHT_PROP_CRITICAL_HURT:     { key: 'crit_dmg', name: 'CRIT DMG', percent: true },
   FIGHT_PROP_HEAL_ADD:          { key: 'healing_bonus', name: 'Healing Bonus', percent: true },
   FIGHT_PROP_PHYSICAL_ADD_HURT: { key: 'physical_dmg_bonus', name: 'Physical DMG Bonus', percent: true },
   FIGHT_PROP_FIRE_ADD_HURT:     { key: 'pyro_dmg_bonus', name: 'Pyro DMG Bonus', percent: true },
   FIGHT_PROP_ELEC_ADD_HURT:     { key: 'electro_dmg_bonus', name: 'Electro DMG Bonus', percent: true },
   FIGHT_PROP_WATER_ADD_HURT:    { key: 'hydro_dmg_bonus', name: 'Hydro DMG Bonus', percent: true },
   FIGHT_PROP_GRASS_ADD_HURT:    { key: 'dendro_dmg_bonus', name: 'Dendro DMG Bonus', percent: true },
   FIGHT_PROP_WIND_ADD_HURT:     { key: 'anemo_dmg_bonus', name: 'Anemo DMG Bonus', percent: true },
   FIGHT_PROP_ROCK_ADD_HURT:     { key: 'geo_dmg_bonus', name: 'Geo DMG Bonus', percent: true },
   FIGHT_PROP_ICE_ADD_HURT:      { key: 'cryo_dmg_bonus', name: 'Cryo DMG Bonus', percent: true },
};
