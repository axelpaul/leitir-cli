import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
	authClient,
	cancelRequest,
	getAccountOverview,
	getProfile,
	getSuggestions,
	listFines,
	listLoans,
	listRequests,
	optionalAuthClient,
	renewAllLoans,
	renewLoan,
	SORT_OPTIONS,
	searchCatalog,
} from "../lib/service.ts";
import { VERSION } from "../lib/version.ts";

export const WRITES_ENV_VAR = "LEITIR_MCP_ENABLE_WRITES";

export function writesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[WRITES_ENV_VAR] === "1";
}

const result = (data: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(data) }],
});

const failure = (value: unknown) => ({
	isError: true,
	content: [
		{
			type: "text" as const,
			text: value instanceof Error ? value.message : "Library request failed.",
		},
	],
});

async function run(fn: () => Promise<unknown>) {
	try {
		return result(await fn());
	} catch (e) {
		return failure(e);
	}
}

const AUTH_NOTE =
	"Requires authentication configured locally (run `leitir login` or set LEITIR_TOKEN).";

const confirm = z
	.literal(true)
	.describe("Must be true to confirm that this change should be made on the patron's account.");

export function createServer(options: { enableWrites?: boolean } = {}): McpServer {
	const enableWrites = options.enableWrites ?? writesEnabled();
	const server = new McpServer({ name: "leitir", version: VERSION });

	// ─── Read tools ──────────────────────────────────────────────

	server.registerTool(
		"search",
		{
			description:
				"Search the Icelandic library catalogue on leitir.is. Defaults to local Icelandic holdings; set global=true for worldwide Primo Central results. No login needed.",
			inputSchema: {
				query: z.string().min(1).describe("Search terms (title, author, subject, ...)"),
				limit: z.number().int().min(1).max(50).default(10).describe("Results per page"),
				offset: z.number().int().min(0).default(0).describe("Pagination offset"),
				sort: z.enum(SORT_OPTIONS).default("rank").describe("Sort order"),
				global: z.boolean().default(false).describe("Search worldwide instead of local holdings"),
			},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		({ query, limit, offset, sort, global }) =>
			run(() => searchCatalog(optionalAuthClient(), query, { limit, offset, sort, global })),
	);

	server.registerTool(
		"suggest",
		{
			description: "Autocomplete search suggestions for a partial query. No login needed.",
			inputSchema: { query: z.string().min(1).describe("Partial search text") },
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		({ query }) =>
			run(async () => ({ suggestions: await getSuggestions(optionalAuthClient(), query) })),
	);

	server.registerTool(
		"loans",
		{
			description: `List the patron's active loans with due dates, days left and whether each can be renewed. ${AUTH_NOTE}`,
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		() =>
			run(async () => {
				const loans = await listLoans(authClient());
				return { count: loans.length, loans };
			}),
	);

	server.registerTool(
		"requests",
		{
			description: `List the patron's hold requests with status, pickup location and whether each can be cancelled. ${AUTH_NOTE}`,
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		() =>
			run(async () => {
				const requests = await listRequests(authClient());
				return { count: requests.length, requests };
			}),
	);

	server.registerTool(
		"fines",
		{
			description: `List the patron's fines and fees (open and paid). ${AUTH_NOTE}`,
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		() =>
			run(async () => {
				const fines = await listFines(authClient());
				return { count: fines.length, fines };
			}),
	);

	server.registerTool(
		"account",
		{
			description: `Account overview counters (number of loans, requests, fines). ${AUTH_NOTE}`,
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		() => run(async () => ({ counters: await getAccountOverview(authClient()) })),
	);

	server.registerTool(
		"profile",
		{
			description: `The patron's contact details on file (email, phone, address). ${AUTH_NOTE}`,
			inputSchema: {},
			annotations: { readOnlyHint: true, openWorldHint: true },
		},
		() => run(() => getProfile(authClient())),
	);

	// ─── Write tools (opt-in) ────────────────────────────────────

	if (enableWrites) {
		server.registerTool(
			"renew_loan",
			{
				description: `Renew one loan, by numeric loan ID (from \`loans\`) or by title/author (fuzzy match; the best match is renewed and returned as matchedTitle). ${AUTH_NOTE}`,
				inputSchema: {
					id_or_title: z.string().min(1).describe("Numeric loan ID, or part of the title/author"),
					confirm,
				},
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
			},
			({ id_or_title }) => run(() => renewLoan(authClient(), id_or_title)),
		);

		server.registerTool(
			"renew_all_loans",
			{
				description: `Renew all renewable loans. ${AUTH_NOTE}`,
				inputSchema: { confirm },
				annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
			},
			() => run(() => renewAllLoans(authClient())),
		);

		server.registerTool(
			"cancel_request",
			{
				description: `Cancel one hold request, by numeric request ID (from \`requests\`) or by title/author (fuzzy match; the best match is cancelled and returned as matchedTitle). Cannot be undone. ${AUTH_NOTE}`,
				inputSchema: {
					id_or_title: z
						.string()
						.min(1)
						.describe("Numeric request ID, or part of the title/author"),
					confirm,
				},
				annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
			},
			({ id_or_title }) => run(() => cancelRequest(authClient(), id_or_title)),
		);
	}

	return server;
}

export async function serve(): Promise<void> {
	await createServer().connect(new StdioServerTransport());
	if (!writesEnabled()) {
		console.error(`leitir MCP: read-only (set ${WRITES_ENV_VAR}=1 to enable renew/cancel tools)`);
	}
}
