import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../src/mcp/server.ts";

const READ_TOOLS = ["account", "fines", "loans", "profile", "requests", "search", "suggest"];
const WRITE_TOOLS = ["cancel_request", "renew_all_loans", "renew_loan"];

let configHome: string;
const savedEnv = { ...process.env };

beforeEach(() => {
	// Isolate from any real login on this machine
	configHome = mkdtempSync(join(tmpdir(), "leitir-test-"));
	process.env.XDG_CONFIG_HOME = configHome;
	process.env.HOME = configHome;
	delete process.env.LEITIR_TOKEN;
});

afterEach(() => {
	process.env = { ...savedEnv };
	rmSync(configHome, { recursive: true, force: true });
});

async function connect(enableWrites: boolean) {
	const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
	await createServer({ enableWrites }).connect(serverTransport);
	const client = new Client({ name: "leitir-test", version: "0.0.0" });
	await client.connect(clientTransport);
	return client;
}

const text = (res: Awaited<ReturnType<Client["callTool"]>>) =>
	(res.content as { type: string; text: string }[])[0]?.text ?? "";

test("read-only by default: write tools are hidden", async () => {
	const client = await connect(false);
	const names = (await client.listTools()).tools.map((t) => t.name).sort();
	expect(names).toEqual(READ_TOOLS);
	await client.close();
});

test("write tools appear when enabled", async () => {
	const client = await connect(true);
	const names = (await client.listTools()).tools.map((t) => t.name).sort();
	expect(names).toEqual([...READ_TOOLS, ...WRITE_TOOLS].sort());
	await client.close();
});

test("write tools require confirm=true", async () => {
	const client = await connect(true);
	for (const args of [{ id_or_title: "123" }, { id_or_title: "123", confirm: false }]) {
		const res = await client.callTool({ name: "renew_loan", arguments: args });
		expect(res.isError).toBe(true);
	}
	const all = await client.callTool({ name: "renew_all_loans", arguments: {} });
	expect(all.isError).toBe(true);
	await client.close();
});

test("authenticated tools fail cleanly without a login", async () => {
	const client = await connect(true);
	for (const name of ["loans", "requests", "fines", "account", "profile"]) {
		const res = await client.callTool({ name, arguments: {} });
		expect(res.isError).toBe(true);
		expect(text(res)).toContain("Not authenticated");
	}
	const res = await client.callTool({
		name: "cancel_request",
		arguments: { id_or_title: "123", confirm: true },
	});
	expect(res.isError).toBe(true);
	expect(text(res)).toContain("Not authenticated");
	await client.close();
});

test("search validates input", async () => {
	const client = await connect(false);
	const empty = await client.callTool({ name: "search", arguments: { query: "" } });
	expect(empty.isError).toBe(true);
	const badSort = await client.callTool({
		name: "search",
		arguments: { query: "x", sort: "nope" },
	});
	expect(badSort.isError).toBe(true);
	await client.close();
});

test("`leitir serve` speaks MCP over stdio", async () => {
	const client = new Client({ name: "leitir-test", version: "0.0.0" });
	try {
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: ["src/index.ts", "serve"],
				cwd: join(import.meta.dir, ".."),
				env: { PATH: process.env.PATH ?? "", HOME: configHome, XDG_CONFIG_HOME: configHome },
				stderr: "pipe",
			}),
		);
		const names = (await client.listTools()).tools.map((t) => t.name).sort();
		expect(names).toEqual(READ_TOOLS);
	} finally {
		await client.close();
	}
});
