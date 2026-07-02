export type Item = {
	id: string; // crypto.randomUUID()
	text: string;
	createdAt: string; // ISO 8601
	remindOn: string | null; // "AAAA-MM-JJ" ou null
	done: boolean;
	doneAt: string | null; // ISO 8601, quand cochée
};
