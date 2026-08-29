# Unofficial Genshin Impact API

Open-source REST API for Genshin Impact character data, including stats, talents, constellations, and images.

**Base URL:** `https://genshin-impact.up.railway.app`

For contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).

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

**Examples:**
```
GET /characters
GET /characters?element=pyro
GET /characters?element=hydro&weapon=catalyst
GET /characters?nation=fontaine&rarity=5
GET /characters?element=dendro&details=true
```

**Default response** (slugs only):
```json
{
  "characters": ["albedo", "alhaitham", "amber", "..."]
}
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

---

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

### `GET /characters/element/:element` *(legacy)*

Returns slugs filtered by element. Prefer `GET /characters?element=` instead.

```
GET /characters/element/pyro
```

---

### `GET /characters/weapon/:weapon` *(legacy)*

Returns slugs filtered by weapon type. Prefer `GET /characters?weapon=` instead.

```
GET /characters/weapon/catalyst
```

---

### `GET /characters/imglist` *(legacy)*

Returns summary objects (key, name, element, img) for all characters. Prefer `GET /characters?details=true` instead.

### `GET /characters/imglist/:element` *(legacy)*

Same as above, filtered by element.

---

## Weapons

Work in progress.

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
