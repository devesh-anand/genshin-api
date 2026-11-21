// Shared cleaner for Genshin in-game text markup. Every populate script runs
// descriptions through this so no raw game markup reaches data/.
//
//   <color=#FFD780FF>…</color>, <i>…</i>          → stripped
//   {LINK#N11360001}Gradient Beacons{/LINK}        → "Gradient Beacons" (glossary link)
//   {LAYOUT_MOBILE#Tap}{LAYOUT_PC#Press}{LAYOUT_PS#Press} → "Press" (keep PC wording)
//   {TIMEZONE}                                     → "server time"
//   literal "\n"                                   → newline

export function cleanText(str) {
   if (!str) return '';
   return str
      .replace(/<color=[^>]+>/g, '')
      .replace(/<\/color>/g, '')
      .replace(/<\/?i>/g, '')
      .replace(/\{LINK#[^}]*\}|\{\/LINK\}/g, '')
      .replace(/\{LAYOUT_PC#([^}]*)\}/g, '$1')
      .replace(/\{LAYOUT_[A-Z]+#[^}]*\}/g, '')
      .replace(/\{TIMEZONE\}/g, 'server time')
      .replace(/\\n/g, '\n')
      .trim();
}
