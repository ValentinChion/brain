import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hint} from '../src/core/hints.ts';

test('hint couvre chaque branche world × mode', () => {
	assert.match(hint('tasks', 'input'), /Tab: notes/);
	assert.match(hint('tasks', 'nav'), /rappel/);
	assert.equal(hint('tasks', 'reminder'), '');
	assert.match(hint('notes', 'input'), /Tab: tâches/);
	assert.match(hint('notes', 'nav'), /épingler/);
	assert.match(hint('notes', 'reminder'), /Tab: tâches/); // notes n'a pas de mode reminder → fallback nav
});

test('mode prnav : navigation + ouvrir', () => {
	assert.equal(
		hint('tasks', 'prnav'),
		'↑/↓ · o/Entrée: ouvrir · Échap: saisie',
	);
});
