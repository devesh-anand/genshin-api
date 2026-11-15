/**
 * The real client IP for rate limiting.
 *
 * Production path: client → Cloudflare (genshin-api.deve.sh, proxied) → Railway edge → app.
 * Express `trust proxy` = 1 (app.js) yields the address Railway's edge saw — which, for the
 * custom domain, is a Cloudflare server shared by many users. Cloudflare puts the real client
 * in `CF-Connecting-IP`, but that header is only trustworthy when the request actually came
 * from Cloudflare; anyone hitting the Railway domain directly could set it to dodge limits.
 * So: use CF-Connecting-IP only when the hop before Railway is a Cloudflare IP.
 */
import net from 'net';
import { ipKeyGenerator } from 'express-rate-limit';

// https://www.cloudflare.com/ips-v4 and /ips-v6 — fetched 2026-11-15. Cloudflare changes these rarely.
export const CLOUDFLARE_RANGES = [
   '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
   '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
   '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
   '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
   '2a06:98c0::/29', '2c0f:f248::/32',
];

const cloudflare = new net.BlockList();
for (const range of CLOUDFLARE_RANGES) {
   const [address, prefix] = range.split('/');
   cloudflare.addSubnet(address, Number(prefix), net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

/** Strips the IPv4-mapped IPv6 prefix Node uses for dual-stack sockets ("::ffff:1.2.3.4"). */
const unmap = (ip) => (ip?.startsWith('::ffff:') && net.isIPv4(ip.slice(7)) ? ip.slice(7) : ip);

export function isCloudflareIp(ip) {
   const addr = unmap(ip);
   const family = net.isIPv4(addr) ? 'ipv4' : net.isIPv6(addr) ? 'ipv6' : null;
   return family ? cloudflare.check(addr, family) : false;
}

/** @param {import('express').Request} req */
export function clientIp(req) {
   const hop = unmap(req.ip);
   const forwarded = req.get('cf-connecting-ip')?.trim();
   if (forwarded && net.isIP(forwarded) && isCloudflareIp(hop)) return forwarded;
   return hop;
}

/** Rate-limit key: client IP, with IPv6 grouped by /56 so one user can't rotate addresses. */
export const rateLimitKey = (req) => ipKeyGenerator(clientIp(req));
