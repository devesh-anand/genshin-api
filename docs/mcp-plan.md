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
| 0 | Feature-folder refactor, service layer, name resolver, tests + CI, CLAUDE.md | ✅ this PR |
| 1 | MCP over stdio: core lookup tools; tested with MCP Inspector, Claude Code, Claude Desktop | next |
| 2 | Public `/mcp` (Streamable HTTP, stateless) on Railway; MCP-specific rate limit; usage logging | |
| 3 | Material planner (`plan_materials`) from `ascension_costs` / `talent_costs` + material sources | |
| 4 | Teams & DPS: ingest public community calc DBs (check licenses/attribution); likely Postgres | |
| 5 | Accounts + wish history (desktop sync app); OAuth 2.1 on `/mcp`; personal tools | |

### Phase 1 tools (draft)

| Tool | Notes |
|---|---|
| `search(query, types?)` | cross-entity name search |
| `list_characters(element?, weapon?, nation?, rarity?, sort?)` | summaries |
| `get_character(name, sections?)` | `overview` by default; `talents`, `constellations`, `ascension`, `costs`, `images` on request |
| `list_weapons` / `get_weapon` | |
| `list_artifacts` / `get_artifact` | |
| `get_material(name)` | drop sources + what uses it |
| `list_enemies` / `get_enemy` | |
| `get_game_info()` | elements, nations, weapon types, categories, last data sync |

All read-only (`readOnlyHint`). Names resolved via `find*()`; misses return `isError` with suggestions.

### Testing (every phase)

1. Service unit tests (`service.test.js`).
2. MCP integration tests using the SDK client over an in-memory transport.
3. MCP Inspector for manual checks.
4. Real hosts: does the model pick the right tool from its description alone?

## Known data gaps to resolve before Phase 3

- Domain/weekday schedules for talent & weapon materials.
- Boss sources for ascension/talent boss materials (check `dropped_by` coverage).
- Character aliases/nicknames (e.g. "Childe" → `tartaglia`) for the name resolver.
