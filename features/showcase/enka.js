/**
 * Enka.Network client for in-game Character Showcases, with a bounded cache.
 *
 * Enka's rules (github.com/EnkaNetwork/API-docs): send a descriptive User-Agent, honour each
 * response's `ttl` (seconds until Enka asks the game again — refetching sooner just returns the
 * same data), don't enumerate UIDs. So:
 *   - one cache entry per UID, kept until its ttl; capped by entry count AND bytes (LRU evicts
 *     the least recently read first), so memory stays bounded however many UIDs are looked up
 *   - "no such player" is cached too (briefly), so repeated bad UIDs don't each cost a request
 *   - concurrent lookups of one UID share a single request; at most `concurrency` requests run
 *     at once and at most `queue` wait — past that, callers get a 503 straight away
 *
 * The cache holds whatever `transform(raw)` returns (the normalized showcase), not Enka's raw JSON,
 * serialized: a 12-character showcase is ~55 KB, so the default 32 MiB holds ~600 showcases.
 */
import { LRUCache } from 'lru-cache';
import { NotFoundError, UnavailableError, ValidationError } from '../../lib/errors.js';

export const ENKA_API = 'https://enka.network/api/uid';
export const USER_AGENT = 'genshin-api/1.0 (+https://genshin-api.deve.sh; github.com/devesh-anand/genshin-api)';

const MB = 1024 * 1024;
const MIN_TTL = 60;          // seconds — never refetch a UID more often than this
const DEFAULT_TTL = 300;     // when Enka sends no ttl
const NOT_FOUND_TTL = 300;   // "no such player"
const RETRY_AFTER = 30;      // seconds, sent with 503s

const envInt = (name, fallback) => {
   const n = Number(process.env[name]);
   return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetch]
 * @param {number} [opts.maxEntries]   - SHOWCASE_CACHE_MAX, default 2000
 * @param {number} [opts.maxBytes]     - SHOWCASE_CACHE_MB × 1 MiB, default 32 MiB
 * @param {number} [opts.concurrency]  - requests to Enka at once, default 4
 * @param {number} [opts.queue]        - requests allowed to wait, default 50
 * @param {number} [opts.timeoutMs]    - per request, default 10 s
 * @param {number} [opts.minTtl]       - seconds; floor under Enka's ttl, default 60
 * @param {() => number} [opts.now]
 */
export function createEnkaClient({
   fetch: fetchFn = globalThis.fetch,
   maxEntries = envInt('SHOWCASE_CACHE_MAX', 2000),
   maxBytes = envInt('SHOWCASE_CACHE_MB', 32) * MB,
   concurrency = 4,
   queue = 50,
   timeoutMs = 10_000,
   minTtl = MIN_TTL,
   now = Date.now,
} = {}) {
   // value: { json: Buffer } or { notFound: true }. Stored as serialized JSON so maxSize counts
   // real bytes (a parsed object takes several times its JSON size on the heap, unpredictably).
   const cache = new LRUCache({
      max: maxEntries,
      maxSize: maxBytes,
      sizeCalculation: (v) => (v.json?.length ?? 0) + 64,
   });
   const inFlight = new Map(); // uid → Promise
   const waiting = [];         // resolve callbacks for queued requests
   let running = 0;
   let hits = 0, misses = 0;

   async function slot() {
      if (running < concurrency) { running++; return; }
      if (waiting.length >= queue) {
         throw new UnavailableError('Showcase lookups are busy right now. Try again in a moment.', { retryAfter: RETRY_AFTER });
      }
      await new Promise((resolve) => waiting.push(resolve));
   }
   function release() {
      const next = waiting.shift();
      if (next) next(); else running--;
   }

   function remember(uid, value, ttlSeconds) {
      cache.set(uid, value, { ttl: ttlSeconds * 1000 });
   }

   async function request(uid, transform) {
      await slot();
      let res;
      try {
         res = await fetchFn(`${ENKA_API}/${uid}`, {
            headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
         });
      } catch {
         throw new UnavailableError('Enka.Network did not respond. Try again shortly.', { retryAfter: RETRY_AFTER });
      } finally {
         release();
      }

      // Status codes from Enka's API docs
      if (res.status === 400) throw new ValidationError(`"${uid}" is not a valid UID.`);
      if (res.status === 404) {
         remember(uid, { notFound: true }, NOT_FOUND_TTL);
         throw new NotFoundError(`No player with UID ${uid}.`);
      }
      if (res.status === 424) {
         throw new UnavailableError('Enka.Network is updating after a game patch. Try again later.', { retryAfter: 600 });
      }
      if (res.status === 429) {
         throw new UnavailableError('Too many showcase lookups right now. Try again in a minute.', { retryAfter: 60 });
      }
      if (!res.ok) throw new UnavailableError('Enka.Network is having problems. Try again later.', { retryAfter: RETRY_AFTER });

      let raw;
      try {
         raw = await res.json();
      } catch {
         throw new UnavailableError('Enka.Network sent an unreadable response. Try again later.', { retryAfter: RETRY_AFTER });
      }
      const ttl = Math.max(minTtl, Number.isFinite(raw?.ttl) ? raw.ttl : DEFAULT_TTL);
      const fetchedAt = now();
      const data = await transform(raw, { fetchedAt, cachedUntil: fetchedAt + ttl * 1000 });
      remember(uid, { json: Buffer.from(JSON.stringify(data)) }, ttl);
      return data;
   }

   return {
      /**
       * The transformed showcase for `uid`, from cache when fresh.
       * @param {string} uid - already validated by the caller
       * @param {(raw: object, meta: { fetchedAt: number, cachedUntil: number }) => any} transform
       * @throws {ValidationError|NotFoundError|UnavailableError}
       */
      async get(uid, transform) {
         const hit = cache.get(uid);
         if (hit) {
            hits++;
            if (hit.notFound) throw new NotFoundError(`No player with UID ${uid}.`);
            return JSON.parse(hit.json.toString('utf8')); // a fresh copy per caller
         }
         misses++;
         if (!inFlight.has(uid)) {
            inFlight.set(uid, request(uid, transform).finally(() => inFlight.delete(uid)));
         }
         return inFlight.get(uid);
      },

      /** Cache figures for /health. */
      stats() {
         return {
            entries: cache.size,
            max_entries: maxEntries,
            bytes: cache.calculatedSize,
            max_bytes: maxBytes,
            hits,
            misses,
            in_flight: running,
            queued: waiting.length,
         };
      },
   };
}
