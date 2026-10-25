import { jsonMode, log, output } from "../lib/output.ts";
import {
	getSuggestions,
	optionalAuthClient,
	type SearchOptions,
	type SearchResult,
	searchCatalog,
} from "../lib/service.ts";

function printResult(r: SearchResult): void {
	log(`  ${r.title}`);
	const meta = [r.creator, r.type, r.date, r.language].filter(Boolean).join("  |  ");
	if (meta) log(`    ${meta}`);
	if (r.recordId) log(`    ID: ${r.recordId}`);
	log("");
}

export async function search(query: string, opts: SearchOptions): Promise<void> {
	const res = await searchCatalog(optionalAuthClient(), query, opts);

	if (jsonMode) {
		output(res);
		return;
	}

	log(`Results (${res.scope}): ${res.total} found\n`);
	if (res.results.length === 0) {
		log("  No results. Try --global to search worldwide.");
		return;
	}
	for (const r of res.results) printResult(r);
}

export async function suggest(query: string): Promise<void> {
	const suggestions = await getSuggestions(optionalAuthClient(), query);

	if (jsonMode) {
		output({ suggestions });
		return;
	}

	if (suggestions.length === 0) {
		log("No suggestions.");
		return;
	}
	for (const s of suggestions) log(`  ${s}`);
}
