#!/usr/bin/env bun

import {
	cancelRequest,
	showCounters,
	showFines,
	showProfile,
	showRequests,
} from "./commands/account.ts";
import { login, logout } from "./commands/auth.ts";
import { listLoans, renewAll, renewLoan } from "./commands/loans.ts";
import { search, suggest } from "./commands/search.ts";
import { ApiError } from "./lib/client.ts";
import { AuthError } from "./lib/config.ts";
import { jsonMode, output, outputError } from "./lib/output.ts";
import { promptHidden, promptLine } from "./lib/prompt.ts";
import { NotFoundError, SORT_OPTIONS } from "./lib/service.ts";
import { VERSION } from "./lib/version.ts";

const COMMANDS = [
	{
		name: "login",
		description: "Authenticate with leitir.is",
		args: [
			{
				name: "username",
				type: "string",
				required: false,
				positional: true,
				description: "Kennitala / library card (prompted if omitted)",
			},
			{
				name: "password",
				type: "string",
				required: false,
				positional: true,
				description: "Prompted (hidden) if omitted; avoid passing on the command line",
			},
		],
		env: [
			{ name: "LEITIR_USERNAME", description: "Kennitala / library card" },
			{ name: "LEITIR_PASSWORD", description: "PIN / password" },
		],
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
			{
				name: "idOrTitle",
				type: "string",
				required: false,
				positional: true,
				description: "Loan ID or partial title for fuzzy match",
			},
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
		name: "cancel",
		description: "Cancel a hold request by ID or title (fuzzy)",
		args: [
			{
				name: "idOrTitle",
				type: "string",
				required: true,
				positional: true,
				description: "Request ID or partial title for fuzzy match",
			},
		],
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
			{
				name: "--limit",
				type: "number",
				required: false,
				description: "Results per page (default 10)",
			},
			{ name: "--offset", type: "number", required: false, description: "Pagination offset" },
			{
				name: "--sort",
				type: "string",
				required: false,
				description: "Sort order: rank, date, author, title",
			},
			{
				name: "--global",
				type: "boolean",
				required: false,
				description: "Search global Primo Central instead of local",
			},
		],
		env: [],
	},
	{
		name: "suggest",
		description: "Autocomplete search suggestions",
		args: [{ name: "query", type: "string", required: true, positional: true }],
		env: [],
	},
	{
		name: "serve",
		description: "Start the MCP server over stdio (alias: mcp)",
		args: [],
		env: [
			{ name: "LEITIR_MCP_ENABLE_WRITES", description: "Set to 1 to expose renew/cancel tools" },
		],
	},
];

// ─── Arg parsing ────────────────────────────────────────────────

const rawArgs = process.argv.slice(2);
const BOOL_FLAGS = ["all", "json", "pretty", "help", "global", "version"];

// Extract positional args, skipping flag values
const positional: string[] = [];
for (let i = 0; i < rawArgs.length; i++) {
	const arg = rawArgs[i] as string;
	if (arg.startsWith("--")) {
		// Skip the flag and its value (if not a boolean flag)
		if (!BOOL_FLAGS.includes(arg.slice(2))) i++;
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

function numberFlag(name: string): number | undefined {
	const raw = getFlag(name);
	if (raw === undefined) return undefined;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 0) outputError(`--${name} must be a non-negative integer`);
	return n;
}

// ─── Help ───────────────────────────────────────────────────────

function showHelp(asJson = jsonMode): void {
	if (asJson) {
		output({
			name: "leitir",
			version: VERSION,
			description: "CLI for leitir.is — Icelandic library platform (Ex Libris Primo/Alma)",
			commands: COMMANDS,
			exitCodes: {
				0: "success",
				1: "general error",
				2: "auth error",
				3: "not found",
				4: "API error",
			},
		});
		return;
	}

	console.log(`leitir v${VERSION} - CLI for leitir.is (Icelandic library platform)

Usage: leitir <command> [options]

Commands:
  login [ssn]              Authenticate with leitir.is (prompts for password)
  logout                   Remove cached token
  loans                    List active loans
  renew <id|title>         Renew by loan ID or title (fuzzy match)
  renew --all              Renew all renewable loans
  requests                 List hold requests
  cancel <id|title>        Cancel a hold request (fuzzy match)
  fines                    List fines
  account                  Account overview
  profile                  Show personal settings
  search <query>           Search local catalog (--global for worldwide)
                             --limit N  --offset N  --sort rank|date|author|title
  suggest <query>          Search suggestions
  serve                    Start the MCP server (stdio); alias: mcp

Global flags:
  --json         Force JSON output
  --pretty       Force human-readable output
  --help, -h     Show this help
  --version, -v  Print version

Auth:
  Run 'leitir login' or set LEITIR_TOKEN. 'login' also reads
  LEITIR_USERNAME / LEITIR_PASSWORD.

Exit codes:
  0  Success
  1  General error
  2  Auth error (not logged in / token expired)
  3  Not found (no matching loan, etc.)
  4  API error (server returned an error)

Examples:
  leitir login 1234567890
  leitir loans
  leitir renew "Ronja"
  leitir renew --all
  leitir search "Astrid Lindgren"
  leitir search "Ronja" --limit 5 --global
  LEITIR_TOKEN=eyJ... leitir loans`);
}

// ─── Routing ────────────────────────────────────────────────────

async function main(): Promise<void> {
	if (hasFlag("version") || rawArgs.includes("-v") || command === "version") {
		console.log(VERSION);
		return;
	}
	if (hasFlag("help") || rawArgs.includes("-h")) {
		showHelp(hasFlag("json"));
		return;
	}

	switch (command) {
		case "serve":
		case "mcp": {
			const { serve } = await import("./mcp/server.ts");
			await serve();
			return;
		}

		case "login": {
			const username =
				positional[1] || process.env.LEITIR_USERNAME || (await promptLine("Kennitala: "));
			const password =
				positional[2] || process.env.LEITIR_PASSWORD || (await promptHidden("Password: "));
			if (!username || !password) outputError("Usage: leitir login [ssn] (password is prompted)");
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
				if (!idOrTitle) outputError("Usage: leitir renew <id|title> or leitir renew --all");
				await renewLoan(idOrTitle);
			}
			break;
		}

		case "requests":
			await showRequests();
			break;

		case "cancel": {
			const idOrTitle = positional.slice(1).join(" ");
			if (!idOrTitle) outputError("Usage: leitir cancel <id|title>");
			await cancelRequest(idOrTitle);
			break;
		}

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
			const sort = getFlag("sort");
			if (sort && !(SORT_OPTIONS as readonly string[]).includes(sort)) {
				outputError(`--sort must be one of: ${SORT_OPTIONS.join(", ")}`);
			}
			await search(query, {
				limit: numberFlag("limit"),
				offset: numberFlag("offset"),
				sort,
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
}

try {
	await main();
} catch (err) {
	if (err instanceof AuthError) outputError(err.message, 2);
	if (err instanceof NotFoundError) outputError(err.message, 3);
	if (err instanceof ApiError) outputError(err.message, err.status === 401 ? 2 : 4);
	if (err instanceof Error) outputError(err.message);
	outputError(String(err));
}
