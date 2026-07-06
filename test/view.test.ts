import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Item} from '../src/core/types.ts';
import {isDue, buildView, windowView} from '../src/core/view.ts';

const mk = (over: Partial<Item>): Item => ({
	id: over.id ?? 'id',
	text: over.text ?? 't',
	createdAt: '2026-01-01T00:00:00.000Z',
	remindOn: over.remindOn ?? null,
	done: over.done ?? false,
	doneAt: over.doneAt ?? null,
});

test("isDue : rappel aujourd'hui ou passé = dû, futur ou null = non dû", () => {
	assert.equal(isDue(mk({remindOn: '2026-07-02'}), '2026-07-02'), true);
	assert.equal(isDue(mk({remindOn: '2026-07-01'}), '2026-07-02'), true);
	assert.equal(isDue(mk({remindOn: '2026-07-03'}), '2026-07-02'), false);
	assert.equal(isDue(mk({remindOn: null}), '2026-07-02'), false);
});

test('buildView exclut les faits ; dus triés plus-en-retard-en-tête ; actifs en ordre fichier', () => {
	const items = [
		mk({id: 'a', remindOn: null}),
		mk({id: 'b', remindOn: '2026-07-01'}),
		mk({id: 'c', done: true}),
		mk({id: 'd', remindOn: '2026-07-02'}),
		mk({id: 'e', remindOn: '2026-08-01'}),
		mk({id: 'f', remindOn: '2026-06-01'}), // le plus en retard, mais créé en dernier
	];
	const v = buildView(items, '2026-07-02');
	assert.deepEqual(
		v.due.map(i => i.id),
		['f', 'b', 'd'],
	); // tri par date croissante, pas ordre fichier
	assert.deepEqual(
		v.active.map(i => i.id),
		['a', 'e'],
	); // actifs : ordre fichier
});

test('windowView : tout rentre → fenêtre pleine, pas de scroll', () => {
	assert.deepEqual(windowView(3, 0, 5), {start: 0, end: 3});
	assert.deepEqual(windowView(5, 4, 5), {start: 0, end: 5});
});

test('windowView : la fenêtre suit la sélection et reste bornée', () => {
	assert.deepEqual(windowView(10, 0, 5), {start: 0, end: 5}); // haut de liste
	assert.deepEqual(windowView(10, 3, 5), {start: 0, end: 5}); // sélection encore visible sans scroller
	assert.deepEqual(windowView(10, 7, 5), {start: 3, end: 8}); // scroll : sélection en bas de fenêtre
	assert.deepEqual(windowView(10, 9, 5), {start: 5, end: 10}); // fin de liste, fenêtre remplie
});
