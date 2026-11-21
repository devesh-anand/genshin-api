import rateLimit from 'express-rate-limit';
import { rateLimitKey } from '../lib/clientIp.js';

const rateLimiter = rateLimit({
   windowMs: 60 * 1000, // 1 minute
   max: 100,
   standardHeaders: true,
   legacyHeaders: false,
   keyGenerator: rateLimitKey, // real client IP, incl. behind Cloudflare (lib/clientIp.js)
   message: { error: 'Too many requests. Please try again in a minute.' },
});

export default rateLimiter;

/**
 * Tighter limit for /showcase: each miss costs a request to Enka.Network, which rate-limits us
 * in turn. 10 lookups a minute per IP is plenty for a person and stops UID enumeration.
 */
export const showcaseRateLimiter = rateLimit({
   windowMs: 60 * 1000,
   max: 10,
   standardHeaders: true,
   legacyHeaders: false,
   keyGenerator: rateLimitKey,
   message: { error: 'Too many showcase lookups. Please try again in a minute.' },
});
