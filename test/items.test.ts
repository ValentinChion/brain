import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Item} from '../src/types.ts';
import {
	addItem,
	editText,
	setDone,
	setReminder,
	removeItem,
} from '../src/items.ts';

const NOW = '2026-07-02T10:00:00.000Z';
const base: Item = {
	id: 'a',
	text: 'vieux',
	createdAt: '2026-01-01T00:00:00.000Z',
	remindOn: null,
	done: false,
	doneAt: null,
};

test("addItem ajoute en fin, avec id/createdAt renseignés, sans muter l'entrée", () => {
	const before = [base];
	const after = addItem(before, 'nouvelle tâche', NOW);
	assert.equal(after.length, 2);
	assert.equal(before.length, 1); // pas de mutation
	const added = after[1];
	assert.equal(added.text, 'nouvelle tâche');
	assert.equal(added.createdAt, NOW);
	assert.equal(added.done, false);
	assert.equal(added.remindOn, null);
	assert.ok(added.id && added.id !== 'a');
});

test('editText change le texte de la bonne ligne', () => {
	const after = editText([base], 'a', 'corrigé');
	assert.equal(after[0].text, 'corrigé');
});

test('setDone(true) marque fait + doneAt ; setDone(false) réinitialise', () => {
	const done = setDone([base], 'a', true, NOW);
	assert.equal(done[0].done, true);
	assert.equal(done[0].doneAt, NOW);
	const undone = setDone(done, 'a', false, NOW);
	assert.equal(undone[0].done, false);
	assert.equal(undone[0].doneAt, null);
});

test('setReminder pose ou efface la date', () => {
	assert.equal(
		setReminder([base], 'a', '2026-08-01')[0].remindOn,
		'2026-08-01',
	);
	assert.equal(setReminder([base], 'a', null)[0].remindOn, null);
});

test('removeItem retire la bonne ligne', () => {
	const two = addItem([base], 'seconde', NOW);
	const after = removeItem(two, 'a');
	assert.equal(after.length, 1);
	assert.equal(after[0].text, 'seconde');
});
