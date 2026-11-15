import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, isCloudflareIp, rateLimitKey } from './clientIp.js';

const req = (ip, headers = {}) => ({ ip, get: (h) => headers[h.toLowerCase()] });

describe('isCloudflareIp', () => {
   it('matches Cloudflare v4/v6 ranges, including IPv4-mapped addresses', () => {
      assert.equal(isCloudflareIp('172.70.1.2'), true);        // 172.64.0.0/13
      assert.equal(isCloudflareIp('::ffff:162.158.3.4'), true);  // 162.158.0.0/15, mapped
      assert.equal(isCloudflareIp('2a06:98c1:3120::2'), true);   // 2a06:98c0::/29
      assert.equal(isCloudflareIp('159.69.36.1'), false);
      assert.equal(isCloudflareIp('not-an-ip'), false);
      assert.equal(isCloudflareIp(undefined), false);
   });
});

describe('clientIp', () => {
   it('uses CF-Connecting-IP when the request came through Cloudflare', () => {
      assert.equal(clientIp(req('172.70.1.2', { 'cf-connecting-ip': '198.51.100.9' })), '198.51.100.9');
      assert.equal(clientIp(req('::ffff:162.158.3.4', { 'cf-connecting-ip': '2001:db8::1' })), '2001:db8::1');
   });

   it('ignores CF-Connecting-IP from anyone else (no spoofing via the Railway domain)', () => {
      assert.equal(clientIp(req('203.0.113.5', { 'cf-connecting-ip': '198.51.100.9' })), '203.0.113.5');
   });

   it('ignores malformed headers and falls back to req.ip', () => {
      assert.equal(clientIp(req('172.70.1.2', { 'cf-connecting-ip': 'evil, 1.2.3.4' })), '172.70.1.2');
      assert.equal(clientIp(req('::ffff:203.0.113.5')), '203.0.113.5');
   });
});

describe('rateLimitKey', () => {
   it('groups IPv6 clients by /56', () => {
      const a = rateLimitKey(req('172.70.1.2', { 'cf-connecting-ip': '2001:db8:1:1::1' }));
      const b = rateLimitKey(req('172.70.1.2', { 'cf-connecting-ip': '2001:db8:1:2::9' }));
      assert.equal(a, b);
      assert.notEqual(rateLimitKey(req('203.0.113.5')), rateLimitKey(req('203.0.113.6')));
   });
});
