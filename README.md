# Unofficial Genshin Impact API

Open-source REST API for Genshin Impact character, weapon, and artifact data — including stats, talents, constellations, and images.

**Base URL:** `https://genshin-api.deve.sh`

For contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

> **Disclaimer:** This is an unofficial fan project and is not affiliated with or endorsed by HoYoverse. Genshin Impact, its characters, artwork, and game content are trademarks and copyrights of HoYoverse / COGNOSPHERE. Data courtesy of [yatta.moe](https://gi.yatta.moe), [Enka.Network](https://enka.network), and the [Genshin Impact Fandom Wiki](https://genshin-impact.fandom.com). If you are a rights holder and want content removed, please [open an issue](https://github.com/devesh-anand/genshin-api/issues).

---

## Caching

All `GET` endpoints set `Cache-Control: public, max-age=3600` (1 hour) by default. Clients and CDNs may cache responses for up to an hour. The `/health` endpoint is always fresh (`no-store`). The `/search` endpoint caches for 5 minutes. `/showcase/:uid` caches until Enka.Network would refresh that player (about a minute); its errors are never cached.

---

## Rate Limiting

100 requests per minute per IP (`/showcase` also has its own limit of 10 per minute). Exceeding the limit returns `429` with:
```json
{ "error": "Too many requests. Please try again in a minute." }
```

---

## Characters

All endpoints accept both `/character` and `/characters`.

### `GET /characters`

Returns a list of all character slugs.

**Query parameters** (all optional, combinable):

| Parameter | Description | Example |
|-----------|-------------|---------|
| `element` | Filter by element | `pyro`, `hydro`, `dendro`, … |
| `weapon` | Filter by weapon type | `sword`, `claymore`, `catalyst`, `bow`, `polearm` |
| `nation` | Filter by nation | `mondstadt`, `liyue`, `inazuma`, `sumeru`, `fontaine`, `natlan`, `snezhnaya`, `nodkrai` |
| `rarity` | Filter by rarity | `4` or `5` |
| `details` | Return summary objects instead of slugs | `true` |
| `sort` | Sort results | `name`, `rarity`, `element`, `nation`, `weapon` |
| `order` | Sort direction (default `asc`) | `asc`, `desc` |

**Examples:**
```
GET /characters
GET /characters?element=pyro
GET /characters?element=hydro&weapon=catalyst
GET /characters?nation=fontaine&rarity=5
GET /characters?element=dendro&details=true
GET /characters?sort=rarity&order=desc
GET /characters?element=pyro&sort=name
```

**Default response** (slugs only):
```json
{ "characters": ["albedo", "alhaitham", "amber", "..."] }
```

**With `?details=true`:**
```json
{
  "characters": [
    {
      "key": "nahida",
      "name": "Nahida",
      "title": "Little Witch of El Elysium",
      "vision": "Dendro",
      "weapon": "Catalyst",
      "nation": "Sumeru",
      "rarity": 5,
      "img": { "card": "...", "icon": "...", "portrait": "...", "..." }
    }
  ]
}
```

---

### `GET /characters/elements`

Returns all elements present in the roster.

```json
{ "elements": ["Anemo", "Cryo", "Dendro", "Electro", "Geo", "Hydro", "Pyro"] }
```

### `GET /characters/nations`

Returns all nations present in the roster.

```json
{
  "nations": ["Fontaine", "Inazuma", "Liyue", "Mondstadt", "Natlan", "Nodkrai", "Outlander", "Snezhnaya", "Sumeru", "Unknown"]
}
```

---

### `GET /characters/:name`

Returns full details for a single character. `:name` is the character's slug (lowercase, hyphenated).

```
GET /characters/nahida
GET /characters/raiden
GET /characters/aether-pyro
```

**Response:**
```json
{
  "name": "Nahida",
  "title": "Little Witch of El Elysium",
  "vision": "Dendro",
  "weapon": "Catalyst",
  "nation": "Sumeru",
  "affiliation": "The Sanctuary of Surasthana",
  "rarity": 5,
  "constellation": "Sapientia Oromasdis",
  "birthday": "0000-10-27",
  "description": "...",
  "skillTalents": [
    { "name": "Akara", "unlock": "Normal Attack", "type": "NORMAL_ATTACK", "id": 10731, ... },
    { "name": "All Schemes to Know", "unlock": "Elemental Skill", "type": "ELEMENTAL_SKILL", "id": 10732, ... },
    { "name": "Illusory Heart", "unlock": "Elemental Burst", "type": "ELEMENTAL_BURST", "id": 10735, ... }
  ],
  "passiveTalents": [...],
  "constellations": [...],
  "vision_key": "DENDRO",
  "weapon_type": "CATALYST",
  "id": 10000073,
  "img": {
    "card": "https://...",
    "constellation": "https://...",
    "banner": "https://...",
    "icon": "https://...",
    "icon-big": "https://...",
    "portrait": "https://..."
  }
}
```

Returns `404` if the character is not found.

`id` is the game's avatar ID, and each levelable talent in `skillTalents` has its game skill `id`, so
player data that only has IDs (like [showcases](#showcase)) can be matched. Travelers share an `id` per
gender; their talent IDs tell the elements apart.

---

### Legacy endpoints

| Endpoint | Prefer instead |
|----------|---------------|
| `GET /characters/element/:element` | `GET /characters?element=` |
| `GET /characters/weapon/:weapon` | `GET /characters?weapon=` |
| `GET /characters/imglist` | `GET /characters?details=true` |
| `GET /characters/imglist/:element` | `GET /characters?element=&details=true` |

---

## Weapons

All endpoints accept both `/weapon` and `/weapons`.

### `GET /weapons`

Returns a list of all weapon slugs.

**Query parameters** (all optional, combinable):

| Parameter | Description | Example |
|-----------|-------------|---------|
| `type` | Filter by weapon type | `sword`, `claymore`, `polearm`, `catalyst`, `bow` |
| `rarity` | Filter by rarity | `1`–`5` |
| `details` | Return summary objects instead of slugs | `true` |
| `sort` | Sort results | `name`, `rarity`, `type` |
| `order` | Sort direction (default `asc`) | `asc`, `desc` |

**Examples:**
```
GET /weapons
GET /weapons?type=catalyst&rarity=5
GET /weapons?rarity=4&details=true
GET /weapons?sort=rarity&order=desc
GET /weapons?type=sword&sort=name
```

**With `?details=true`:**
```json
{
  "weapons": [
    {
      "key": "staff-of-homa",
      "name": "Staff of Homa",
      "rarity": 5,
      "type": "Polearm",
      "sub_stat": "CRIT DMG",
      "passive_name": "Reckless Cinnabar",
      "img": { "icon": "...", "icon-awaken": "...", "wish": "...", "full": "..." }
    }
  ]
}
```

---

### `GET /weapons/types`

Returns all weapon types.

```json
{ "types": ["Bow", "Catalyst", "Claymore", "Polearm", "Sword"] }
```

---

### `GET /weapons/:name`

Returns full details for a single weapon. `:name` is the weapon's slug.

```
GET /weapons/staff-of-homa
GET /weapons/primordial-jade-cutter
```

**Response:**
```json
{
  "id": 13501,
  "name": "Staff of Homa",
  "description": "...",
  "rarity": 5,
  "type": "Polearm",
  "type_key": "WEAPON_POLE",
  "sub_stat": "CRIT DMG",
  "sub_stat_key": "FIGHT_PROP_CRITICAL_HURT",
  "base_atk": 45.9,
  "passive_name": "Reckless Cinnabar",
  "passive_desc": "HP increased by 20%...",
  "passive_upgrades": ["R1 text", "R2 text", "R3 text", "R4 text", "R5 text"],
  "img": {
    "icon": "https://...",
    "icon-awaken": "https://...",
    "wish": "https://...",
    "full": "https://..."
  }
}
```

> **Image notes:** `icon` is the 256×256 inventory icon. `icon-awaken` is the refined/ascended variant. `wish` is a transparent-background cutout (512×1024). `full` is the high-res 3D render (~600×900). Not all weapons have `wish` and `full` (unreleased weapons may only have `icon`).

Returns `404` if the weapon is not found.

---

## Artifacts

All endpoints accept both `/artifact` and `/artifacts`.

### `GET /artifacts`

Returns a list of all artifact set slugs.

**Query parameters** (all optional):

| Parameter | Description | Example |
|-----------|-------------|---------|
| `rarity` | Filter by max rarity | `4` or `5` |
| `details` | Return summary objects instead of slugs | `true` |
| `sort` | Sort results | `name`, `rarity` |
| `order` | Sort direction (default `asc`) | `asc`, `desc` |

**Examples:**
```
GET /artifacts
GET /artifacts?rarity=5
GET /artifacts?details=true
GET /artifacts?sort=name
GET /artifacts?rarity=5&sort=rarity&order=desc
```

**With `?details=true`:**
```json
{
  "artifacts": [
    {
      "key": "emblem-of-severed-fate",
      "name": "Emblem of Severed Fate",
      "rarity": 5,
      "bonus": {
        "2pc": "Energy Recharge +20%.",
        "4pc": "Increases Elemental Burst DMG by 25% of Energy Recharge..."
      },
      "img": "https://..."
    }
  ]
}
```

---

### `GET /artifacts/:name`

Returns full details for a single artifact set. `:name` is the set's slug.

```
GET /artifacts/emblem-of-severed-fate
GET /artifacts/pale-flame
```

**Response:**
```json
{
  "id": 15021,
  "name": "Emblem of Severed Fate",
  "rarity": 5,
  "bonus": {
    "2pc": "Energy Recharge +20%.",
    "4pc": "Increases Elemental Burst DMG by 25% of Energy Recharge..."
  },
  "pieces": {
    "flower":  { "name": "...", "description": "...", "img": "https://..." },
    "plume":   { "name": "...", "description": "...", "img": "https://..." },
    "sands":   { "name": "...", "description": "...", "img": "https://..." },
    "goblet":  { "name": "...", "description": "...", "img": "https://..." },
    "circlet": { "name": "...", "description": "...", "img": "https://..." }
  }
}
```

Returns `404` if the artifact set is not found.

---

## Planner

Material planner: what one or more characters/weapons need to reach target levels and talents,
optionally after what you already own (lower tiers are crafted up automatically).

### `POST /planner/plan`

```json
{
  "targets": [
    { "type": "character", "name": "Nahida",
      "level": { "from": 1, "to": 90 },
      "talents": { "normal_attack": { "from": 1, "to": 9 },
                   "elemental_skill": { "from": 1, "to": 9 },
                   "elemental_burst": { "from": 1, "to": 9 } } },
    { "type": "weapon", "name": "A Thousand Floating Dreams", "level": { "from": 1, "to": 90 } }
  ],
  "inventory": { "Kalpalata Lotus": 100, "Teachings of Ingenuity": 30 }
}
```

- `level`, `talents` and `inventory` are optional (give at least one of `level`/`talents` per target). Up to 20 targets.
- Names are matched loosely (typos are fine). Weapons have no `talents`.
- Cap levels (20, 40 … 80) are ambiguous: add `"from_ascended": true` if you've already ascended at your
  current level, or `"to_ascended": true` to include the ascension at the target level.

**Response** (for the request above, trimmed to one material):
```json
{
  "targets": [
    { "type": "character", "key": "nahida", "name": "Nahida", "level": { "from": 1, "to": 90, "ascensions": 6, "phase": { "from": 0, "to": 6 } },
      "talents": { "normal_attack": { "from": 1, "to": 9 }, "elemental_skill": { "from": 1, "to": 9 }, "elemental_burst": { "from": 1, "to": 9 } },
      "mora": 4950100 },
    { "type": "weapon", "key": "a-thousand-floating-dreams", "name": "A Thousand Floating Dreams", "rarity": 5,
      "level": { "from": 1, "to": 90, "ascensions": 6, "phase": { "from": 0, "to": 6 } }, "mora": 1131480 }
  ],
  "materials": [
    { "key": "kalpalata-lotus", "name": "Kalpalata Lotus", "category": "local-specialty", "rarity": 1, "quantity": 168,
      "source": { "type": "local-specialty", "region": "Sumeru" }, "owned": 100, "missing": 68 }
  ],
  "mora": { "leveling": 2579080, "ascension": 645000, "talents": 2857500, "crafting": 3850, "total": 6085430 },
  "exp": { "character": 8362650, "weapon": 9064450 },
  "crafting": [{ "key": "guide-to-ingenuity", "quantity": 7, "from": "teachings-of-ingenuity", "from_quantity": 21, "mora": 3850 }],
  "missing_count": 2024
}
```
Material lines also carry `family`/`tier` for craftable materials and `dropped_by` where known.
`owned` / `crafted` / `missing`, `crafting` and `missing_count` appear only when an `inventory` is sent.

### `POST /planner/farming`

Same body as `/planner/plan`, plus optional `"day": "monday"` … `"sunday"`. Returns what's still needed
grouped by where to farm it: `domains` (with open days), `domains_by_day`, `bosses`, `local_specialties`
(by region), `enemies` (common drops), `other`, and `mora_needed`.

Errors: `400` invalid input, `404` unknown character/weapon name (with suggestions in the message).

---

## Showcase

### `GET /showcase/:uid`

A player's in-game **Character Showcase**, looked up through [Enka.Network](https://enka.network). Only the
characters the player put on their showcase with **Show Character Details** turned on are visible.
Everything is matched to this API's own records: `key` fields work with `/characters/:name`,
`/weapons/:name` and `/artifacts/:name`.

```
GET /showcase/800000000
```

**Response** (one character shown, lists trimmed):
```json
{
  "player": {
    "uid": "800000000", "nickname": "…", "adventure_rank": 59, "world_level": 9, "signature": "…",
    "achievements": 821, "abyss": "12-3", "abyss_stars": 36, "theater": { "act": 8, "stars": 6 },
    "profile_picture": { "key": "raiden", "name": "Raiden Shogun", "img": "https://…" }, "namecard_id": 210092
  },
  "characters": [
    {
      "key": "venti", "id": 10000022, "name": "Venti", "element": "Anemo", "rarity": 5, "weapon_type": "BOW",
      "level": 90, "ascension": 6, "ascended": false, "max_level": 90, "constellation": 0, "friendship": 10,
      "talents": {
        "normal_attack": { "name": "Divine Marksmanship", "level": 8, "bonus": 0 },
        "elemental_skill": { "name": "Skyward Sonnet", "level": 6, "bonus": 0 },
        "elemental_burst": { "name": "Wind's Grand Ode", "level": 9, "bonus": 0 }
      },
      "weapon": {
        "key": "aqua-simulacra", "id": 15508, "name": "Aqua Simulacra", "type": "Bow", "rarity": 5,
        "level": 90, "ascension": 6, "ascended": false, "max_level": 90, "refinement": 1, "base_atk": 542,
        "sub_stat": { "key": "crit_dmg", "name": "CRIT DMG", "value": 88.2, "percent": true }, "img": "https://…"
      },
      "artifacts": [
        {
          "slot": "plume", "set": { "key": "viridescent-venerer", "id": 15002, "name": "Viridescent Venerer" },
          "name": "Viridescent Arrow Feather", "rarity": 5, "level": 20,
          "main_stat": { "key": "atk", "name": "ATK", "value": 311, "percent": false },
          "substats": [{ "key": "crit_rate", "name": "CRIT Rate", "value": 13.2, "percent": true }],
          "crit_value": 32.6, "img": "https://…"
        }
      ],
      "set_bonuses": [{ "key": "viridescent-venerer", "name": "Viridescent Venerer", "pieces": 3, "bonus": 2 }],
      "crit_value": 76.8,
      "stats": [{ "key": "hp", "name": "HP", "value": 14038, "percent": false }],
      "img": { "icon": "https://…", "card": "https://…", "portrait": "https://…" }
    }
  ],
  "details_hidden": false,
  "listed": [{ "key": "venti", "id": 10000022, "name": "Venti", "level": 90 }],
  "fetched_at": "2026-11-21T08:26:17.776Z",
  "cached_until": "2026-11-21T08:27:17.776Z",
  "source": "Enka.Network"
}
```

- Percent stats (`percent: true`) are already percentages: `13.2` means 13.2%.
- `talents.*.level` is the level the player raised it to; `bonus` is what constellations add on top.
- `ascended: true` means the level is a cap (20/40/…/80) and was already ascended past, the same
  meaning as `from_ascended` in the [planner](#planner).
- `artifacts[].level` is the in-game +0…+20. `crit_value` is 2 × CRIT Rate + CRIT DMG from substats.
- `set_bonuses[].bonus` is the highest set bonus reached (2 or 4 pieces).
- `details_hidden: true` with empty `characters` means the showcase is empty or details are turned off;
  `listed` still shows which characters are on it.
- A `key` is `null` when something is newer than this API's data.

Errors: `400` not a 9–10 digit UID, `404` no player with that UID, `503` (with `Retry-After`) when
Enka.Network is down, busy or updating after a game patch.

Nothing is stored: each UID is kept in a size-limited memory cache until Enka would refresh it, then dropped.

---

## Search

### `GET /search?q=`

Searches characters, weapons, artifacts, materials and enemies by name (characters, weapons and artifacts also by community nickname, e.g. `childe`, `pjws`, `eosf`). Requires at least 2 characters.

```
GET /search?q=nahida
GET /search?q=jade
GET /search?q=emblem
```

**Response:**
```json
{
  "query": "jade",
  "results": {
    "characters": [
      { "key": "yae-miko", "name": "Yae Miko", "vision": "Electro", "weapon": "Catalyst", "rarity": 5, "img": "https://..." }
    ],
    "weapons": [
      { "key": "primordial-jade-cutter", "name": "Primordial Jade Cutter", "type": "Sword", "rarity": 5, "img": "https://..." },
      { "key": "primordial-jade-winged-spear", "name": "Primordial Jade Winged-Spear", "type": "Polearm", "rarity": 5, "img": "https://..." }
    ],
    "artifacts": [
      { "key": "jade-vista", "name": "Jade Vista", "rarity": 4, "img": "https://..." }
    ]
  }
}
```

Returns `400` if query is shorter than 2 characters.

---

## Health

### `GET /health`

Returns server status, uptime, total counts for each resource, and the showcase cache's size and hit counts.

```json
{
  "status": "ok",
  "uptime": 3421,
  "counts": {
    "characters": 102,
    "weapons": 270,
    "artifacts": 63
  },
  "showcase_cache": {
    "entries": 2, "max_entries": 2000, "bytes": 55283, "max_bytes": 33554432,
    "hits": 1, "misses": 2, "in_flight": 0, "queued": 0
  }
}
```

---

## MCP server (for AI assistants)

genshin-api is also a [Model Context Protocol](https://modelcontextprotocol.io) server, so AI assistants
like Claude can look up characters, weapons, artifacts, materials and enemies directly.

**Hosted endpoint:** `https://genshin-api.deve.sh/mcp` (Streamable HTTP, no sign-in needed)

**Tools:**
- Lookup: `search`, `list_characters`, `get_character`, `list_weapons`, `get_weapon`, `list_artifacts`,
  `get_artifact`, `list_materials`, `get_material`, `list_enemies`, `get_enemy`, `get_game_info`
- Planner: `plan_materials` (everything a build needs, optionally after your inventory) and
  `get_farming_schedule` (what to farm where, by weekday) — same engine as [`/planner`](#planner)
- Showcase: `get_showcase` (a player's showcased builds by UID, with ready-made planner targets) — same data as [`/showcase`](#showcase)

**claude.ai / Claude apps:** Settings → Connectors → *Add custom connector* → paste the endpoint URL.

Names are matched loosely: typos, community nicknames ("Childe", "Ei", "Scara", "Fav Sword") and
initials ("PJWS", "EoSF", "VV"). Each tool matches within its own category, so "HoD" is Harbinger
of Dawn for `get_weapon` and Heart of Depth for `get_artifact`; `search` shows both.

**Claude Code:**
```bash
claude mcp add --transport http genshin https://genshin-api.deve.sh/mcp
```

**Other clients:** any MCP client that supports Streamable HTTP can use the URL above.

**Run it locally instead (stdio):**
```bash
claude mcp add genshin -- node /absolute/path/to/genshin-api/mcp/stdio.js
```
or in Claude Desktop's `claude_desktop_config.json`:
```json
{ "mcpServers": { "genshin": { "command": "node", "args": ["/absolute/path/to/genshin-api/mcp/stdio.js"] } } }
```

**Limits:** 300 MCP requests per minute per IP (`429` with a JSON-RPC error beyond that).
`npm run mcp:inspect` opens the MCP Inspector against a local copy.

---

## Local Development

```bash
git clone https://github.com/devesh-anand/genshin-api.git
cd genshin-api
npm install
cp .env.example .env   # PORT=5000 by default
npm run dev            # dev server at http://localhost:5000
npm test               # run tests
```

Code layout and conventions (one folder per feature under `features/`) are documented in [CLAUDE.md](./CLAUDE.md). The MCP server roadmap is in [docs/mcp-plan.md](./docs/mcp-plan.md).
