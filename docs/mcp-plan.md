# MCP server plan

Goal: make genshin-api a one-stop Genshin toolkit for AI assistants via the
[Model Context Protocol](https://modelcontextprotocol.io), built and tested locally
first, then exposed publicly over the internet.

## Architecture

Every feature lives in `features/<name>/` (see `CLAUDE.md`). Logic is written once in
`service.js`; `rest.js` and `mcp.js` are thin adapters over it.

```
mcp/
  registry.js   explicit list of every features/*/mcp.js tool set
  server.js     builds the McpServer from the registry (@modelcontextprotocol/sdk)
  stdio.js      local entry: `node mcp/stdio.js`
  http.js       Streamable HTTP handler mounted at /mcp in app.js
```

Each `features/<name>/mcp.js` exports its tools with an `access: 'public' | 'auth'` flag,
so adding login later doesn't require restructuring.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Feature-folder refactor, service layer, name resolver, tests + CI, CLAUDE.md | ✅ #15 |
| 1 | MCP over stdio: core lookup tools; tested with MCP Inspector, Claude Code, Claude Desktop | ✅ #16, #17 |
| 2 | Public `/mcp` (Streamable HTTP, stateless) on Railway; MCP-specific rate limit; usage logging | ✅ this PR |
| 3 | Material planner (`plan_materials`) from `ascension_costs` / `talent_costs` + material sources | next |
| 4 | Teams & DPS: ingest public community calc DBs (check licenses/attribution); likely Postgres | |
| 5 | Accounts + wish history (desktop sync app); OAuth 2.1 on `/mcp`; personal tools | |

### Phase 1 tools (shipped)

| Tool | Notes |
|---|---|
| `search(query, types?, limit?)` | cross-entity name search; per-type limit (default 10) with `totals` |
| `list_characters(element?, weapon?, nation?, rarity?, sort?, order?, limit?, offset?)` | brief entries, paged |
| `get_character(name, sections?)` | `overview` default; `talents`, `constellations`, `ascension_costs`, `talent_costs`, `images` |
| `list_weapons` / `get_weapon(name, sections?)` | sections: `overview`, `refinements`, `ascension_costs`, `images` |
| `list_artifacts` / `get_artifact(name, images?)` | list includes set bonuses |
| `list_materials` / `get_material(name)` | drop sources, `used_by`, `source` |
| `list_enemies` / `get_enemy(name)` | drops |
| `get_game_info()` | valid filter values, counts, last sync, disclaimer |

All read-only. Names resolved via `resolve*()`; misses return `isError` with suggestions.
Largest default response is ~5.6k tokens (`list_artifacts` with bonuses); most are < 1k.

### Testing (every phase)

1. Service unit tests (`service.test.js`).
2. MCP integration tests using the SDK client over an in-memory transport.
3. MCP Inspector for manual checks.
4. Real hosts: does the model pick the right tool from its description alone?

### Phase 2 notes

- Stateless: a fresh server + transport per POST; GET/DELETE return 405 (no SSE stream, no sessions).
- JSON responses (`enableJsonResponse`), `Cache-Control: no-store`, 64 KB body limit.
- No auth and no Origin/Host allowlist: the data is public and read-only, and there are no
  credentials or user state a malicious page could abuse. Revisit both in Phase 5.
- Usage log line per tool call: `{"event":"mcp_tool_call","tool","ok","ms","error"?}` — no arguments, no IPs.

## Known data gaps to resolve before Phase 3

- Domain/weekday schedules for talent & weapon materials.
- Boss sources for ascension/talent boss materials (check `dropped_by` coverage).
- Character aliases/nicknames (e.g. "Childe" → `tartaglia`) for the name resolver.
