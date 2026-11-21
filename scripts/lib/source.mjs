/**
 * Rules for talking to data sources (yatta.moe, Enka.Network, the Fandom wiki).
 * Every script imports these instead of rolling its own.
 */

/**
 * One honest User-Agent for every request the scripts make: names the project and where to find
 * it. Never a browser string — sources should be able to see (and rate-limit or contact) us.
 */
export const USER_AGENT = 'genshin-api-sync/1.0 (+https://github.com/devesh-anand/genshin-api)';

/**
 * Only live content is ever added (see CLAUDE.md, "Content rules"). yatta gives characters a
 * `release` time in Unix seconds; a character counts as released only when that is present and
 * in the past. Missing or future → not released, never "probably fine".
 * @param {{ release?: number } | null | undefined} item - a yatta avatar (list entry or detail)
 * @param {number} [now] - ms since epoch
 */
export function isReleased(item, now = Date.now()) {
   const release = Number(item?.release);
   return Number.isFinite(release) && release > 0 && release * 1000 <= now;
}
