import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Note} from '../src/core/types.ts';
import {
	addNote,
	editNote,
	removeNote,
	togglePin,
	sortNotes,
	isStale,
	staleNotes,
	sweepStale,
} from '../src/core/notes.ts';

const NOW = '2026-07-03T10:00:00.000Z';
const mk = (over: Partial<Note>): Note => ({
	id: over.id ?? 'id',
	text: over.text ?? 't',
	createdAt: over.createdAt ?? '2026-07-01T00:00:00.000Z',
	pinned: over.pinned ?? false,
});

test('addNote ajoute en fin, non épinglée, id/createdAt renseignés, sans muter', () => {
	const before = [mk({id: 'a'})];
	const after = addNote(before, 'note', NOW);
	assert.equal(after.length, 2);
	assert.equal(before.length, 1);
	assert.equal(after[1].text, 'note');
	assert.equal(after[1].createdAt, NOW);
	assert.equal(after[1].pinned, false);
	assert.ok(after[1].id && after[1].id !== 'a');
});

test('editNote / removeNote / togglePin ciblent la bonne note', () => {
	const base = [mk({id: 'a', text: 'vieux'})];
	assert.equal(editNote(base, 'a', 'neuf')[0].text, 'neuf');
	assert.equal(removeNote(base, 'a').length, 0);
	assert.equal(togglePin(base, 'a')[0].pinned, true);
	assert.equal(togglePin(togglePin(base, 'a'), 'a')[0].pinned, false);
});

test('sortNotes : épinglées d’abord, puis la plus récente en haut', () => {
	const notes = [
		mk({id: 'a', createdAt: '2026-07-01T00:00:00.000Z'}),
		mk({id: 'b', createdAt: '2026-07-03T00:00:00.000Z'}),
		mk({id: 'c', createdAt: '2026-06-01T00:00:00.000Z', pinned: true}),
		mk({id: 'd', createdAt: '2026-07-02T00:00:00.000Z', pinned: true}),
	];
	assert.deepEqual(
		sortNotes(notes).map(n => n.id),
		['d', 'c', 'b', 'a'],
	);
});

test('isStale : non épinglée + >7j = périmée ; épinglée jamais ; récente non', () => {
	// today = 2026-07-15
	assert.equal(
		isStale(mk({createdAt: '2026-07-06T12:00:00.000Z'}), '2026-07-15'),
		true,
	); // 9j
	assert.equal(
		isStale(mk({createdAt: '2026-07-08T12:00:00.000Z'}), '2026-07-15'),
		false,
	); // 7j exact → pas encore
	assert.equal(
		isStale(mk({createdAt: '2026-07-14T12:00:00.000Z'}), '2026-07-15'),
		false,
	); // récente
	assert.equal(
		isStale(
			mk({createdAt: '2026-01-01T12:00:00.000Z', pinned: true}),
			'2026-07-15',
		),
		false,
	); // épinglée
});

test('staleNotes / sweepStale sont cohérents (candidats vs survivants)', () => {
	const notes = [
		mk({id: 'old', createdAt: '2026-06-01T00:00:00.000Z'}),
		mk({id: 'oldPinned', createdAt: '2026-06-01T00:00:00.000Z', pinned: true}),
		mk({id: 'fresh', createdAt: '2026-07-14T00:00:00.000Z'}),
	];
	assert.deepEqual(
		staleNotes(notes, '2026-07-15').map(n => n.id),
		['old'],
	);
	assert.deepEqual(
		sweepStale(notes, '2026-07-15').map(n => n.id),
		['oldPinned', 'fresh'],
	);
});
