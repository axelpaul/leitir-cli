import { jsonMode, log, output } from "../lib/output.ts";
import {
	authClient,
	listLoans as fetchLoans,
	renewAllLoans,
	renewLoan as renewOne,
} from "../lib/service.ts";

export async function listLoans(): Promise<void> {
	const loans = await fetchLoans(authClient());

	if (jsonMode) {
		output({ count: loans.length, loans });
		return;
	}

	if (loans.length === 0) {
		log("No active loans.");
		return;
	}

	log(`Active loans (${loans.length}):\n`);
	for (const loan of loans) {
		const days = loan.daysUntilDue;
		const renewable = loan.renewable ? "renewable" : "not renewable";
		const urgency = days <= 3 ? " (!)" : days <= 7 ? " (*)" : "";
		log(`  ${loan.title}`);
		log(`    Due: ${loan.dueDate} (${days}d)${urgency}  |  ${renewable}  |  ${loan.location}`);
		log(`    ID: ${loan.loanId}\n`);
	}
}

export async function renewLoan(idOrTitle: string): Promise<void> {
	const result = await renewOne(authClient(), idOrTitle);

	if (jsonMode) {
		output(result);
		return;
	}

	log(result.matchedTitle ? `Renewed: ${result.matchedTitle}` : "Loan renewed successfully.");
	if (result.matchScore !== undefined && result.matchScore < 1) {
		log(`  (matched with ${Math.round(result.matchScore * 100)}% confidence)`);
	}
}

export async function renewAll(): Promise<void> {
	const result = await renewAllLoans(authClient());
	if (jsonMode) {
		output(result);
	} else {
		log("All loans renewed.");
	}
}
