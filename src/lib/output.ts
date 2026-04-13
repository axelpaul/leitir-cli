const args = process.argv.slice(2);

export const jsonMode =
	args.includes("--json") || (!process.stdout.isTTY && !args.includes("--pretty"));

export function output(data: unknown): void {
	console.log(JSON.stringify(data, null, jsonMode ? undefined : 2));
}

// Exit codes: 1=general, 2=auth, 3=not found, 4=api error
export function outputError(message: string, exitCode = 1): never {
	if (jsonMode) {
		console.error(JSON.stringify({ error: message, exitCode }));
	} else {
		console.error(`Error: ${message}`);
	}
	process.exit(exitCode);
}

export function log(message: string): void {
	if (!jsonMode) {
		console.log(message);
	}
}

export function formatDate(yyyymmdd: string): string {
	if (yyyymmdd.length !== 8) return yyyymmdd;
	return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function daysUntil(yyyymmdd: string): number {
	const year = Number.parseInt(yyyymmdd.slice(0, 4));
	const month = Number.parseInt(yyyymmdd.slice(4, 6)) - 1;
	const day = Number.parseInt(yyyymmdd.slice(6, 8));
	const due = new Date(year, month, day);
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
