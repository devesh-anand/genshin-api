# Unofficial Genshin Impact API

Open-source REST API for Genshin Impact character, weapon, and artifact data — including stats, talents, constellations, and images.

**Base URL:** `https://genshin-impact.up.railway.app`

For contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Caching

All `GET` endpoints set `Cache-Control: public, max-age=3600` (1 hour) by default. Clients and CDNs may cache responses for up to an hour. The `/health` endpoint is always fresh (`no-store`). The `/search` endpoint caches for 5 minutes.

---

## Rate Limiting

100 requests per minute per IP. Exceeding the limit returns `429` with:
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
GET /characters/raiden-shogun
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
  "skillTalents": [...],
  "passiveTalents": [...],
  "constellations": [...],
  "vision_key": "DENDRO",
  "weapon_type": "CATALYST",
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

## Search

### `GET /search?q=`

Searches across characters, weapons, and artifacts by name. Requires at least 2 characters.

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

Returns server status, uptime, and total counts for each resource.

```json
{
  "status": "ok",
  "uptime": 3421,
  "counts": {
    "characters": 102,
    "weapons": 270,
    "artifacts": 63
  }
}
```

---

## Local Development

```bash
git clone https://github.com/devesh-anand/genshin-api.git
cd genshin-api
npm install
```

Create a `.env` file:
```
PORT=5000
```

```bash
nodemon        # start dev server at http://localhost:5000
npm test       # run tests
```
