/**
 * Small helpers shared by every features/<name>/rest.js.
 * Routers stay thin: parse req → call service → send.
 */

/** Wraps an async handler so thrown errors reach the error middleware. */
export const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Sends the standard list response: slugs by default, summaries with ?details=true.
 * @param {string} key - response key, e.g. 'characters'
 * @param {Array<{slug, data}>} results
 * @param {string|undefined} details - raw ?details query value
 * @param {(entry) => object} toSummary
 */
export function sendList(res, key, results, details, toSummary) {
   res.send({ [key]: details === 'true' ? results.map(toSummary) : results.map((r) => r.slug) });
}

/** Sends the entity, or a 404 with `message` when it's null. */
export function sendOr404(res, entity, message) {
   if (!entity) return res.status(404).send({ error: message });
   res.send(entity);
}
