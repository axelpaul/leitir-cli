import { LeitirClient } from "../lib/client.ts";
import { clearToken, saveToken } from "../lib/config.ts";
import { jsonMode, log, output } from "../lib/output.ts";

export async function login(username: string, password: string): Promise<void> {
	const client = new LeitirClient();
	const jwt = await client.login(username, password);
	saveToken(jwt);

	if (jsonMode) {
		output({ ok: true, message: "Logged in" });
	} else {
		log("Logged in successfully. Token cached to ~/.leitir/token.json");
	}
}

export function logout(): void {
	clearToken();
	if (jsonMode) {
		output({ ok: true, message: "Logged out" });
	} else {
		log("Logged out. Token removed.");
	}
}
