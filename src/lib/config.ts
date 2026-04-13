import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CachedToken } from "./types.ts";

const CONFIG_DIR = join(homedir(), ".leitir");
const TOKEN_PATH = join(CONFIG_DIR, "token.json");

function ensureDir(): void {
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, { recursive: true });
	}
}

export function saveToken(jwt: string): void {
	ensureDir();
	// Alma JWTs have a 24h lifetime by default
	const token: CachedToken = {
		jwt,
		expiresAt: Date.now() + 23 * 60 * 60 * 1000,
	};
	writeFileSync(TOKEN_PATH, JSON.stringify(token));
}

export function loadToken(): CachedToken | null {
	if (!existsSync(TOKEN_PATH)) return null;
	try {
		return JSON.parse(readFileSync(TOKEN_PATH, "utf-8")) as CachedToken;
	} catch {
		return null;
	}
}

export function clearToken(): void {
	if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH);
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
