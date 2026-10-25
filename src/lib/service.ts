/**
 * Shared operations used by both the CLI commands and the MCP server.
 * Everything here returns plain data; presentation lives in src/commands and src/mcp.
 */
import { LeitirClient } from "./client.ts";
import { loadToken, requireAuth } from "./config.ts";
import { cleanDisplay, daysUntil, formatDate } from "./output.ts";
import type { Fine, Hold, Loan, SearchDoc } from "./types.ts";

export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}

/** Client with the cached/env token if there is one (search works anonymously). */
export function optionalAuthClient(): LeitirClient {
	const envToken = process.env.LEITIR_TOKEN;
	if (envToken) return new LeitirClient(envToken);
	const cached = loadToken();
	return new LeitirClient(cached && Date.now() < cached.expiresAt ? cached.jwt : undefined);
}

/** Client that requires a valid token; throws AuthError otherwise. */
export function authClient(): LeitirClient {
	return new LeitirClient(requireAuth().jwt);
}

// ─── Search ─────────────────────────────────────────────────────

export const SORT_OPTIONS = ["rank", "date", "author", "title"] as const;

export interface SearchOptions {
	limit?: number;
	offset?: number;
	sort?: string;
	global?: boolean;
}

export function mapSearchDoc(doc: SearchDoc) {
	return {
		recordId: doc.pnx.control.recordid?.[0] ?? null,
		sourceId: doc.pnx.control.sourceid?.[0] ?? null,
		title: cleanDisplay(doc.pnx.display.title?.[0]) ?? "Untitled",
		creator: cleanDisplay(doc.pnx.display.creator?.[0]),
		type: doc.pnx.display.type?.[0] ?? null,
		date: doc.pnx.display.creationdate?.[0] ?? null,
		publisher: cleanDisplay(doc.pnx.display.publisher?.[0]),
		language: doc.pnx.display.language?.[0] ?? null,
		subjects: doc.pnx.display.subject ?? [],
		description: cleanDisplay(doc.pnx.display.description?.[0]),
		context: doc.context,
	};
}

export type SearchResult = ReturnType<typeof mapSearchDoc>;

export async function searchCatalog(client: LeitirClient, query: string, opts: SearchOptions = {}) {
	const limit = opts.limit ?? 10;
	// Request more results when filtering to local, so we still fill the page
	const res = await client.search(query, {
		limit: opts.global ? limit : limit * 3,
		offset: opts.offset,
		sort: opts.sort,
		local: !opts.global,
	});

	// Filter to local-only results (context="L") unless global
	const docs = opts.global ? res.docs : res.docs.filter((d) => d.context === "L");
	const results = docs.slice(0, limit).map(mapSearchDoc);
	const total = opts.global ? res.info.total : (res.info.totalResultsLocal ?? res.info.total);

	return {
		query,
		scope: opts.global ? ("global" as const) : ("local" as const),
		total,
		resultCount: results.length,
		results,
	};
}

export async function getSuggestions(client: LeitirClient, query: string): Promise<string[]> {
	const res = await client.suggest(query);
	return res.response.docs.map((d) => d.text);
}

// ─── Loans ──────────────────────────────────────────────────────

export function mapLoan(l: Loan) {
	return {
		loanId: l.loanid,
		title: l.title,
		author: l.author,
		dueDate: formatDate(l.duedate),
		daysUntilDue: daysUntil(l.duedate),
		renewable: l.renew === "Y",
		status: l.loanstatus,
		location: l.mainlocationname,
		barcode: l.itembarcode,
	};
}

export type LoanSummary = ReturnType<typeof mapLoan>;

export async function listLoans(client: LeitirClient): Promise<LoanSummary[]> {
	const res = await client.getLoans();
	return (res.data.loans?.loan ?? []).map(mapLoan);
}

// ─── Fuzzy matching ─────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\w\sáéíóúýþæöð]/g, "")
		.split(/\s+/)
		.filter(Boolean);
}

/** Fraction of query tokens that appear (as substrings) in the target text. */
export function fuzzyScore(query: string, target: string): number {
	const queryTokens = tokenize(query);
	const targetTokens = tokenize(target);
	let matched = 0;
	for (const qt of queryTokens) {
		if (targetTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) matched++;
	}
	return queryTokens.length > 0 ? matched / queryTokens.length : 0;
}

const MATCH_THRESHOLD = 0.4;

function bestMatch<T>(query: string, items: T[], text: (item: T) => string) {
	return items
		.map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
		.filter((s) => s.score > MATCH_THRESHOLD)
		.sort((a, b) => b.score - a.score)[0];
}

const isNumericId = (value: string) => /^\d+$/.test(value);

export interface WriteResult {
	id: string;
	matchedTitle?: string;
	matchScore?: number;
	response: unknown;
}

/** Renew one loan by numeric loan ID, or by fuzzy title/author match. */
export async function renewLoan(client: LeitirClient, idOrTitle: string): Promise<WriteResult> {
	if (isNumericId(idOrTitle)) {
		return { id: idOrTitle, response: await client.renewLoan(idOrTitle) };
	}
	const loans = (await client.getLoans()).data.loans?.loan ?? [];
	const best = bestMatch(idOrTitle, loans, (l) => `${l.title} ${l.author ?? ""}`);
	if (!best) {
		throw new NotFoundError(
			`No loan matching "${idOrTitle}". Run 'leitir loans' to see active loans.`,
		);
	}
	if (best.item.renew !== "Y") {
		throw new NotFoundError(`"${best.item.title}" is not renewable.`);
	}
	return {
		id: best.item.loanid,
		matchedTitle: best.item.title,
		matchScore: best.score,
		response: await client.renewLoan(best.item.loanid),
	};
}

export async function renewAllLoans(client: LeitirClient): Promise<unknown> {
	return client.renewAllLoans();
}

// ─── Requests / holds ───────────────────────────────────────────

export function mapHold(h: Hold) {
	return {
		requestId: h.requestid,
		title: h.title,
		author: h.author ?? null,
		status: h.holdstatus,
		available: h.available === "Y",
		cancelable: h.cancel === "Y",
		pickup: h.pickuplocationname,
		requestedAt: formatDate(h.requestdate),
	};
}

export type HoldSummary = ReturnType<typeof mapHold>;

export async function listRequests(client: LeitirClient): Promise<HoldSummary[]> {
	const res = await client.getRequests();
	return (res.data.holds?.hold ?? []).map(mapHold);
}

/** Cancel one hold request by numeric request ID, or by fuzzy title/author match. */
export async function cancelRequest(client: LeitirClient, idOrTitle: string): Promise<WriteResult> {
	if (isNumericId(idOrTitle)) {
		return { id: idOrTitle, response: await client.cancelRequest(idOrTitle) };
	}
	const holds = (await client.getRequests()).data.holds?.hold ?? [];
	const best = bestMatch(idOrTitle, holds, (h) => `${h.title} ${h.author ?? ""}`);
	if (!best) {
		throw new NotFoundError(
			`No request matching "${idOrTitle}". Run 'leitir requests' to see active requests.`,
		);
	}
	if (best.item.cancel !== "Y") {
		throw new NotFoundError(`"${best.item.title}" cannot be cancelled.`);
	}
	return {
		id: best.item.requestid,
		matchedTitle: best.item.title,
		matchScore: best.score,
		response: await client.cancelRequest(best.item.requestid),
	};
}

// ─── Fines / account / profile ──────────────────────────────────

export function mapFine(f: Fine) {
	return {
		fineId: f.fineid,
		title: f.title,
		amount: f.finesum,
		originalAmount: f.originalfinesum,
		status: f.finestatus,
		paid: f.finestatus === "CLOSED",
		date: formatDate(f.finedate),
		location: f.finemainlocation,
		type: f.type,
		description: f.description,
	};
}

export type FineSummary = ReturnType<typeof mapFine>;

export async function listFines(client: LeitirClient): Promise<FineSummary[]> {
	const res = await client.getFines();
	return (res.data.fines?.fine ?? []).map(mapFine);
}

export async function getAccountOverview(client: LeitirClient) {
	const res = await client.getCounters();
	return (res.data.listofactions?.action ?? []).map((c) => ({ type: c.type, value: c.value }));
}

export async function getProfile(client: LeitirClient) {
	const { data } = await client.getPersonalSettings();
	return {
		email: data.email?.value || null,
		phone: data.telephone1?.value || null,
		address: data.address1?.value || null,
		zip: data.zip?.value || null,
		city: data.city?.value || null,
	};
}
