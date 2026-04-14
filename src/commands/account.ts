import { LeitirClient } from "../lib/client.ts";
import { requireAuth } from "../lib/config.ts";
import { formatDate, jsonMode, log, output, outputError } from "../lib/output.ts";
import type { Hold } from "../lib/types.ts";

export async function showCounters(): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);
	const res = await client.getCounters();
	const counters = res.data.listofactions.action;

	if (jsonMode) {
		output({ counters });
		return;
	}

	log("Account overview:\n");
	for (const c of counters) {
		log(`  ${c.type.padEnd(16)} ${c.value}`);
	}
}

export async function showFines(): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);
	const res = await client.getFines();
	const fines = res.data.fines.fine;

	if (jsonMode) {
		output({ fines });
		return;
	}

	if (fines.length === 0) {
		log("No fines.");
		return;
	}

	log(`Fines (${fines.length}):\n`);
	for (const fine of fines) {
		const status = fine.finestatus === "CLOSED" ? "paid" : "open";
		log(`  ${fine.title}`);
		log(`    ${fine.originalfinesum}  |  ${status}  |  ${formatDate(fine.finedate)}  |  ${fine.finemainlocation}\n`);
	}
}

export async function showRequests(): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);
	const res = await client.getRequests();
	const holds = res.data.holds.hold;

	if (jsonMode) {
		output({ holds });
		return;
	}

	if (holds.length === 0) {
		log("No active requests.");
		return;
	}

	log(`Hold requests (${holds.length}):\n`);
	for (const hold of holds) {
		const available = hold.available === "Y" ? "READY" : hold.holdstatus;
		const cancelable = hold.cancel === "Y" ? "cancelable" : "";
		log(`  ${hold.title}`);
		log(`    Status: ${available}  |  Pickup: ${hold.pickuplocationname}  |  Requested: ${formatDate(hold.requestdate)}  ${cancelable}`);
		log(`    ID: ${hold.requestid}\n`);
	}
}

// ─── Cancel request ─────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text.toLowerCase().replace(/[^\w\sáéíóúýþæöð]/g, "").split(/\s+/).filter(Boolean);
}

function fuzzyScore(query: string, hold: Hold): number {
	const queryTokens = tokenize(query);
	const searchable = `${hold.title} ${hold.author ?? ""}`;
	const targetTokens = tokenize(searchable);
	let matched = 0;
	for (const qt of queryTokens) {
		if (targetTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
			matched++;
		}
	}
	return queryTokens.length > 0 ? matched / queryTokens.length : 0;
}

export async function cancelRequest(idOrTitle: string): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);

	// Numeric ID: use directly
	if (/^\d+$/.test(idOrTitle)) {
		const result = await client.cancelRequest(idOrTitle);
		if (jsonMode) {
			output(result);
		} else {
			log("Request cancelled.");
		}
		return;
	}

	// Fuzzy match against hold titles
	const res = await client.getRequests();
	const holds = res.data.holds.hold;
	const scored = holds
		.map((h) => ({ hold: h, score: fuzzyScore(idOrTitle, h) }))
		.filter((s) => s.score > 0.4)
		.sort((a, b) => b.score - a.score);

	if (scored.length === 0) {
		outputError(`No request matching "${idOrTitle}". Run 'leitir requests' to see active requests.`, 3);
	}

	const best = scored[0]!;
	if (best.hold.cancel !== "Y") {
		outputError(`"${best.hold.title}" cannot be cancelled.`, 3);
	}

	const result = await client.cancelRequest(best.hold.requestid);

	if (jsonMode) {
		output({ ...result as object, matchedTitle: best.hold.title, matchScore: best.score });
	} else {
		log(`Cancelled: ${best.hold.title}`);
		if (best.score < 1) {
			log(`  (matched with ${Math.round(best.score * 100)}% confidence)`);
		}
	}
}

export async function showProfile(): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);
	const res = await client.getPersonalSettings();
	const data = res.data;

	if (jsonMode) {
		output(data);
		return;
	}

	log("Profile:\n");
	if (data.email?.value) log(`  Email:    ${data.email.value}`);
	if (data.telephone1?.value) log(`  Phone:    ${data.telephone1.value}`);
	if (data.address1?.value) log(`  Address:  ${data.address1.value}`);
	if (data.zip?.value && data.city?.value) log(`  City:     ${data.zip.value} ${data.city.value}`);
}
