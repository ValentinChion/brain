import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, readFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Item, Note} from '../src/core/types.ts';

const withDir = async (fn: (dir: string) => Promise<void>) => {
	const dir = mkdtempSync(join(tmpdir(), 'brain-'));
	process.env.BRAIN_DIR = dir;
	try {
		await fn(dir);
	} finally {
		delete process.env.BRAIN_DIR;
	}
};

const item: Item = {
	id: 'a',
	text: 't',
	createdAt: '2026-01-01T00:00:00.000Z',
	remindOn: null,
	done: false,
	doneAt: null,
};

test("load renvoie [] quand le fichier n'existe pas", async () => {
	await withDir(async () => {
		const {load} = await import(`../src/core/storage.ts?${Math.random()}`);
		assert.deepEqual(load(), {items: [], error: null});
	});
});

test('save puis load fait un aller-retour fidèle et crée le dossier', async () => {
	await withDir(async dir => {
		const {save, load} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		save([item]);
		assert.ok(existsSync(join(dir, 'tasks.json')));
		assert.deepEqual(load().items, [item]);
	});
});

test("un JSON corrompu ne plante pas et n'est PAS écrasé", async () => {
	await withDir(async dir => {
		const {load} = await import(`../src/core/storage.ts?${Math.random()}`);
		const path = join(dir, 'tasks.json');
		writeFileSync(path, '{ pas du json');
		const res = load();
		assert.equal(res.items.length, 0);
		assert.ok(res.error);
		assert.equal(readFileSync(path, 'utf8'), '{ pas du json'); // intact
	});
});

const note: Note = {
	id: 'n',
	text: 'kubectl restart',
	createdAt: '2026-07-01T00:00:00.000Z',
	pinned: false,
};

test('saveNotes puis loadNotes : aller-retour fidèle, dossier créé', async () => {
	await withDir(async dir => {
		const {saveNotes, loadNotes} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		saveNotes([note]);
		assert.ok(existsSync(join(dir, 'notes.json')));
		assert.deepEqual(loadNotes().notes, [note]);
	});
});

test('notes.json corrompu : pas de crash, pas écrasé', async () => {
	await withDir(async dir => {
		const {loadNotes} = await import(`../src/core/storage.ts?${Math.random()}`);
		const path = join(dir, 'notes.json');
		writeFileSync(path, '{ pas du json');
		const res = loadNotes();
		assert.equal(res.notes.length, 0);
		assert.ok(res.error);
		assert.equal(readFileSync(path, 'utf8'), '{ pas du json'); // intact
	});
});
