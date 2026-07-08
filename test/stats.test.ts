import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Item, JournalEvent, Note} from '../src/core/types.ts';
import {computeStats} from '../src/core/stats.ts';
import {addDays} from '../src/core/date.ts';

const T = '2026-07-08'; // mercredi

const ev = (t: JournalEvent['t'], d: string): JournalEvent => ({t, d});
const stats = (
	events: JournalEvent[],
	items: Item[] = [],
	notes: Note[] = [],
) => computeStats(events, items, notes, T);

const item = (over: Partial<Item>): Item => ({
	id: 'x',
	text: 't',
	createdAt: '2026-07-01T00:00:00.000Z',
	remindOn: null,
	done: false,
	doneAt: null,
	...over,
});

const note = (pinned = false): Note => ({
	id: 'n',
	text: 'n',
	createdAt: '2026-07-01T00:00:00.000Z',
	pinned,
});

// --- streak (avec grâce) ---

test('streak : jours consécutifs jusqu’à aujourd’hui', () => {
	const s = stats([
		ev('task', T),
		ev('note', addDays(T, -1)),
		ev('task', addDays(T, -2)),
	]);
	assert.equal(s.streak, 3);
});

test('streak : grâce — rien aujourd’hui, la série d’hier tient encore', () => {
	const s = stats([ev('task', addDays(T, -1)), ev('task', addDays(T, -2))]);
	assert.equal(s.streak, 2);
});

test('streak : rien aujourd’hui ni hier → 0', () => {
	const s = stats([ev('task', addDays(T, -2))]);
	assert.equal(s.streak, 0);
});

// --- heatmap étagée ---

test('heatmap : < 4 semaines de données → bande, terminée aujourd’hui', () => {
	const s = stats([ev('task', addDays(T, -10))]);
	assert.equal(s.heatmap.kind, 'band');
	if (s.heatmap.kind === 'band') {
		assert.equal(s.heatmap.cells.length, 11); // de la plus vieille date à aujourd’hui
		assert.equal(s.heatmap.cells.at(-1)?.d, T);
	}
});

test('heatmap : bande d’au moins 7 jours même avec un seul jour de données', () => {
	const s = stats([ev('task', T)]);
	assert.equal(s.heatmap.kind, 'band');
	if (s.heatmap.kind === 'band') assert.equal(s.heatmap.cells.length, 7);
});

test('heatmap : 4 semaines de données → grille 4 semaines', () => {
	const s = stats([ev('task', addDays(T, -27))]); // 28 jours de données
	assert.equal(s.heatmap.kind, 'grid');
	if (s.heatmap.kind === 'grid') assert.equal(s.heatmap.weeks.length, 4);
});

test('heatmap : 12 semaines de données → grille 12 semaines', () => {
	const s = stats([ev('task', addDays(T, -83))]); // 84 jours de données
	assert.equal(s.heatmap.kind, 'grid');
	if (s.heatmap.kind === 'grid') assert.equal(s.heatmap.weeks.length, 12);
});

test('heatmap grille : semaine lun→dim, cellules futures à null', () => {
	const s = stats([ev('task', addDays(T, -30))]);
	assert.equal(s.heatmap.kind, 'grid');
	if (s.heatmap.kind === 'grid') {
		const last = s.heatmap.weeks.at(-1)!;
		assert.equal(last[2]?.d, T); // 2026-07-08 est un mercredi (index 2, 0 = lundi)
		assert.deepEqual(last.slice(3), [null, null, null, null]);
	}
});

test('heatmap : bucketing par jour et paliers d’intensité (1–5, plafonné)', () => {
	const s = stats([
		ev('task', T),
		ev('note', T),
		...Array.from({length: 7}, () => ev('task', addDays(T, -1))),
	]);
	if (s.heatmap.kind === 'band') {
		const today = s.heatmap.cells.at(-1)!;
		const yesterday = s.heatmap.cells.at(-2)!;
		assert.deepEqual(
			{count: today.count, level: today.level},
			{count: 2, level: 2},
		);
		assert.deepEqual(
			{count: yesterday.count, level: yesterday.level},
			{count: 7, level: 5},
		);
		assert.equal(s.heatmap.cells[0]?.level, 0); // jour vide
	}
});

// --- flux 7 jours glissants ---

test('flux : fenêtre de 7 jours, netting done − undone borné à 0', () => {
	const s = stats([
		ev('task', addDays(T, -7)), // hors fenêtre
		ev('task', T),
		ev('note', T),
		ev('done', T),
		ev('done', addDays(T, -1)),
		ev('undone', addDays(T, -1)),
		ev('undone', addDays(T, -2)), // undone seul → borné à 0, pas -1
	]);
	assert.equal(s.flux.days.length, 7);
	assert.equal(s.flux.captured, 2);
	assert.equal(s.flux.finished, 1); // 1 (aujourd’hui) + 0 (hier netté) + 0 (borné)
	assert.equal(s.flux.delta, 1);
	assert.deepEqual(s.flux.days.at(-1), {d: T, captured: 2, finished: 1});
});

// --- totaux héros ---

test('totaux : captées, finies (nettées, bornées), mondes', () => {
	const s = stats(
		[
			ev('task', T),
			ev('note', T),
			ev('done', T),
			ev('undone', T),
			ev('undone', T),
		],
		[item({}), item({id: 'y', done: true, doneAt: '2026-07-02T00:00:00.000Z'})],
		[note(), note(true)],
	);
	assert.equal(s.captured, 2);
	assert.equal(s.finished, 0); // 1 done − 2 undone → borné
	assert.deepEqual(s.worlds, {openTasks: 1, notes: 2, pinned: 1});
});

// --- digestion (médiane) ---

test('médiane de digestion : capture → done, en jours', () => {
	const s = stats(
		[],
		[
			item({
				id: 'a',
				done: true,
				createdAt: '2026-07-01T00:00:00.000Z',
				doneAt: '2026-07-03T00:00:00.000Z',
			}),
			item({
				id: 'b',
				done: true,
				createdAt: '2026-07-01T00:00:00.000Z',
				doneAt: '2026-07-05T00:00:00.000Z',
			}),
			item({id: 'c'}), // ouverte : ignorée
		],
	);
	assert.equal(s.medianLifeDays, 3); // médiane de [2, 4]
});

// --- records ---

test('records : meilleur jour, plus longue série, plus vieille close', () => {
	const s = stats(
		[
			ev('task', addDays(T, -10)),
			ev('task', addDays(T, -9)),
			ev('task', addDays(T, -9)),
			ev('task', addDays(T, -8)),
			ev('note', T),
		],
		[
			item({
				id: 'a',
				done: true,
				createdAt: '2026-06-01T00:00:00.000Z',
				doneAt: '2026-07-01T00:00:00.000Z',
			}),
		],
	);
	assert.deepEqual(s.records.bestDay, {d: addDays(T, -9), count: 2});
	assert.equal(s.records.longestStreak, 3);
	assert.equal(s.records.oldestClosedDays, 30);
});

// --- données vides (installation fraîche) ---

test('données vides : zéros, bande estompée, médiane et records à null', () => {
	const s = stats([]);
	assert.equal(s.streak, 0);
	assert.equal(s.captured, 0);
	assert.equal(s.finished, 0);
	assert.equal(s.heatmap.kind, 'band');
	if (s.heatmap.kind === 'band') {
		assert.equal(s.heatmap.cells.length, 7);
		assert.ok(s.heatmap.cells.every(c => c.level === 0));
	}

	assert.equal(s.flux.delta, 0);
	assert.equal(s.medianLifeDays, null);
	assert.deepEqual(s.records, {
		bestDay: null,
		longestStreak: 0,
		oldestClosedDays: null,
	});
});
