import { LeitirClient } from "../lib/client.ts";
import { requireAuth } from "../lib/config.ts";
import { formatDate, jsonMode, log, output } from "../lib/output.ts";

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
