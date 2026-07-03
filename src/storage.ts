import {homedir} from 'node:os';
import {join} from 'node:path';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
	renameSync,
} from 'node:fs';
import type {Item} from './types.ts';

export function brainDir(): string {
	return process.env.BRAIN_DIR ?? join(homedir(), '.brain');
}

function filePath(): string {
	return join(brainDir(), 'tasks.json');
}

export function load(): {items: Item[]; error: string | null} {
	const path = filePath();
	if (!existsSync(path)) return {items: [], error: null};
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		if (!Array.isArray(parsed)) throw new Error('racine non-tableau');
		return {items: parsed as Item[], error: null};
	} catch (e) {
		// ponytail: on ne réécrit pas par-dessus un fichier corrompu, on repart vide en mémoire
		return {
			items: [],
			error: `Fichier illisible (${(e as Error).message}) — non modifié.`,
		};
	}
}

export function save(items: Item[]): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `tasks.json.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(items, null, 2));
	renameSync(tmp, filePath()); // atomique sur le même volume
}
