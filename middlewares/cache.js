export const ONE_HOUR = 3600;
export const ONE_DAY  = 86400;

export function cacheControl(maxAge = ONE_HOUR) {
   return (req, res, next) => {
      if (req.method === 'GET') {
         res.set('Cache-Control', `public, max-age=${maxAge}`);
      }
      next();
   };
}
