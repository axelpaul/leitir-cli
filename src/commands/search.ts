import { LeitirClient } from "../lib/client.ts";
import { loadToken } from "../lib/config.ts";
import { jsonMode, log, output } from "../lib/output.ts";
import type { SearchDoc } from "../lib/types.ts";

function mapDoc(doc: SearchDoc) {
	return {
		recordId: doc.pnx.control.recordid?.[0] ?? null,
		sourceId: doc.pnx.control.sourceid?.[0] ?? null,
		title: doc.pnx.display.title?.[0] ?? "Untitled",
		creator: doc.pnx.display.creator?.[0] ?? null,
		type: doc.pnx.display.type?.[0] ?? null,
		date: doc.pnx.display.creationdate?.[0] ?? null,
		publisher: doc.pnx.display.publisher?.[0] ?? null,
		language: doc.pnx.display.language?.[0] ?? null,
		subjects: doc.pnx.display.subject ?? [],
		description: doc.pnx.display.description?.[0] ?? null,
		context: doc.context,
	};
}

function printDoc(doc: SearchDoc): void {
	const title = doc.pnx.display.title?.[0] ?? "Untitled";
	const creator = doc.pnx.display.creator?.[0];
	const type = doc.pnx.display.type?.[0];
	const date = doc.pnx.display.creationdate?.[0];
	const lang = doc.pnx.display.language?.[0];
	const id = doc.pnx.control.recordid?.[0];

	log(`  ${title}`);
	const meta = [creator, type, date, lang].filter(Boolean).join("  |  ");
	if (meta) log(`    ${meta}`);
	if (id) log(`    ID: ${id}`);
	log("");
}

export async function search(query: string, opts: {
	limit?: number;
	offset?: number;
	sort?: string;
	global?: boolean;
}): Promise<void> {
	const token = loadToken();
	const client = new LeitirClient(token?.jwt);

	// Request more results when filtering to local, so we still fill the page
	const requestLimit = opts.global ? (opts.limit ?? 10) : (opts.limit ?? 10) * 3;
	const res = await client.search(query, {
		limit: requestLimit,
		offset: opts.offset,
		sort: opts.sort,
		local: !opts.global,
	});

	// Filter to local-only results (context="L") unless --global
	const docs = opts.global ? res.docs : res.docs.filter((d) => d.context === "L");
	const displayDocs = docs.slice(0, opts.limit ?? 10);
	const totalLocal = res.info.totalResultsLocal ?? res.info.total;
	const total = opts.global ? res.info.total : totalLocal;

	if (jsonMode) {
		output({
			query,
			scope: opts.global ? "global" : "local",
			total,
			resultCount: displayDocs.length,
			results: displayDocs.map(mapDoc),
		});
		return;
	}

	log(`Results (${opts.global ? "global" : "local"}): ${total} found\n`);

	if (displayDocs.length === 0) {
		log("  No results. Try --global to search worldwide.");
		return;
	}

	for (const doc of displayDocs) {
		printDoc(doc);
	}
}

export async function suggest(query: string): Promise<void> {
	const client = new LeitirClient();
	const res = await client.suggest(query);
	const suggestions = res.response.docs.map((d) => d.text);

	if (jsonMode) {
		output({ suggestions });
		return;
	}

	if (suggestions.length === 0) {
		log("No suggestions.");
		return;
	}

	for (const s of suggestions) {
		log(`  ${s}`);
	}
}
