import { AppError } from '../lib/errors.js';

// eslint-disable-next-line no-unused-vars
export default function errorHandle(err, req, res, next) {
   if (err instanceof AppError) {
      if (err.retryAfter !== undefined) res.set('Retry-After', String(err.retryAfter));
      return res.status(err.status).send({ error: err.message });
   }
   console.error('error: ', err.stack);
   res.status(500).send({ error: 'Internal server error.' });
}
