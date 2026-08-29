import rateLimit from 'express-rate-limit';

const rateLimiter = rateLimit({
   windowMs: 60 * 1000, // 1 minute
   max: 100,
   standardHeaders: true,
   legacyHeaders: false,
   message: { error: 'Too many requests. Please try again in a minute.' },
});

export default rateLimiter;
