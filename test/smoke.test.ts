import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Item} from '../src/core/types.ts';

test('le type Item se compile et un objet valide est bien formé', () => {
	const item: Item = {
		id: 'x',
		text: 'hello',
		createdAt: '2026-07-02T00:00:00.000Z',
		remindOn: null,
		done: false,
		doneAt: null,
	};
	assert.equal(item.text, 'hello');
});
