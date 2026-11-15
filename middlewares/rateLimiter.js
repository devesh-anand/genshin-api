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
