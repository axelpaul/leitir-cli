// ─── API Response Wrappers ──────────────────────────────────────

export interface AlmaResponse<T> {
	status: string;
	"reply-code": string;
	"reply-text": string;
	data: T;
}

// ─── Auth ───────────────────────────────────────────────────────

export interface LoginResponse {
	jwtData: string;
}

export interface CachedToken {
	jwt: string;
	expiresAt: number;
}

// ─── Loans ──────────────────────────────────────────────────────

export interface Loan {
	mmsid: string;
	title: string;
	callnumber: string;
	author: string;
	duedate: string;
	itemid: string;
	loanid: string;
	itembarcode: string;
	loandate: string;
	loanstatus: string;
	maxrenewdate?: string;
	lastrenewdate?: string;
	renew: "Y" | "N";
	itemcategoryname: string;
	mainlocationname: string;
	secondarylocationname: string;
	year: string;
	alerts: unknown[];
}

export interface LoansData {
	loans: { loan: Loan[] };
}

// ─── Fines ──────────────────────────────────────────────────────

export interface Fine {
	title: string;
	finesum: string;
	originalfinesum: string;
	finedate: string;
	finemainlocation: string;
	fineid: string;
	finestatus: string;
	type: string;
	description: string;
	isAlert: boolean;
}

export interface FinesData {
	fines: { fine: Fine[] };
}

// ─── Requests / Holds ───────────────────────────────────────────

export interface Hold {
	holdstatus: string;
	mmsid: string;
	title: string;
	author?: string;
	requestdate: string;
	cancel: "Y" | "N";
	pickuplocationname: string;
	available: "Y" | "N";
	requestid: string;
}

export interface RequestsData {
	holds: { hold: Hold[] };
	photocopies: { photocopy: unknown[] };
	bookings: { booking: unknown[] };
	ills: { ill: unknown[] };
}

// ─── Counters ───────────────────────────────────────────────────

export interface Counter {
	type: string;
	value: string;
}

export interface CountersData {
	listofactions: { action: Counter[] };
}

// ─── Personal Settings ──────────────────────────────────────────

export interface SettingsField {
	maxlen: string;
	uimandatory: string;
	usage: string;
	value: string;
}

export interface PersonalSettings {
	editable: string;
	email: SettingsField;
	city: SettingsField;
	address1: SettingsField;
	zip: SettingsField;
	telephone1: SettingsField;
}

// ─── Search ─────────────────────────────────────────────────────

export interface SearchInfo {
	totalResultsLocal: number;
	totalResultsPC: number;
	total: number;
	first: number;
	last: number;
}

export interface SearchDoc {
	pnx: {
		display: {
			title?: string[];
			creator?: string[];
			type?: string[];
			publisher?: string[];
			creationdate?: string[];
			description?: string[];
			language?: string[];
			subject?: string[];
			identifier?: string[];
		};
		search: {
			recordid?: string[];
			rsrctype?: string[];
			scope?: string[];
		};
		control: {
			recordid?: string[];
			sourceid?: string[];
		};
	};
	context: string;
	"@id"?: string;
}

export interface SearchResponse {
	info: SearchInfo;
	docs: SearchDoc[];
}

export interface SuggestResponse {
	response: {
		docs: { text: string }[];
	};
}
