/**
 * Community nicknames → character slugs. Hand-curated (not synced), so it lives in code
 * rather than data/. Only add names players actually use; full display names already match.
 * Checked by service.test.js: every slug exists and no alias collides with another
 * character's name or slug.
 */

const ELEMENTS = ['anemo', 'cryo', 'dendro', 'electro', 'geo', 'hydro', 'pyro'];

// Travelers: Aether and Lumine share each kit, so these aliases are intentionally
// ambiguous between the two (the resolver answers with both as suggestions).
const travelerAliases = Object.fromEntries(
   ELEMENTS.flatMap((el) =>
      ['aether', 'lumine'].map((who) => [
         `${who}-${el}`,
         ['Traveler', 'Traveller', 'MC', `${el} Traveler`, `${el} Traveller`, `${el} MC`, `${el} ${who}`],
      ])
   )
);

export const CHARACTER_ALIASES = {
   ...travelerAliases,

   // Archons and well-known other names
   venti: ['Barbatos', 'Anemo Archon'],
   zhongli: ['Morax', 'Rex Lapis', 'Geo Archon', 'ZL'],
   raiden: ['Ei', 'Raiden Ei', 'Shogun', 'Baal', 'Electro Archon'],
   nahida: ['Kusanali', 'Lesser Lord Kusanali', 'Buer', 'Dendro Archon'],
   furina: ['Focalors', 'Hydro Archon'],
   mavuika: ['Pyro Archon'],
   tartaglia: ['Childe', 'Ajax'],
   wanderer: ['Scaramouche', 'Scara', 'Kunikuzushi', 'Kabukimono'],
   arlecchino: ['Arle', 'Knave', 'The Knave'],
   xianyun: ['Cloud Retainer'],

   // Short forms
   alhaitham: ['Haitham', 'Al Haitham'],
   neuvillette: ['Neuv', 'Neuvi'],
   wriothesley: ['Wrio'],
   yoimiya: ['Yoi'],
   tighnari: ['Nari'],
   faruzan: ['Faru'],
   ningguang: ['Ning'],
   sigewinne: ['Sige'],
   bennett: ['Benny'],
   xingqiu: ['XQ'],
   xiangling: ['XL'],
   kuki: ['Shinobu'],
   yae: ['Miko'],
   heizou: ['Heizo'],
   'yumemizuki-mizuki': ['Mizuki'],
};
