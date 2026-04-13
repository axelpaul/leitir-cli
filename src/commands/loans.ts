import { LeitirClient } from "../lib/client.ts";
import { requireAuth } from "../lib/config.ts";
import { daysUntil, formatDate, jsonMode, log, output, outputError } from "../lib/output.ts";
import type { Loan } from "../lib/types.ts";

export async function listLoans(): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);
	const res = await client.getLoans();
	const loans = res.data.loans.loan;

	if (jsonMode) {
		output({
			count: loans.length,
			loans: loans.map((l) => ({
				loanId: l.loanid,
				title: l.title,
				author: l.author,
				dueDate: formatDate(l.duedate),
				daysUntilDue: daysUntil(l.duedate),
				renewable: l.renew === "Y",
				status: l.loanstatus,
				location: l.mainlocationname,
				barcode: l.itembarcode,
			})),
		});
		return;
	}

	if (loans.length === 0) {
		log("No active loans.");
		return;
	}

	log(`Active loans (${loans.length}):\n`);
	for (const loan of loans) {
		const days = daysUntil(loan.duedate);
		const dueStr = formatDate(loan.duedate);
		const renewable = loan.renew === "Y" ? "renewable" : "not renewable";
		const urgency = days <= 3 ? " (!)" : days <= 7 ? " (*)" : "";
		log(`  ${loan.title}`);
		log(`    Due: ${dueStr} (${days}d)${urgency}  |  ${renewable}  |  ${loan.mainlocationname}`);
		log(`    ID: ${loan.loanid}\n`);
	}
}

// ─── Fuzzy matching ─────────────────────────────────────────────

function tokenize(text: string): string[] {
	return text.toLowerCase().replace(/[^\w\sáéíóúýþæöð]/g, "").split(/\s+/).filter(Boolean);
}

function fuzzyScore(query: string, loan: Loan): number {
	const queryTokens = tokenize(query);
	const searchable = `${loan.title} ${loan.author}`;
	const targetTokens = tokenize(searchable);
	let matched = 0;
	for (const qt of queryTokens) {
		if (targetTokens.some((tt) => tt.includes(qt) || qt.includes(tt))) {
			matched++;
		}
	}
	return queryTokens.length > 0 ? matched / queryTokens.length : 0;
}

async function resolveLoans(client: LeitirClient): Promise<Loan[]> {
	const res = await client.getLoans();
	return res.data.loans.loan;
}

export async function renewLoan(idOrTitle: string): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);

	// If it looks like a numeric loan ID, use it directly
	if (/^\d+$/.test(idOrTitle)) {
		const result = await client.renewLoan(idOrTitle);
		if (jsonMode) {
			output(result);
		} else {
			log("Loan renewed successfully.");
		}
		return;
	}

	// Fuzzy match against loan titles
	const loans = await resolveLoans(client);
	const scored = loans
		.map((loan) => ({ loan, score: fuzzyScore(idOrTitle, loan) }))
		.filter((s) => s.score > 0.4)
		.sort((a, b) => b.score - a.score);

	if (scored.length === 0) {
		outputError(`No loan matching "${idOrTitle}". Run 'leitir loans' to see active loans.`, 3);
	}

	const best = scored[0]!;
	if (best.loan.renew !== "Y") {
		outputError(`"${best.loan.title}" is not renewable.`, 3);
	}

	const result = await client.renewLoan(best.loan.loanid);

	if (jsonMode) {
		output({ ...result as object, matchedTitle: best.loan.title, matchScore: best.score });
	} else {
		log(`Renewed: ${best.loan.title}`);
		if (best.score < 1) {
			log(`  (matched with ${Math.round(best.score * 100)}% confidence)`);
		}
	}
}

export async function renewAll(): Promise<void> {
	const { jwt } = requireAuth();
	const client = new LeitirClient(jwt);
	const result = await client.renewAllLoans();

	if (jsonMode) {
		output(result);
	} else {
		log("All loans renewed.");
	}
}
