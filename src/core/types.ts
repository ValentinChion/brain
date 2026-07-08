export type Item = {
	id: string; // crypto.randomUUID()
	text: string;
	createdAt: string; // ISO 8601
	remindOn: string | null; // "AAAA-MM-JJ" ou null
	done: boolean;
	doneAt: string | null; // ISO 8601, quand cochée
	source?: string;
};

export type Note = {
	id: string; // crypto.randomUUID()
	text: string; // peut contenir des "\n"
	createdAt: string; // ISO 8601 — base de la péremption
	pinned: boolean;
	source?: string;
};

// une ligne du journal append-only (~/.brain/journal.jsonl) — la source de /stats
export type JournalEvent = {
	t: 'task' | 'note' | 'done' | 'undone';
	d: string; // "AAAA-MM-JJ" (jour local)
};

export type OAuthToken = {
	refreshToken: string;
	accessToken: string;
	expiresAt: string; // ISO 8601
};

// alias historique — google-auth/google-client l'importent déjà
export type GoogleToken = OAuthToken;

export type Meeting = {
	id: string;
	title: string;
	start: string; // ISO 8601
	end: string; // ISO 8601
	debriefable: boolean;
};
