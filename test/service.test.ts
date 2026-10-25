import { expect, test } from "bun:test";
import type { LeitirClient } from "../src/lib/client.ts";
import {
	cancelRequest,
	fuzzyScore,
	NotFoundError,
	renewLoan,
	searchCatalog,
} from "../src/lib/service.ts";

const loan = (loanid: string, title: string, renew: "Y" | "N") => ({
	loanid,
	title,
	author: "Lindgren, Astrid",
	renew,
	duedate: "20300101",
});

function fakeClient(overrides: Partial<Record<keyof LeitirClient, unknown>>): LeitirClient {
	return overrides as unknown as LeitirClient;
}

test("fuzzyScore matches tokens and Icelandic letters", () => {
	expect(fuzzyScore("ronja", "Ronja ræningjadóttir")).toBe(1);
	expect(fuzzyScore("ræningja", "Ronja ræningjadóttir")).toBe(1);
	expect(fuzzyScore("harry potter", "Ronja ræningjadóttir")).toBe(0);
});

test("renewLoan by title renews the best renewable match", async () => {
	const renewed: string[] = [];
	const client = fakeClient({
		getLoans: async () => ({
			data: {
				loans: {
					loan: [loan("1", "Emil í Kattholti", "Y"), loan("2", "Ronja ræningjadóttir", "Y")],
				},
			},
		}),
		renewLoan: async (id: string) => {
			renewed.push(id);
			return { ok: true };
		},
	});
	const res = await renewLoan(client, "Ronja");
	expect(res).toMatchObject({ id: "2", matchedTitle: "Ronja ræningjadóttir", matchScore: 1 });
	expect(renewed).toEqual(["2"]);
});

test("renewLoan refuses non-renewable or unmatched loans", async () => {
	const client = fakeClient({
		getLoans: async () => ({ data: { loans: { loan: [loan("1", "Ronja", "N")] } } }),
		renewLoan: async () => {
			throw new Error("should not be called");
		},
	});
	await expect(renewLoan(client, "Ronja")).rejects.toBeInstanceOf(NotFoundError);
	await expect(renewLoan(client, "Harry Potter")).rejects.toBeInstanceOf(NotFoundError);
});

test("numeric IDs are used directly", async () => {
	const calls: string[] = [];
	const client = fakeClient({
		renewLoan: async (id: string) => calls.push(`renew:${id}`),
		cancelRequest: async (id: string) => calls.push(`cancel:${id}`),
	});
	await renewLoan(client, "42");
	await cancelRequest(client, "43");
	expect(calls).toEqual(["renew:42", "cancel:43"]);
});

test("searchCatalog filters to local results and cleans display values", async () => {
	const doc = (context: string, title: string) => ({
		context,
		pnx: { display: { title: [`${title}$$QJunk`] }, search: {}, control: { recordid: ["r1"] } },
	});
	const client = fakeClient({
		search: async () => ({
			info: { total: 100, totalResultsLocal: 7 },
			docs: [doc("PC", "Remote"), doc("L", "Ronja"), doc("L", "Emil")],
		}),
	});
	const res = await searchCatalog(client, "x", { limit: 1 });
	expect(res).toMatchObject({ scope: "local", total: 7, resultCount: 1 });
	expect(res.results[0]?.title).toBe("Ronja");
});
