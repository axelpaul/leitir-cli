#!/usr/bin/env bun

import { showCounters, showFines, showProfile, showRequests } from "./commands/account.ts";
import { login, logout } from "./commands/auth.ts";
import { listLoans, renewAll, renewLoan } from "./commands/loans.ts";
import { search, suggest } from "./commands/search.ts";
import { ApiError } from "./lib/client.ts";
import { AuthError } from "./lib/config.ts";
import { jsonMode, output, outputError } from "./lib/output.ts";

const COMMANDS = [
	{
		name: "login",
		description: "Authenticate with leitir.is",
		args: [
			{ name: "username", type: "string", required: true, positional: true },
			{ name: "password", type: "string", required: true, positional: true },
		],
		env: [],
	},
	{ name: "logout", description: "Remove cached token", args: [], env: [] },
	{
		name: "loans",
		description: "List active loans with due dates, renewal status",
		args: [],
		env: [{ name: "LEITIR_TOKEN", description: "JWT token (alternative to leitir login)" }],
	},
	{
		name: "renew",
		description: "Renew a loan by ID, title (fuzzy), or --all",
		args: [
			{ name: "idOrTitle", type: "string", required: false, positional: true, description: "Loan ID or partial title for fuzzy match" },
			{ name: "--all", type: "boolean", required: false, description: "Renew all renewable loans" },
		],
		env: [{ name: "LEITIR_TOKEN", description: "JWT token" }],
	},
	{
		name: "requests",
		description: "List hold requests and their status",
		args: [],
		env: [{ name: "LEITIR_TOKEN", description: "JWT token" }],
	},
	{
		name: "fines",
		description: "List fines and fees",
		args: [],
		env: [{ name: "LEITIR_TOKEN", description: "JWT token" }],
	},
	{
		name: "account",
		description: "Account overview (loan count, fines, requests)",
		args: [],
		env: [{ name: "LEITIR_TOKEN", description: "JWT token" }],
	},
	{
		name: "profile",
		description: "Show personal settings (email, phone, address)",
		args: [],
		env: [{ name: "LEITIR_TOKEN", description: "JWT token" }],
	},
	{
		name: "search",
		description: "Search the library catalog (defaults to local Icelandic holdings)",
		args: [
			{ name: "query", type: "string", required: true, positional: true },
			{ name: "--limit", type: "number", required: false, description: "Results per page (default 10)" },
			{ name: "--offset", type: "number", required: false, description: "Pagination offset" },
			{ name: "--sort", type: "string", required: false, description: "Sort order: rank, date, author, title" },
			{ name: "--global", type: "boolean", required: false, description: "Search global Primo Central instead of local" },
		],
		env: [],
	},
	{
		name: "suggest",
		description: "Autocomplete search suggestions",
		args: [{ name: "query", type: "string", required: true, positional: true }],
		env: [],
	},
];

// ─── Arg parsing ────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);

// Extract positional args, skipping flag values
const positional: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
	const arg = rawArgs[i]!;
	if (arg.startsWith("--")) {
		// Skip the flag and its value (if not a boolean flag)
		const boolFlags = ["all", "json", "pretty", "help", "global"];
		if (!boolFlags.includes(arg.slice(2))) i++;
		continue;
	}
	if (arg.startsWith("-")) continue;
	positional.push(arg);
}
const command = positional[0];

function getFlag(name: string): string | undefined {
	const idx = rawArgs.indexOf(`--${name}`);
	if (idx === -1 || idx + 1 >= rawArgs.length) return undefined;
	return rawArgs[idx + 1];
}

function hasFlag(name: string): boolean {
	return rawArgs.includes(`--${name}`);
}

// ─── Help ───────────────────────────────────────────────────────

function showHelp(): void {
	if (jsonMode) {
		output({
			name: "leitir",
			version: "0.1.0",
			description: "CLI for leitir.is — Icelandic library platform (Ex Libris Primo/Alma)",
			commands: COMMANDS,
			exitCodes: { 0: "success", 1: "general error", 2: "auth error", 3: "not found", 4: "API error" },
		});
		return;
	}

	console.log(`leitir v0.1.0 - CLI for leitir.is (Icelandic library platform)

Usage: leitir <command> [options]

Commands:
  login <ssn> <password>   Authenticate with leitir.is
  logout                   Remove cached token
  loans                    List active loans
  renew <id|title>         Renew by loan ID or title (fuzzy match)
  renew --all              Renew all renewable loans
  requests                 List hold requests
  fines                    List fines
  account                  Account overview
  profile                  Show personal settings
  search <query>           Search local catalog (--global for worldwide)
  suggest <query>          Search suggestions

Global flags:
  --json         Force JSON output
  --pretty       Force human-readable output
  --help, -h     Show this help

Auth:
  Either run 'leitir login' or set LEITIR_TOKEN env var.

Exit codes:
  0  Success
  1  General error
  2  Auth error (not logged in / token expired)
  3  Not found (no matching loan, etc.)
  4  API error (server returned an error)

Examples:
  leitir login 1234567890 mypassword
  leitir loans
  leitir renew "Ronja"
  leitir renew --all
  leitir search "Astrid Lindgren"
  leitir search "Ronja" --limit 5 --global
  LEITIR_TOKEN=eyJ... leitir loans`);
}

// ─── Routing ────────────────────────────────────────────────────

try {
	switch (command) {
		case "login": {
			const username = positional[1];
			const password = positional[2];
			if (!username || !password) outputError("Usage: leitir login <ssn> <password>");
			await login(username, password);
			break;
		}

		case "logout":
			logout();
			break;

		case "loans":
			await listLoans();
			break;

		case "renew": {
			if (hasFlag("all")) {
				await renewAll();
			} else {
				const idOrTitle = positional.slice(1).join(" ");
				if (!idOrTitle) outputError('Usage: leitir renew <id|title> or leitir renew --all');
				await renewLoan(idOrTitle);
			}
			break;
		}

		case "requests":
			await showRequests();
			break;

		case "fines":
			await showFines();
			break;

		case "account":
			await showCounters();
			break;

		case "profile":
			await showProfile();
			break;

		case "search": {
			const query = positional.slice(1).join(" ");
			if (!query) outputError("Usage: leitir search <query>");
			await search(query, {
				limit: getFlag("limit") ? Number(getFlag("limit")) : undefined,
				offset: getFlag("offset") ? Number(getFlag("offset")) : undefined,
				sort: getFlag("sort"),
				global: hasFlag("global"),
			});
			break;
		}

		case "suggest": {
			const q = positional.slice(1).join(" ");
			if (!q) outputError("Usage: leitir suggest <query>");
			await suggest(q);
			break;
		}

		case "help":
		case undefined:
			showHelp();
			break;

		default:
			outputError(`Unknown command: ${command}. Run 'leitir help' for usage.`);
	}
} catch (err) {
	if (err instanceof AuthError) {
		outputError(err.message, 2);
	}
	if (err instanceof ApiError) {
		outputError(err.message, 4);
	}
	if (err instanceof Error) {
		outputError(err.message);
	}
	outputError(String(err));
}
