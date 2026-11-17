// Where images live. Shared by every script that uploads images or writes image URLs to data/.

export const BUCKET = 'genshin-images';

// Public base for image URLs in data/: the bucket's custom domain (R2 → Settings → Custom Domains),
// cached by Cloudflare. The old r2.dev address (https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev)
// serves the same keys and still works, but it's rate-limited and uncached — don't write it to data/.
export const PUBLIC_URL = 'https://gi.deve.sh';
