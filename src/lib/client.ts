import type {
	AlmaResponse,
	CountersData,
	FinesData,
	LoansData,
	LoginResponse,
	PersonalSettings,
	RequestsData,
	SearchResponse,
	SuggestResponse,
} from "./types.ts";

const BASE_URL = "https://leitir.is";
const INSTITUTION = "354ILC_ALM";
const VIEW = "354ILC_ALM:10000_UNION";
const SEARCH_INSTITUTION = "354ILC_NETWORK";
const SEARCH_VIEW = "354ILC_NETWORK:10000_UNION";
const LANG = "is";

export class ApiError extends Error {
	constructor(
		message: string,
		public status: number,
	) {
		super(message);
	}
}

export class LeitirClient {
	private token: string | null;

	constructor(token?: string) {
		this.token = token ?? null;
	}

	private authHeaders(): Record<string, string> {
		if (!this.token) throw new ApiError("Not authenticated", 401);
		return {
			Authorization: `Bearer ${this.token}`,
			Accept: "application/json",
		};
	}

	private async request<T>(method: string, path: string, opts?: {
		headers?: Record<string, string>;
		body?: string;
		contentType?: string;
	}): Promise<T> {
		const url = `${BASE_URL}${path}`;
		const headers: Record<string, string> = {
			Accept: "application/json",
			...opts?.headers,
		};
		if (opts?.contentType) {
			headers["Content-Type"] = opts.contentType;
		}
		const res = await fetch(url, {
			method,
			headers,
			body: opts?.body,
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new ApiError(`${method} ${path}: ${res.status} ${text}`, res.status);
		}
		return res.json() as Promise<T>;
	}

	// ─── Auth ─────────────────────────────────────────────────────

	async login(username: string, password: string): Promise<string> {
		const body = new URLSearchParams({
			authenticationProfile: "Alma",
			username,
			password,
			institution: INSTITUTION,
			view: VIEW,
		}).toString();

		const data = await this.request<LoginResponse>(
			"POST",
			`/primaws/suprimaLogin?lang=${LANG}`,
			{
				body,
				contentType: "application/x-www-form-urlencoded; charset=UTF-8",
			},
		);

		if (!data.jwtData) {
			throw new ApiError("Login succeeded but no JWT returned", 500);
		}

		// JWT comes wrapped in quotes: "\"eyJ...\""
		const jwt = data.jwtData.replace(/^"|"$/g, "");
		this.token = jwt;
		return jwt;
	}

	// ─── Account ──────────────────────────────────────────────────

	async getCounters(): Promise<AlmaResponse<CountersData>> {
		return this.request("GET", `/primaws/rest/priv/myaccount/counters?lang=${LANG}`, {
			headers: this.authHeaders(),
		});
	}

	async getLoans(): Promise<AlmaResponse<LoansData>> {
		return this.request(
			"GET",
			`/primaws/rest/priv/myaccount/loans?bulk=50&lang=${LANG}&offset=1&type=active`,
			{ headers: this.authHeaders() },
		);
	}

	async renewLoan(loanId: string): Promise<unknown> {
		return this.request("POST", `/primaws/rest/priv/myaccount/renew_loans?lang=${LANG}`, {
			headers: this.authHeaders(),
			body: JSON.stringify({ id: loanId }),
			contentType: "application/json",
		});
	}

	async renewAllLoans(): Promise<unknown> {
		return this.request("GET", `/primaws/rest/priv/myaccount/renew_all_loans?lang=${LANG}`, {
			headers: this.authHeaders(),
		});
	}

	async getRequests(): Promise<AlmaResponse<RequestsData>> {
		return this.request(
			"GET",
			`/primaws/rest/priv/myaccount/requests?lang=${LANG}&vid=${VIEW}`,
			{ headers: this.authHeaders() },
		);
	}

	async cancelRequest(requestId: string): Promise<unknown> {
		return this.request("POST", `/primaws/rest/priv/myaccount/cancel_requests?lang=${LANG}`, {
			headers: this.authHeaders(),
			body: JSON.stringify({ id: requestId }),
			contentType: "application/json",
		});
	}

	async getFines(): Promise<AlmaResponse<FinesData>> {
		return this.request(
			"GET",
			`/primaws/rest/priv/myaccount/fines?lang=${LANG}&vid=${VIEW}`,
			{ headers: this.authHeaders() },
		);
	}

	async getPersonalSettings(): Promise<{ data: PersonalSettings }> {
		return this.request(
			"GET",
			`/primaws/rest/priv/myaccount/personal_settings?lang=${LANG}`,
			{ headers: this.authHeaders() },
		);
	}

	// ─── Search ───────────────────────────────────────────────────

	async search(query: string, opts?: {
		limit?: number;
		offset?: number;
		sort?: string;
		scope?: string;
		tab?: string;
		local?: boolean;
	}): Promise<SearchResponse> {
		// Default to local Icelandic library holdings, use --global for Primo Central
		const isLocal = opts?.local ?? true;
		const scope = opts?.scope ?? (isLocal ? "10000_MYLIB" : "CONSORTIUM");
		const tab = opts?.tab ?? (isLocal ? "MyLibrary" : "Consortium");

		const params = new URLSearchParams({
			q: `any,contains,${query}`,
			vid: SEARCH_VIEW,
			inst: SEARCH_INSTITUTION,
			lang: LANG,
			limit: String(opts?.limit ?? 10),
			offset: String(opts?.offset ?? 0),
			sort: opts?.sort ?? "rank",
			scope,
			tab,
			pcAvailability: "false",
			isCDSearch: "false",
			getMore: "0",
			skipDelivery: "Y",
			disableCache: "false",
		});
		const headers = this.token ? this.authHeaders() : { Accept: "application/json" };
		return this.request("GET", `/primaws/rest/pub/pnxs?${params}`, { headers });
	}

	async suggest(query: string): Promise<SuggestResponse> {
		const params = new URLSearchParams({
			q: query,
			lang: LANG,
			vid: VIEW,
			scope: "CONSORTIUM",
		});
		return this.request("GET", `/primaws/rest/pub/suggest?${params}`);
	}
}
