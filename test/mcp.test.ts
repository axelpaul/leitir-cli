import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("read-only MCP server handshakes and rejects invalid search input", async () => {
	const client = new Client({ name: "leitir-test", version: "0.1.0" });
	try {
		await client.connect(new StdioClientTransport({ command: process.execPath, args: ["src/index.ts", "serve"], cwd: process.cwd(), stderr: "pipe" }));
		const tools = (await client.listTools()).tools;
		expect(tools.map(tool => tool.name).sort()).toEqual(["loans", "requests", "search"]);
		const invalid = await client.callTool({ name: "search", arguments: { query: "", limit: 10 } });
		expect(invalid.isError).toBe(true);
	} finally {
		await client.close();
	}
});
