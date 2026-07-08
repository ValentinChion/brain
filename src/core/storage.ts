import {homedir} from 'node:os';
import {join} from 'node:path';
import {
	appendFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	renameSync,
	chmodSync,
	rmSync,
} from 'node:fs';
import type {Item, JournalEvent, Note, OAuthToken} from './types.ts';
import {todayYMD} from './date.ts';

// défaut : `~/.brain` (dossier maison) → même emplacement quel que soit le mode
// de lancement (dev, `npm link`, install globale). Surchargeable via BRAIN_DIR
// (ex. `BRAIN_DIR=$PWD/.brain npm start` pour des données locales au repo en dev).
export function brainDir(): string {
	return process.env.BRAIN_DIR ?? join(homedir(), '.brain');
}

// ponytail: cœur générique — même logique atomique + anti-corruption pour tasks.json et notes.json
function loadArray<T>(file: string): {data: T[]; error: string | null} {
	const path = join(brainDir(), file);
	if (!existsSync(path)) return {data: [], error: null};
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		if (!Array.isArray(parsed)) throw new Error('racine non-tableau');
		return {data: parsed as T[], error: null};
	} catch (e) {
		// on ne réécrit pas par-dessus un fichier corrompu, on repart vide en mémoire
		return {
			data: [],
			error: `Fichier illisible (${(e as Error).message}) — non modifié.`,
		};
	}
}

function saveArray<T>(file: string, data: T[]): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `${file}.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(data, null, 2));
	renameSync(tmp, join(dir, file)); // atomique sur le même volume
}

// tâches — signatures v1 inchangées (app.tsx ne bouge pas pour les tâches)
export function load(): {items: Item[]; error: string | null} {
	const {data, error} = loadArray<Item>('tasks.json');
	return {items: data, error};
}

export function save(items: Item[]): void {
	saveArray('tasks.json', items);
}

// notes
export function loadNotes(): {notes: Note[]; error: string | null} {
	const {data, error} = loadArray<Note>('notes.json');
	return {notes: data, error};
}

export function saveNotes(notes: Note[]): void {
	saveArray('notes.json', notes);
}

// tokens OAuth (Google, Azure) — un fichier chacun, permissions restreintes (chmod 600)
function loadTokenFile(file: string): OAuthToken | null {
	const path = join(brainDir(), file);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(
			readFileSync(path, 'utf8'),
		) as Partial<OAuthToken>;
		if (typeof parsed.refreshToken === 'string') return parsed as OAuthToken;
		return null;
	} catch {
		// token illisible → traité comme « non connecté », sans planter ni écraser
		return null;
	}
}

function saveTokenFile(file: string, token: OAuthToken): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `${file}.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(token, null, 2), {mode: 0o600});
	const dest = join(dir, file);
	renameSync(tmp, dest); // atomique sur le même volume
	chmodSync(dest, 0o600);
}

function clearTokenFile(file: string): void {
	const path = join(brainDir(), file);
	if (existsSync(path)) rmSync(path);
}

// Google — signatures inchangées
export const loadToken = (): OAuthToken | null =>
	loadTokenFile('google-token.json');
export const saveToken = (token: OAuthToken): void => {
	saveTokenFile('google-token.json', token);
};

export const clearToken = (): void => {
	clearTokenFile('google-token.json');
};

// Azure DevOps
export const loadAzureToken = (): OAuthToken | null =>
	loadTokenFile('azure-token.json');
export const saveAzureToken = (token: OAuthToken): void => {
	saveTokenFile('azure-token.json', token);
};

export const clearAzureToken = (): void => {
	clearTokenFile('azure-token.json');
};

// état applicatif hors données (ex. dernière version vue par l'utilisateur)
export type Meta = {lastSeenVersion?: string};

export function loadMeta(): Meta {
	const path = join(brainDir(), 'meta.json');
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
			return {};
		return parsed as Meta;
	} catch {
		// illisible → comme absent (on le réécrira proprement à la prochaine sauvegarde)
		return {};
	}
}

export function saveMeta(meta: Meta): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `meta.json.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(meta, null, 2));
	renameSync(tmp, join(dir, 'meta.json')); // atomique sur le même volume
}

// --- journal append-only (~/.brain/journal.jsonl) — la source de /stats.
// Une ligne JSON par événement ; on n'y réécrit ni ne supprime jamais :
// immunisé contre le ménage des notes et la touche `d`.

const JOURNAL = 'journal.jsonl';

export function appendJournal(event: JournalEvent): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	appendFileSync(join(dir, JOURNAL), JSON.stringify(event) + '\n');
}

const EVENT_TYPES = new Set(['task', 'note', 'done', 'undone']);

export function readJournal(): JournalEvent[] {
	const path = join(brainDir(), JOURNAL);
	if (!existsSync(path)) return [];
	const events: JournalEvent[] = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		try {
			const e = JSON.parse(line) as JournalEvent;
			if (EVENT_TYPES.has(e.t) && typeof e.d === 'string') events.push(e);
		} catch {
			// ligne corrompue → ignorée, le reste du journal reste lisible
		}
	}

	return events;
}

// Au démarrage, si le journal n'existe pas : reconstruction depuis les données
// existantes pour préserver l'historique. Écrit même un journal vide, sinon des
// captures appendées avant le premier /stats créeraient un journal partiel qui
// serait ensuite écrasé/complété à tort par un backfill tardif.
export function backfillJournal(items: Item[], notes: Note[]): void {
	const path = join(brainDir(), JOURNAL);
	if (existsSync(path)) return;
	const events: JournalEvent[] = [];
	for (const it of items) {
		events.push({t: 'task', d: todayYMD(new Date(it.createdAt))});
		if (it.doneAt) events.push({t: 'done', d: todayYMD(new Date(it.doneAt))});
	}

	for (const n of notes)
		events.push({t: 'note', d: todayYMD(new Date(n.createdAt))});
	events.sort((a, b) => a.d.localeCompare(b.d));
	mkdirSync(brainDir(), {recursive: true});
	writeFileSync(path, events.map(e => JSON.stringify(e) + '\n').join(''));
}

// ids des réunions déjà débriefées/skippées (anti re-déclenchement)
export function loadHandled(): string[] {
	return loadArray<string>('debriefed.json').data;
}

export function saveHandled(ids: string[]): void {
	saveArray('debriefed.json', ids);
}
