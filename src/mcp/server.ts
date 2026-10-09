import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LeitirClient } from "../lib/client.ts";
import { loadToken, requireAuth } from "../lib/config.ts";
import { cleanDisplay, daysUntil, formatDate } from "../lib/output.ts";

const server = new McpServer({ name: "leitir", version: "0.1.0" });
const result = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data) }] });
const error = (value: unknown) => ({ isError: true, content: [{ type: "text" as const, text: value instanceof Error ? value.message : "Library lookup failed." }] });

server.registerTool("search", {
	description: "Search Icelandic library holdings (read-only). Defaults to local results.",
	inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(25).default(10), global: z.boolean().default(false) },
}, async ({ query, limit, global }) => {
	try {
		const response = await new LeitirClient(loadToken()?.jwt).search(query, { limit: global ? limit : limit * 3, local: !global });
		const docs = global ? response.docs : response.docs.filter(doc => doc.context === "L");
		return result({ query, scope: global ? "global" : "local", total: global ? response.info.total : (response.info.totalResultsLocal ?? response.info.total), results: docs.slice(0, limit).map(doc => ({
			recordId: doc.pnx.control.recordid?.[0] ?? null,
			title: cleanDisplay(doc.pnx.display.title?.[0]) ?? "Untitled",
			creator: cleanDisplay(doc.pnx.display.creator?.[0]),
			type: doc.pnx.display.type?.[0] ?? null,
			date: doc.pnx.display.creationdate?.[0] ?? null,
			language: doc.pnx.display.language?.[0] ?? null,
		})) });
	} catch (e) { return error(e); }
});

server.registerTool("loans", {
	description: "List the signed-in patron's active loans and due dates. Read-only; authentication must already be configured locally.",
	inputSchema: {},
}, async () => {
	try {
		const response = await new LeitirClient(requireAuth().jwt).getLoans();
		return result({ loans: response.data.loans.loan.map(loan => ({ loanId: loan.loanid, title: loan.title, dueDate: formatDate(loan.duedate), daysUntilDue: daysUntil(loan.duedate), renewable: loan.renew === "Y", status: loan.loanstatus })) });
	} catch (e) { return error(e); }
});

server.registerTool("requests", {
	description: "List the signed-in patron's active library holds. Read-only; cannot place or cancel holds.",
	inputSchema: {},
}, async () => {
	try {
		const response = await new LeitirClient(requireAuth().jwt).getRequests();
		return result({ requests: response.data.holds.hold.map(hold => ({ requestId: hold.requestid, title: hold.title, status: hold.holdstatus, available: hold.available === "Y", pickup: hold.pickuplocationname, requestedAt: formatDate(hold.requestdate) })) });
	} catch (e) { return error(e); }
});

export async function serve(): Promise<void> { await server.connect(new StdioServerTransport()); }
