import { LeitirClient } from "../lib/client.ts";
import { loadToken } from "../lib/config.ts";
import { cleanDisplay, jsonMode, log, output } from "../lib/output.ts";
import type { SearchDoc } from "../lib/types.ts";

const DEFAULT_PICKUP = "Borgarbókasafnið Sólheimum";

interface LocalInstitution {
	code: string | null;
	name: string;
	status: string | null;
	linkRecordIds: string[];
}

interface RequestCandidate {
	recordId: string | null;
	sourceId: string | null;
	title: string;
	creator: string | null;
	type: string | null;
	date: string | null;
	context: string;
	availability: string[];
	displayedAvailability: string | null;
	localInstitutions: LocalInstitution[];
	hasPublicLibraryHolding: boolean;
	resourceSharingHidden: boolean;
	recommendation: string;
}

function first(values: string[] | undefined): string | null {
	return values?.[0] ?? null;
}

function mapInstitutions(doc: SearchDoc): LocalInstitution[] {
	return (doc.delivery?.almaInstitutionsList ?? []).map((inst) => ({
		code: inst.instCode ?? null,
		name: inst.instName ?? "Unknown institution",
		status: inst.availabilityStatus ?? null,
		linkRecordIds: (inst.getitLink ?? []).map((link) => link.linkRecordId).filter((id): id is string => !!id),
	}));
}

function recommendation(doc: SearchDoc, institutions: LocalInstitution[], preferredPickup: string): string {
	const isLocal = doc.context === "L";
	const hasPublicLibrary = institutions.some(
		(inst) => inst.code === "354ILC_ALM" || inst.name.toLowerCase().includes("almenningsbókasöfn"),
	);
	const availability = doc.delivery?.availability ?? [];
	const hiddenResourceSharing = doc.delivery?.hideResourceSharing === true;

	if (!isLocal) {
		return `Global/remote result. Use MSL/resource-sharing planning; do not treat this as an ordinary local hold. Preferred pickup remains ${preferredPickup}.`;
	}
	if (hasPublicLibrary) {
		return `Ordinary hold may be possible through Almenningsbókasöfn. In the browser, choose ${preferredPickup} only; if it is not offered, stop and use MSL/resource-sharing instead.`;
	}
	if (availability.includes("no_inventory") || institutions.length === 0) {
		return `No directly usable local inventory found in this read-only plan. Use MSL/resource-sharing if the item is wanted, with ${preferredPickup} as pickup.`;
	}
	if (hiddenResourceSharing) {
		return `Local delivery metadata hides resource-sharing. Check the ordinary hold flow, but stop unless ${preferredPickup} is offered.`;
	}
	return `Review ordinary hold options in the browser. Do not select another pickup branch just because it is available; use ${preferredPickup} or MSL/resource-sharing.`;
}

function mapCandidate(doc: SearchDoc, preferredPickup: string): RequestCandidate {
	const institutions = mapInstitutions(doc);
	return {
		recordId: first(doc.pnx.control.recordid),
		sourceId: first(doc.pnx.control.sourceid),
		title: cleanDisplay(first(doc.pnx.display.title)) ?? "Untitled",
		creator: cleanDisplay(first(doc.pnx.display.creator)),
		type: first(doc.pnx.display.type),
		date: first(doc.pnx.display.creationdate),
		context: doc.context,
		availability: doc.delivery?.availability ?? [],
		displayedAvailability: doc.delivery?.displayedAvailability ?? null,
		localInstitutions: institutions,
		hasPublicLibraryHolding: institutions.some(
			(inst) => inst.code === "354ILC_ALM" || inst.name.toLowerCase().includes("almenningsbókasöfn"),
		),
		resourceSharingHidden: doc.delivery?.hideResourceSharing === true,
		recommendation: recommendation(doc, institutions, preferredPickup),
	};
}

export async function requestPlan(query: string, opts: {
	limit?: number;
	global?: boolean;
	preferredPickup?: string;
}): Promise<void> {
	const preferredPickup = opts.preferredPickup ?? DEFAULT_PICKUP;
	const token = loadToken();
	const client = new LeitirClient(token?.jwt);
	const limit = opts.limit ?? 5;
	const res = await client.search(query, {
		limit: opts.global ? limit : limit * 3,
		local: !opts.global,
		includeDelivery: true,
	});
	const docs = (opts.global ? res.docs : res.docs.filter((doc) => doc.context === "L")).slice(0, limit);
	const candidates = docs.map((doc) => mapCandidate(doc, preferredPickup));

	const plan = {
		dryRun: true,
		mutating: false,
		query,
		preferredPickup,
		scope: opts.global ? "global" : "local",
		resultCount: candidates.length,
		candidates,
		nextAction:
			candidates.length === 0
				? "No local candidates found. Retry with --global, then use MSL/resource-sharing if the item is wanted."
				: "Use this as a planning summary only. Any future request/place-hold command must require explicit --yes.",
	};

	if (jsonMode) {
		output(plan);
		return;
	}

	log(`Request plan for "${query}" (${plan.scope}, dry-run)\n`);
	log(`Preferred pickup: ${preferredPickup}`);
	log("No request has been placed.\n");

	if (candidates.length === 0) {
		log(plan.nextAction);
		return;
	}

	for (const [index, candidate] of candidates.entries()) {
		log(`${index + 1}. ${candidate.title}`);
		const meta = [candidate.creator, candidate.type, candidate.date].filter(Boolean).join(" | ");
		if (meta) log(`   ${meta}`);
		if (candidate.recordId) log(`   Record: ${candidate.recordId}`);
		if (candidate.localInstitutions.length > 0) {
			log(`   Institutions: ${candidate.localInstitutions.map((inst) => inst.name).join("; ")}`);
		} else {
			log("   Institutions: none in read-only delivery metadata");
		}
		log(`   ${candidate.recommendation}\n`);
	}
}
