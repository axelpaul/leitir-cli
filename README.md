# leitir-cli

CLI for [leitir.is](https://leitir.is) — the Icelandic library platform (Ex Libris Primo/Alma).

Search the catalog, manage loans, renew books, check fines, and place holds from the terminal. Designed for both humans and AI agents.

## Install

```bash
bun install
bun link
```

## Auth

Either login interactively:

```bash
leitir login <ssn> <password>
```

Or set the token directly (useful for agents / CI):

```bash
export LEITIR_TOKEN=eyJ...
```

Tokens are cached to `~/.leitir/token.json` and last ~24 hours.

## Commands

### Search

```bash
leitir search "Ronja"                    # Local Icelandic holdings (default)
leitir search "Ronja" --global           # Worldwide Primo Central
leitir search "Astrid Lindgren" --limit 20
leitir suggest "Ronja"                   # Autocomplete suggestions
```

### Loans

```bash
leitir loans                             # List active loans with due dates
leitir renew "Ronja"                     # Fuzzy match by title
leitir renew 13259171840006893           # Or use exact loan ID
leitir renew --all                       # Renew everything
```

### Account

```bash
leitir account                           # Overview (loan count, fines, requests)
leitir requests                          # Hold requests and status
leitir fines                             # Fines and fees
leitir profile                           # Personal settings
```

## Agent usage

Output is JSON by default when piped (non-TTY), human-readable in a terminal.

```bash
# Agent reads structured JSON
leitir loans | jq '.loans[] | {title, daysUntilDue, renewable}'

# Machine-readable command schema for tool registration
leitir help | jq '.commands[].name'

# Auth via env var
LEITIR_TOKEN=eyJ... leitir loans
```

### Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Auth error (not logged in / token expired) |
| 3 | Not found (no matching loan, etc.) |
| 4 | API error (server returned error) |

## Development

```bash
bun run dev          # Watch mode
bun run check        # Lint + typecheck
bun build --compile src/index.ts --outfile leitir
```
