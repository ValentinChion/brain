import {homedir} from 'node:os';
import {join} from 'node:path';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	renameSync,
	chmodSync,
	rmSync,
} from 'node:fs';
import type {Item, Note, GoogleToken} from './types.ts';

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

// token OAuth Google — fichier séparé, permissions restreintes (chmod 600)
const TOKEN_FILE = 'google-token.json';

export function loadToken(): GoogleToken | null {
	const path = join(brainDir(), TOKEN_FILE);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(
			readFileSync(path, 'utf8'),
		) as Partial<GoogleToken>;
		if (typeof parsed.refreshToken === 'string') return parsed as GoogleToken;
		return null;
	} catch {
		// token illisible → traité comme « non connecté », sans planter ni écraser
		return null;
	}
}

export function saveToken(token: GoogleToken): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `${TOKEN_FILE}.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(token, null, 2), {mode: 0o600});
	const dest = join(dir, TOKEN_FILE);
	renameSync(tmp, dest); // atomique sur le même volume
	chmodSync(dest, 0o600);
}

export function clearToken(): void {
	const path = join(brainDir(), TOKEN_FILE);
	if (existsSync(path)) rmSync(path);
}

// ids des réunions déjà débriefées/skippées (anti re-déclenchement)
export function loadHandled(): string[] {
	return loadArray<string>('debriefed.json').data;
}

export function saveHandled(ids: string[]): void {
	saveArray('debriefed.json', ids);
}
