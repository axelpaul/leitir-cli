import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CachedToken } from "./types.ts";

/** `$XDG_CONFIG_HOME/leitir-cli` (default `~/.config/leitir-cli`). */
export function configDir(): string {
	const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "leitir-cli");
}

export function tokenPath(): string {
	return join(configDir(), "token.json");
}

/** Pre-0.2 location; still read (never written) so existing logins keep working. */
function legacyTokenPath(): string {
	return join(homedir(), ".leitir", "token.json");
}

export function saveToken(jwt: string): void {
	const dir = configDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
	// Alma JWTs have a 24h lifetime by default
	const token: CachedToken = {
		jwt,
		expiresAt: Date.now() + 23 * 60 * 60 * 1000,
	};
	writeFileSync(tokenPath(), JSON.stringify(token), { mode: 0o600 });
	chmodSync(tokenPath(), 0o600);
}

export function loadToken(): CachedToken | null {
	for (const path of [tokenPath(), legacyTokenPath()]) {
		if (!existsSync(path)) continue;
		try {
			return JSON.parse(readFileSync(path, "utf-8")) as CachedToken;
		} catch {}
	}
	return null;
}

export function clearToken(): void {
	for (const path of [tokenPath(), legacyTokenPath()]) {
		if (existsSync(path)) unlinkSync(path);
	}
}

export function requireAuth(): CachedToken {
	// 1. Check LEITIR_TOKEN env var first (for agents / CI)
	const envToken = process.env.LEITIR_TOKEN;
	if (envToken) {
		return { jwt: envToken, expiresAt: Number.MAX_SAFE_INTEGER };
	}

	// 2. Fall back to cached file token
	const token = loadToken();
	if (!token) {
		throw new AuthError('Not authenticated. Run "leitir login" or set LEITIR_TOKEN env var.');
	}
	if (Date.now() >= token.expiresAt) {
		clearToken();
		throw new AuthError('Token expired. Run "leitir login" again.');
	}
	return token;
}

export class AuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuthError";
	}
}
