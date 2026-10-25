# leitir-cli

CLI and MCP server for [leitir.is](https://leitir.is), the Icelandic library catalogue (Ex Libris Primo/Alma). Search the catalogue, list and renew loans, manage hold requests and check fines from the terminal or from an AI assistant.

> Unofficial — not affiliated with Leitir, Landskerfi bókasafna or Ex Libris. It uses the same undocumented endpoints as the leitir.is web app, which may change without notice.

## Install

Requires [Bun](https://bun.sh) ≥ 1.1.

```sh
bun add -g github:axelpaul/leitir-cli     # install
bun add -g github:axelpaul/leitir-cli     # update (re-run; pulls the latest default branch)
bun remove -g leitir-cli                  # uninstall
```

This installs the `leitir` command into `~/.bun/bin`.

No Bun? Download a prebuilt binary for Linux, macOS or Windows from the [Releases page](https://github.com/axelpaul/leitir-cli/releases) (`leitir-<os>-<arch>`, checksums in `SHA256SUMS`), make it executable and put it on your `PATH`.

## Authentication

Searching and suggestions need no login. Loans, renewals, requests, fines and profile need a leitir.is (Alma) login: your kennitala or library card number and PIN/password.

```sh
leitir login                 # prompts for kennitala and (hidden) password
leitir login 1234567890      # prompts for the password only
leitir logout                # deletes the cached token
```

`login` also reads `LEITIR_USERNAME` / `LEITIR_PASSWORD` if set. The resulting token is cached in `~/.config/leitir-cli/token.json` (mode 0600) and lasts about 24 hours; after that run `leitir login` again.

Alternatively pass a token directly (useful for agents/CI), which takes precedence over the cache:

```sh
export LEITIR_TOKEN=eyJ...
```

## CLI usage

Output is human-readable in a terminal and JSON when piped (force with `--json` / `--pretty`).

### Search

```sh
leitir search "Ronja"                         # Local Icelandic holdings (default)
leitir search "Ronja" --global                # Worldwide Primo Central
leitir search "Astrid Lindgren" --limit 20 --offset 20
leitir search "Ronja" --sort date             # rank (default), date, author, title
leitir suggest "Ronj"                         # Autocomplete suggestions
```

### Loans

```sh
leitir loans                                  # Active loans with due dates
leitir renew "Ronja"                          # Fuzzy match on title/author
leitir renew 12345678900001234                # Or the exact loan ID from `leitir loans`
leitir renew --all                            # Renew everything renewable
```

### Requests and account

```sh
leitir requests                               # Hold requests and status
leitir cancel "Ronja"                         # Cancel a hold (fuzzy match or request ID)
leitir fines                                  # Fines and fees
leitir account                                # Overview counters (loans, fines, requests)
leitir profile                                # Contact details on file
```

Fuzzy matching picks the best title/author match (more than 40% of your words must match) and reports `matchedTitle` / `matchScore`; use the numeric ID when you need to be exact.

### Agent usage

```sh
leitir loans | jq '.loans[] | {title, daysUntilDue, renewable}'
leitir help --json | jq '.commands[].name'     # machine-readable command schema
LEITIR_TOKEN=eyJ... leitir loans
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Auth error (not logged in / token expired) |
| 3 | Not found (no matching loan or request, not renewable/cancellable) |
| 4 | API error (server returned an error) |

## MCP server

`leitir serve` runs an MCP server over stdio (`leitir mcp` is an alias). It uses the same code and the same login as the CLI, so run `leitir login` first (or set `LEITIR_TOKEN`) for anything beyond search.

| Tool | Access | Description |
|------|--------|-------------|
| `search` | read | Search the catalogue (`query`, `limit`, `offset`, `sort`, `global`). No login needed. |
| `suggest` | read | Autocomplete suggestions for a partial query. No login needed. |
| `loans` | read | Active loans with due dates, days left and renewability. |
| `requests` | read | Hold requests with status, pickup location and cancellability. |
| `fines` | read | Fines and fees. |
| `account` | read | Overview counters (loans, requests, fines). |
| `profile` | read | Contact details on file (email, phone, address). |
| `renew_loan` | write | Renew one loan by ID or fuzzy title (`id_or_title`, `confirm: true`). |
| `renew_all_loans` | write | Renew all renewable loans (`confirm: true`). |
| `cancel_request` | write | Cancel one hold request by ID or fuzzy title (`id_or_title`, `confirm: true`). |

The server is read-only by default. Write tools are only listed when `LEITIR_MCP_ENABLE_WRITES=1` is set, and each call must also pass `confirm: true`. Placing new holds is not supported (the CLI cannot do it either).

Claude Code:

```sh
claude mcp add leitir -- leitir serve
# with write tools:
claude mcp add leitir -e LEITIR_MCP_ENABLE_WRITES=1 -- leitir serve
```

Claude Desktop, Cursor and other clients that use JSON config:

```json
{
  "mcpServers": {
    "leitir": {
      "command": "leitir",
      "args": ["serve"],
      "env": { "LEITIR_MCP_ENABLE_WRITES": "1" }
    }
  }
}
```

Leave out `env` for read-only. GUI apps often don't have `~/.bun/bin` on their `PATH`; if the server fails to start, use the absolute path from `which leitir` as `command`. Environment variables such as `LEITIR_TOKEN` go in `"env"` as well.

## Configuration

| Variable | Description |
|----------|-------------|
| `LEITIR_TOKEN` | JWT to use instead of the cached login token |
| `LEITIR_USERNAME` | Kennitala / library card for `leitir login` |
| `LEITIR_PASSWORD` | PIN / password for `leitir login` |
| `LEITIR_MCP_ENABLE_WRITES` | `1` exposes the renew/cancel MCP tools |
| `XDG_CONFIG_HOME` | Base config directory (default `~/.config`) |

Files:

- `$XDG_CONFIG_HOME/leitir-cli/token.json` — cached login token (default `~/.config/leitir-cli/token.json`). The pre-0.2 location `~/.leitir/token.json` is still read if present.

## Development

```sh
bun install
bun src/index.ts search "Ronja" # run from source
bun run check                   # biome lint + tsc + tests
bun run build                   # compile a standalone binary to dist/leitir
```

Code layout: `src/lib/client.ts` is the HTTP client for the Primo/Alma endpoints, `src/lib/service.ts` holds the shared logic used by both `src/commands/*` (CLI) and `src/mcp/server.ts` (MCP).

Releases: pushing a `v*` tag runs the checks and publishes binaries for linux/darwin/windows (x64 and arm64 where available) with `SHA256SUMS` to GitHub Releases.

## License

MIT
