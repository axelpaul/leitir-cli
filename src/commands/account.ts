import { jsonMode, log, output } from "../lib/output.ts";
import {
	authClient,
	cancelRequest as cancelOne,
	getAccountOverview,
	getProfile,
	listFines,
	listRequests,
} from "../lib/service.ts";

export async function showCounters(): Promise<void> {
	const counters = await getAccountOverview(authClient());

	if (jsonMode) {
		output({ counters });
		return;
	}

	log("Account overview:\n");
	for (const c of counters) log(`  ${c.type.padEnd(16)} ${c.value}`);
}

export async function showFines(): Promise<void> {
	const fines = await listFines(authClient());

	if (jsonMode) {
		output({ count: fines.length, fines });
		return;
	}

	if (fines.length === 0) {
		log("No fines.");
		return;
	}

	log(`Fines (${fines.length}):\n`);
	for (const fine of fines) {
		log(`  ${fine.title}`);
		log(
			`    ${fine.originalAmount}  |  ${fine.paid ? "paid" : "open"}  |  ${fine.date}  |  ${fine.location}\n`,
		);
	}
}

export async function showRequests(): Promise<void> {
	const requests = await listRequests(authClient());

	if (jsonMode) {
		output({ count: requests.length, requests });
		return;
	}

	if (requests.length === 0) {
		log("No active requests.");
		return;
	}

	log(`Hold requests (${requests.length}):\n`);
	for (const r of requests) {
		const status = r.available ? "READY" : r.status;
		const cancelable = r.cancelable ? "cancelable" : "";
		log(`  ${r.title}`);
		log(
			`    Status: ${status}  |  Pickup: ${r.pickup}  |  Requested: ${r.requestedAt}  ${cancelable}`,
		);
		log(`    ID: ${r.requestId}\n`);
	}
}

export async function cancelRequest(idOrTitle: string): Promise<void> {
	const result = await cancelOne(authClient(), idOrTitle);

	if (jsonMode) {
		output(result);
		return;
	}

	log(result.matchedTitle ? `Cancelled: ${result.matchedTitle}` : "Request cancelled.");
	if (result.matchScore !== undefined && result.matchScore < 1) {
		log(`  (matched with ${Math.round(result.matchScore * 100)}% confidence)`);
	}
}

export async function showProfile(): Promise<void> {
	const p = await getProfile(authClient());

	if (jsonMode) {
		output(p);
		return;
	}

	log("Profile:\n");
	if (p.email) log(`  Email:    ${p.email}`);
	if (p.phone) log(`  Phone:    ${p.phone}`);
	if (p.address) log(`  Address:  ${p.address}`);
	if (p.zip && p.city) log(`  City:     ${p.zip} ${p.city}`);
}
