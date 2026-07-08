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

test('saveHandled puis loadHandled : aller-retour', async () => {
	await withDir(async () => {
		const {saveHandled, loadHandled} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		saveHandled(['a', 'b']);
		assert.deepEqual(loadHandled(), ['a', 'b']);
	});
});

test('loadHandled : [] si absent ou corrompu', async () => {
	await withDir(async dir => {
		const {loadHandled} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		assert.deepEqual(loadHandled(), []);
		writeFileSync(join(dir, 'debriefed.json'), '{ pas du json');
		assert.deepEqual(loadHandled(), []);
	});
});

test('saveAzureToken puis loadAzureToken : aller-retour, fichier séparé', async () => {
	await withDir(async dir => {
		const {saveAzureToken, loadAzureToken} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		const token = {
			refreshToken: 'r',
			accessToken: 'a',
			expiresAt: '2026-07-07T00:00:00.000Z',
		};
		saveAzureToken(token);
		assert.ok(existsSync(join(dir, 'azure-token.json')));
		assert.deepEqual(loadAzureToken(), token);
	});
});

test('saveMeta puis loadMeta : aller-retour ; {} si absent ou corrompu', async () => {
	await withDir(async dir => {
		const {loadMeta, saveMeta} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		assert.deepEqual(loadMeta(), {});
		saveMeta({lastSeenVersion: '0.1.0'});
		assert.deepEqual(loadMeta(), {lastSeenVersion: '0.1.0'});
		writeFileSync(join(dir, 'meta.json'), '{ pas du json');
		assert.deepEqual(loadMeta(), {});
	});
});

// --- journal append-only (source de /stats) ---

test('appendJournal puis readJournal : aller-retour, dossier créé', async () => {
	await withDir(async dir => {
		const {appendJournal, readJournal} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		appendJournal({t: 'task', d: '2026-07-08'});
		appendJournal({t: 'done', d: '2026-07-08'});
		assert.ok(existsSync(join(dir, 'journal.jsonl')));
		assert.deepEqual(readJournal(), [
			{t: 'task', d: '2026-07-08'},
			{t: 'done', d: '2026-07-08'},
		]);
	});
});

test('readJournal : [] si absent ; lignes corrompues ignorées', async () => {
	await withDir(async dir => {
		const {readJournal} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		assert.deepEqual(readJournal(), []);
		writeFileSync(
			join(dir, 'journal.jsonl'),
			'{"t":"task","d":"2026-07-01"}\npas du json\n{"t":"zap","d":"x"}\n\n{"t":"note","d":"2026-07-02"}\n',
		);
		assert.deepEqual(readJournal(), [
			{t: 'task', d: '2026-07-01'},
			{t: 'note', d: '2026-07-02'},
		]);
	});
});

test('backfillJournal : reconstruit depuis tâches + notes, idempotent', async () => {
	await withDir(async () => {
		const {backfillJournal, readJournal, appendJournal} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		const closed: Item = {
			...item,
			id: 'b',
			done: true,
			doneAt: '2026-07-05T10:00:00.000Z',
		};
		backfillJournal([item, closed], [note]);
		const events = readJournal();
		assert.equal(events.length, 4); // 2 tâches + 1 done + 1 note
		assert.equal(events.filter((e: {t: string}) => e.t === 'task').length, 2);
		assert.equal(events.filter((e: {t: string}) => e.t === 'done').length, 1);
		assert.equal(events.filter((e: {t: string}) => e.t === 'note').length, 1);
		// idempotent : un journal existant n'est jamais régénéré ni écrasé
		appendJournal({t: 'task', d: '2026-07-08'});
		backfillJournal([item, closed], [note]);
		assert.equal(readJournal().length, 5);
	});
});

test('backfillJournal sans données : journal vide créé (bloque le re-backfill)', async () => {
	await withDir(async dir => {
		const {backfillJournal, readJournal} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		backfillJournal([], []);
		assert.ok(existsSync(join(dir, 'journal.jsonl')));
		assert.deepEqual(readJournal(), []);
	});
});

test('loadAzureToken : null si absent ou corrompu ; clearAzureToken supprime', async () => {
	await withDir(async dir => {
		const {loadAzureToken, saveAzureToken, clearAzureToken} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		assert.equal(loadAzureToken(), null);
		writeFileSync(join(dir, 'azure-token.json'), '{ pas du json');
		assert.equal(loadAzureToken(), null);
		saveAzureToken({refreshToken: 'r', accessToken: 'a', expiresAt: 'x'});
		clearAzureToken();
		assert.equal(loadAzureToken(), null);
	});
});
