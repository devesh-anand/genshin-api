# Data pipeline

How game data and images get into `data/` and the R2 bucket. Read this before running anything in `scripts/`. Code conventions live in [CLAUDE.md](../CLAUDE.md).

Images are stored on **Cloudflare R2** (`genshin-images` bucket) and served publicly at `https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev`. Scripts use R2 through `aws-sdk/clients/s3.js` (S3-compatible). The API server itself never writes to R2.

---

## Environment Variables (`.env`)

```
AWS_ID=...       # R2 access key ID
AWS_KEY=...      # R2 secret access key
R2_ID=...        # Cloudflare account ID (used in endpoint URL)
```

Only the scripts and the sync and image-variant workflows (`.github/workflows/sync.yml`, `image-variants.yml`, from repo secrets) need these. The deployed API server does not. All scripts call `dotenv.config()` — never commit `.env`.

---

## Character JSON Format

`data/characters/{slug}.json` — slug is lowercase-hyphenated name.

```jsonc
{
  "name": "Kaveh",
  "title": "Empyrean Reflection",
  "vision": "Dendro",           // element display name
  "weapon": "Claymore",
  "nation": "Sumeru",
  "affiliation": "The Kshahrewar",
  "rarity": 4,
  "constellation": "Paradisaea",
  "birthday": "0000-07-09",
  "description": "...",
  "skillTalents": [...],        // normal attack, skill, burst
  "passiveTalents": [...],      // A1, A4, utility passive
  "constellations": [...],      // C1–C6, each with img
  "vision_key": "DENDRO",
  "weapon_type": "CLAYMORE",
  "img": {
    "card":          "https://.../kaveh/card.png",        // 1080×1920 character card
    "constellation": "https://.../kaveh/constellation.png",// star-map background art
    "banner":        "https://.../kaveh/gacha-splash.png", // landscape splash art
    "icon":          "https://.../kaveh/icon.png",
    "icon-big":      "https://.../kaveh/icon-big.png",
    "portrait":      "https://.../kaveh/portrait.png"      // tall portrait art
  }
}
```

Traveler slugs follow the pattern `aether-{element}` and `lumine-{element}` (e.g., `aether-cryo`, `lumine-pyro`).

---

## Image Sources

All images are downloaded and re-uploaded to R2. The public R2 URL never changes even if the source image is updated.

### Regular characters

| Image | R2 key | Source | Notes |
|-------|--------|--------|-------|
| `card.png` | `{slug}/card.png` | Wiki `{Name}_Card.png` | 1080×1920 WebP, ~300–460KB |
| `portrait.png` | `{slug}/portrait.png` | Wiki `{Name}_Portrait.png` | Large hi-res art, ~800KB–5MB |
| `constellation.png` | `{slug}/constellation.png` | Wiki `{ConstellationName}.png` | Star-map background art |
| `gacha-splash.png` | `{slug}/gacha-splash.png` | Enka `UI_Gacha_AvatarImg_{internal}.png` | Landscape, 2048×1024 |
| `icon.png` | `{slug}/icon.png` | Enka `UI_AvatarIcon_{internal}.png` | Small square icon |
| `icon-big.png` | `{slug}/icon-big.png` | Enka `UI_AvatarIcon_{internal}.png` | Same as icon |
| `talent-1.png` | `{slug}/talent-1.png` | yatta/Enka by icon name from yatta API | Normal attack |
| `talent-skill.png` | `{slug}/talent-skill.png` | yatta/Enka | Elemental skill |
| `talent-burst.png` | `{slug}/talent-burst.png` | yatta/Enka | Elemental burst |
| `talent-passive-0/1/2.png` | `{slug}/talent-passive-*.png` | yatta/Enka | Passive talents |
| `constellation-1` to `constellation-6.png` | `{slug}/constellation-{n}.png` | Wiki `Constellation {UnlockName}.png` | ~20KB each |

**Wiki API**: `https://genshin-impact.fandom.com/api.php?action=query&titles=File:{FileName}&prop=imageinfo&iiprop=url%7Csize&format=json`

**Enka CDN base**: `https://enka.network/ui/`

**yatta.moe API**: `https://gi.yatta.moe/api/v2/en/avatar` (list) and `/avatar/{id}` (detail)

### Traveler variants (`aether-{el}` / `lumine-{el}`)

| Image | Source | Notes |
|-------|--------|-------|
| `card.png` | Wiki `Traveler_Male_Card.png` / `Traveler_Female_Card.png` | Same for all elements per gender |
| `portrait.png` | Wiki `Character_Aether_Game_{Element}.png` / `Character_Lumine_Game_{Element}.png` | 914×1645, element-specific |
| `constellation.png` | Same as portrait (element-specific game art) | No separate constellation BG exists |
| `gacha-splash.png` | Enka `UI_Gacha_AvatarImg_PlayerBoy/Girl.png` | Same for all elements per gender |
| `icon.png` / `icon-big.png` | Enka `UI_AvatarIcon_PlayerBoy/Girl.png` | Same for all elements |
| `talent-*.png` | yatta API `10000005-{element}` / `10000007-{element}` → Enka icon names | Element-specific |
| `constellation-1` to `-6.png` | Wiki `Constellation {UnlockName}.png` | Element-specific, sourced from JSON constellation names |

**Note on Cryo traveler**: `Character_Aether_Game_Cryo.png` is not on the wiki yet (newer element). Currently uses a promotional event image instead.

---

## Scripts

For a normal patch update, run `node scripts/sync.mjs` (also runs weekly via `.github/workflows/sync.yml`). It finds new characters, weapons, materials and enemies on yatta.moe and calls `populate-characters` + `add-character-costs`, `populate-weapons` + `add-weapon-costs`, `populate-materials` and `populate-enemies`. It does **not** handle traveler variants, so run `fix-traveler.mjs` by hand when a new traveler element ships. The per-script sections below are for that and for one-off fixes.


### `scripts/populate-characters.mjs`

Adds **new** characters (skips existing slugs). Skips traveler IDs (handled separately).

```bash
node scripts/populate-characters.mjs           # all new characters
node scripts/populate-characters.mjs nahida    # one character
```

- Fetches data from yatta.moe
- Card, portrait and constellation art: tries the wiki first (`{Name}_Card.png`, `{Name}_Portrait.png`, `{ConstellationName}.png`), falls back to Enka/yatta if the wiki doesn't have it yet
- Other images (icons, splash, talents, constellation icons) from Enka/yatta
- Uploads to R2
- Writes `data/characters/{slug}.json`

For brand-new characters the wiki art is often not uploaded yet, so they get the lower-quality Enka fallback. Re-check them after a few days with `check-image-urls.mjs`.

---

### `scripts/image-variants.mjs` — resized WebP copies

Makes small WebP copies of every image in the bucket so a frontend can show resized images without an image-optimization service (the site's `next/image` loader points at these instead of Vercel's `/_next/image`). It only reads and writes R2 — never `data/` — and does not change any API response: URLs in `data/` still point at the originals.

**Naming.** Each original gets one WebP per width in `VARIANT_WIDTHS` (`scripts/lib/variants.mjs`: 48, 96, 256, 640, 1080, 1920), stored next to it, quality 75:

```
nahida/icon.png  →  nahida/icon.w48.webp … nahida/icon.w1920.webp
```

Every original gets every width, never upscaled (a 256px icon's `w1920` is the 256px image as WebP), so a loader can build any variant URL from the original URL alone. **Changing `VARIANT_WIDTHS` means changing the frontend loader too.** Variants are uploaded with `Cache-Control: public, max-age=86400` (one day, about how long Cloudflare keeps the originals) — deliberately not `immutable`, because an original can be re-uploaded under the same key and its variants are then regenerated under the same keys. To show a replaced image sooner, bump the `?v=` on its URL in `data/` as usual: the loader carries the query string over to the variant URL (`card.w640.webp?v=2`).

**Where the frontend should load them from:** a custom domain on the bucket (R2 → Settings → Custom Domains, e.g. `img.deve.sh`), with the loader rewriting the `pub-….r2.dev` host from `data/` to it. Don't serve visitors from `r2.dev` directly: Cloudflare documents it as [non-production, rate-limited and uncached](https://developers.cloudflare.com/r2/buckets/public-buckets/). `data/` URLs can stay as they are.

```bash
node scripts/image-variants.mjs                           # dry run: what's missing, writes nothing
node scripts/image-variants.mjs --write --prefix nahida/  # one folder — check the result first
node scripts/image-variants.mjs --write                   # everything missing
```

Options: `--force` (regenerate up-to-date variants), `--concurrency <n>` (default 8).

- **Never writes to an original** — only `*.w{width}.webp` keys. Existing variants are left alone unless their original changed.
- **Name collisions are skipped:** two originals that would share variant keys (`x.png` and `x.webp`, or `x.png` and `x.PNG`) are never processed — the output lists them; rename one in the bucket.
- **Corrupt originals fail:** a truncated or undecodable image is reported as a failure, not uploaded as broken variants.
- **Re-runnable:** an original is skipped when all its widths exist and are not older than it. Re-uploading an original (e.g. `fix-traveler.mjs`) makes its variants stale, and the next run redoes them.
- **CI:** `.github/workflows/image-variants.yml` runs it with `--write` after every `Sync Genshin Data` run, and can be started by hand from the Actions tab (dry run unless "write" is ticked). It is not part of `sync.mjs` on purpose.
- Exits 1 if any image failed; the rest are still uploaded, and a re-run retries only what's missing.

---

### `scripts/fix-images.mjs` (obsolete)

Older notes mention a separate `fix-images.mjs` pass to swap Enka card/portrait/constellation art for wiki art. It was never committed, and `populate-characters.mjs` now does the wiki lookup itself. There is no script to re-upgrade a character that got the Enka fallback; that has to be done manually for now.

---

### `scripts/fix-traveler.mjs`

Fixes all images for `aether-*` and `lumine-*` traveler variants in one pass:
- `card` — wiki `Traveler_Male/Female_Card.png` (shared per gender)
- `portrait` + `constellation` — wiki `Character_Aether/Lumine_Game_{Element}.png` (element-specific)
- Talent icons — yatta element-specific IDs → Enka
- `constellation-1` through `-6` — wiki `Constellation {Name}.png` (upgraded quality)

```bash
node scripts/fix-traveler.mjs                 # all variants
node scripts/fix-traveler.mjs aether-cryo     # one variant
```

---

### `scripts/check-image-urls.mjs`

Diagnostic tool — checks what's available on Enka/yatta/R2 for a character.

```bash
node scripts/check-image-urls.mjs nahida
node scripts/check-image-urls.mjs nahida --old tighnari   # compare with an old char
```

---

## Adding New Characters (Full Process)

1. **Run the sync** (or `populate-characters.mjs` for characters only):
   ```bash
   node scripts/sync.mjs
   ```

2. **Check the art** for new characters. If the wiki didn't have card/portrait/constellation art yet, they got the Enka fallback:
   ```bash
   node scripts/check-image-urls.mjs <slug>
   ```

3. **If any new traveler element variants were added**, run:
   ```bash
   node scripts/fix-traveler.mjs
   ```

4. **Image variants** are generated by the `Image Variants` workflow after the sync. If you ran the scripts locally, run `node scripts/image-variants.mjs --write` (it only processes new or replaced images).

5. **Verify** a few characters by hitting the API or checking R2 URLs directly.

6. **CDN cache**: Cloudflare caches R2 images for ~24h. If images look stale, append `?v=2` to the URL to bypass cache. You cannot programmatically purge without a Cloudflare API token.

---

## Key Data Source Reference

| Source | URL | Used for |
|--------|-----|----------|
| yatta.moe list | `https://gi.yatta.moe/api/v2/en/avatar` | Character list, IDs, routes |
| yatta.moe detail | `https://gi.yatta.moe/api/v2/en/avatar/{id}` | Talent icons, constellation icons, stats |
| Enka CDN | `https://enka.network/ui/{filename}.png` | Game asset icons (icon, splash, talent) |
| Genshin wiki API | `https://genshin-impact.fandom.com/api.php` | Card, portrait, constellation background |
| R2 bucket | `genshin-images` | Stores all images served by the API |
| R2 public URL | `https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev` | Public image base URL |

---

## Script gotchas

- **`"type": "module"`** — all scripts use ES module syntax (`import`/`export`). Use `.mjs` extension for scripts.
- **Traveler IDs** `10000005` (boy) and `10000007` (girl) are skipped in `populate-characters.mjs`. Element variants use composite IDs like `10000005-cryo` on yatta.
- **Slug overrides** — some characters have shortened slugs (e.g., `kuki-shinobu` → `kuki`). See `SLUG_OVERRIDES` in the scripts.
- **Wiki CDN serves WebP** even for `.png` file requests. The `ContentType: 'image/png'` in R2 uploads is intentional (browsers handle it fine).
- **Block comments with `*/` in strings** will break JS block comments — use `//` comments in scripts.
- **Traveler Cryo game art** missing from wiki as of mid-2026 — uses promo event image instead. Check if `Character_Aether_Game_Cryo.png` has been added on future runs.
- **Existing characters are never re-populated** (populate skips existing slugs). Some older characters have hand-curated images, so don't delete a character JSON just to regenerate it.
