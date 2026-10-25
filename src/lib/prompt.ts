/** Minimal interactive prompts on stderr (stdout stays clean for JSON output). */
import { createInterface } from "node:readline/promises";

export async function promptLine(question: string): Promise<string> {
	if (!process.stdin.isTTY) return "";
	const rl = createInterface({ input: process.stdin, output: process.stderr });
	try {
		return (await rl.question(question)).trim();
	} finally {
		rl.close();
	}
}

export async function promptHidden(question: string): Promise<string> {
	const stdin = process.stdin;
	if (!stdin.isTTY) return "";
	process.stderr.write(question);
	stdin.setRawMode(true);
	stdin.resume();
	stdin.setEncoding("utf8");
	return new Promise((resolve) => {
		let value = "";
		const onData = (chunk: string) => {
			for (const ch of chunk) {
				if (ch === "\r" || ch === "\n" || ch === "\u0004") {
					stdin.setRawMode(false);
					stdin.pause();
					stdin.off("data", onData);
					process.stderr.write("\n");
					resolve(value);
					return;
				}
				if (ch === "\u0003") {
					stdin.setRawMode(false);
					process.stderr.write("\n");
					process.exit(130);
				}
				if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
				else value += ch;
			}
		};
		stdin.on("data", onData);
	});
}
