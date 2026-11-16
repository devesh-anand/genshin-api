# genshin-api

Unofficial Genshin Impact data API (Express, Node ≥ 22, ES modules, plain JS).
Public REST API plus an MCP server: hosted at `/mcp` (Streamable HTTP) and local over stdio.
Planned: material planner, team/DPS data, wish history with accounts — see `docs/mcp-plan.md`.

## Commands

```bash
npm install
npm run dev        # nodemon, http://localhost:5000 (PORT in .env)
npm start          # production start
npm test           # node:test — must pass before every commit
node --test features/characters/service.test.js   # a single file
node scripts/sync.mjs [characters|weapons|materials|enemies]   # pull new game data (network)
npm run mcp        # MCP server on stdio (what hosts spawn)
npm run mcp:inspect   # MCP Inspector UI against the stdio server
```

## Layout

```
app.js              createApp() + ROUTES — the explicit REST route registry; mounts /mcp first
index.js            loads .env, listens. Nothing else.
lib/                shared, feature-agnostic helpers
  dataStore.js        in-memory JSON store (getAll/getOne/query/getDistinct)
  paths.js            ROOT_DIR / DATA_DIR / dataDir() — never use process.cwd()
  nameResolver.js     loose name → slug ("hutao" → "hu-tao"), corrects clear typos, else suggests
  errors.js           AppError, ValidationError(400), UnauthorizedError(401), NotFoundError(404, .suggestions)
  http.js             handle(), sendList(), sendOr404() for rest.js files
  objects.js          omitKeys(), pick() — trim records for model-facing output
  paginate.js         offset pagination for list tools
  sort.js
features/<name>/    one folder per feature — everything about it lives here
  store.js            data access only (JSON today; a DB later for user data)
  service.js          ALL logic. Plain async functions. No req/res, no express, no MCP types.
  rest.js             Express router: parse req → call service → send. No logic.
  mcp.js              tools() → MCP tool definitions wrapping the service. No logic.
  service.test.js     required for every feature
mcp/                MCP server (transport-agnostic core + entry points)
  registry.js         TOOLSETS — explicit list of every features/*/mcp.js
  server.js           createMcpServer(): registers tools, maps errors, hides 'auth' tools without a user
  schema.js           zod helpers: enumOf() (data-derived enums), rarityOf(), sectionsOf(), pageArgs
  stdio.js            local entry point
  http.js             /mcp router: stateless Streamable HTTP, JSON responses, own rate limit + body limit,
                      JSON-RPC errors, one log line per tool call (never arguments)
  server.test.js      MCP client tests: catalogue rules, calls, errors, registry, stdio smoke test
  http.test.js        MCP client over HTTP + transport behaviour (405/413/429, CORS, logging)
middlewares/        cross-cutting Express middleware (rate limit, cache headers, errors)
data/               game data JSON, written by scripts/ — don't hand-edit in feature PRs
scripts/            data sync/populate scripts (run by .github/workflows/sync.yml weekly)
app.test.js         HTTP integration tests + codebase convention checks
```

## Rules (enforced by `app.test.js` where possible)

1. **Logic goes in `service.js`.** `rest.js` (and later `mcp.js`) are thin adapters.
   If you're writing an `if` about data in a router, move it to the service.
2. **Cross-feature imports go through `service.js` only** — never another feature's `store.js` or `rest.js`.
3. **Services throw `lib/errors.js` errors** for expected failures (bad input, not found, auth).
   The REST error middleware maps them to HTTP statuses; MCP will map them to `isError` results.
   Unexpected errors become a generic 500 — never leak internals.
4. **Every `features/*/rest.js` is listed in `ROUTES` in `app.js`.** Explicit registry, no auto-discovery.
5. **Every feature has `service.test.js`.** Tests against real `data/` must assert invariants
   (filters hold, shapes stable), never exact counts — the weekly sync changes counts.
6. **The public REST API is a contract.** Don't change existing URLs, query params, or response
   shapes. Add new fields/endpoints instead. Exact-slug lookup on `/:name` routes stays exact.
7. **Paths come from `lib/paths.js`.** The process may be launched from any directory.
8. Secrets only via env vars (see `.env.example`). Never commit `.env`.

## Content rules (legal)

This is an unofficial fan project. All game data and art belong to HoYoverse / COGNOSPHERE.
Use is tolerated, not licensed, so:

- **Never add unreleased, beta, or leaked content.** Only sync what is live in the current game
  version. If yatta.moe or any source lists something not yet released, skip it. This is the main
  thing HoYoverse enforces against.
- **Keep the "unofficial / not affiliated with HoYoverse" disclaimer and source attribution**
  (yatta.moe, Enka.Network, Fandom Wiki) in `README.md` and in the frontend footer
  (`genshin/src/app/layout.tsx`, separate repo). Don't remove or weaken them.
- **Never claim ownership of game content** (no "All rights reserved" over data or images), never
  use HoYoverse logos, never imply official endorsement.
- **Be a polite consumer of sources:** cache results, keep request rates low, send a descriptive
  User-Agent to Enka and yatta, follow Enka's API rules.
- **No paid access to HoYoverse data or art** without checking the legal risk with the user first.
- **Never handle player credentials server-side** (wish-history authkeys, HoYoLAB cookies), and never
  build anything that reads game memory, sniffs game traffic, or automates game input.

## Data pipeline

`scripts/` pulls game data from yatta.moe / Enka / the Fandom wiki, uploads images to the R2
bucket `genshin-images` (public base `https://pub-1ad979b6618d4a07ab871591a84b954c.r2.dev`), and
writes `data/`. **Read [`docs/data-pipeline.md`](docs/data-pipeline.md) before running or changing
any script** — it has the character JSON format, the source for every image field, per-script usage,
and the full add-new-characters process.

- `node scripts/sync.mjs` handles a normal patch. It does not handle traveler variants — run
  `node scripts/fix-traveler.mjs` when a new traveler element ships.
- Scripts are `.mjs` ES modules and need R2 credentials (`R2_ID`, `AWS_ID`, `AWS_KEY`) in `.env`.
  The API server itself needs none of them.
- Cloudflare caches R2 images ~24h; append `?v=2` to check a freshly replaced image.

## Adding a feature (checklist)

1. `features/<name>/service.js` — functions + JSDoc for inputs/outputs. Copy the shape of `features/weapons/`.
2. `features/<name>/store.js` if it owns data.
3. `features/<name>/service.test.js`.
4. `features/<name>/rest.js` if it has HTTP endpoints → add to `ROUTES` in `app.js` → add a case to `app.test.js`.
5. `features/<name>/mcp.js` if it should be MCP tools → add to `TOOLSETS` in `mcp/registry.js` →
   add call cases to `mcp/server.test.js` (and the name to the "stable names" list).
6. Document new endpoints in `README.md`.
7. `npm test`.

## MCP tools

A tool definition (from `tools()` in `features/<name>/mcp.js`):
`{ name, title, description, inputSchema: { zod shape }, handler(args, { user }) → value, access?: 'public'|'auth' }`.
The server JSON-encodes the return value and turns `lib/errors.js` errors into `isError` results.
Tools are read-only by default (annotations); override with `annotations` only for tools that write.

- Tool names are a public contract: never rename/remove; add optional params instead.
- Descriptions are written for a model: say when to use it, what it returns, and valid values.
- Input enums (elements, weapon types…) are derived from data, not hard-coded.
- Return concise results by default; full records only when a `sections`/detail param asks.
- Resolve names with the service's `find*()`; on no match return `isError` + suggestions.
- Keep the total tool count ≲ 30 — extend existing tools before adding near-duplicates.
- Paginate lists (`pageArgs` + `paginate()`); keep any single response well under ~6k tokens.
- Personal-data tools (Phase 5) take the user from the auth context, never from an argument.
- **Never write to stdout** in code the MCP server runs — stdout is the stdio protocol channel.
  Use `console.error` for diagnostics.

## Gotchas

- Name matching (`lib/nameResolver.js`, the single entry point — a model-based resolver can be
  added there later as a fallback): exact slug → name/curated alias → spacing → leading word →
  whole word → generated initials ("hod" → Harbinger of Dawn, exact only) → one clear typo →
  suggestions. Several hits in a tier = suggestions, never a guess. Each entity type matches only
  against its own entries, so the same letters can mean different things per type.
- Nicknames live in `features/{characters,weapons,artifacts}/aliases.js` (hand-curated, not synced):
  slug → names players use ("tartaglia": ["Childe"]). Curated aliases beat generated initials (artifact
  "HoD" → Heart of Depth, not Husk of Opulent Dreams). REST `/:name` stays exact.
  `lib/aliases.test.js` fails on a missing slug or an alias that shadows another entry's name.
- Found a name that resolves wrongly? Add a row to `lib/nameResolver.cases.test.js` first, then fix
  (curated alias, or resolver rule). Unresolved names show up in the `/mcp` usage log as
  `unresolved: { entity, query }` — the only argument ever logged (cleaned, ≤ 64 chars).
- Slugs don't always match display names (`raiden` is "Raiden Shogun", `kuki-shinobu` is `kuki`
  via `SLUG_OVERRIDES` in the scripts; travelers exist only as `aether-<element>` and
  `lumine-<element>`). Use `find*()` for user/model input.
- There is no image upload endpoint: images are uploaded to R2 by the sync/populate scripts only.
- The REST rate limiter (100 req/min/IP) is skipped in tests via `createApp({ rateLimit: false })`.
  `/mcp` has its own limiter (300/min/IP) — pass `createApp({ mcp: { rateLimit: false } })` to skip it.
- Production path: client → Cloudflare (`genshin-api.deve.sh`, proxied) → Railway edge → app.
  Rate limits key on `lib/clientIp.js`: `trust proxy` (1 hop; `TRUST_PROXY` overrides) gives the hop
  Railway saw, and `CF-Connecting-IP` is used only when that hop is a Cloudflare IP (else it's
  spoofable via the Railway domain). Get this wrong and users share rate-limit buckets.
- `/mcp` is mounted before the REST body parser and limiter on purpose — keep it there.
