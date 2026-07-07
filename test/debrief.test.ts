import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	pendingDebriefs,
	linesToItems,
	pruneHandled,
	lastDebriefable,
} from '../src/core/debrief.ts';

const m = (id, end, debriefable = true) => ({
	id,
	title: id,
	start: end,
	end,
	debriefable,
});

test('pendingDebriefs : debriefable + fini + non traité, trié par fin', () => {
	const meetings = [
		m('b', '2026-07-06T14:00:00Z'),
		m('a', '2026-07-06T09:00:00Z'),
		m('future', '2026-07-06T23:00:00Z'),
		m('nondeb', '2026-07-06T08:00:00Z', false),
	];
	const out = pendingDebriefs(meetings, '2026-07-06T15:00:00Z', ['a']);
	assert.deepEqual(
		out.map(x => x.id),
		['b'],
	); // a traité, future pas fini, nondeb exclu
});

test('linesToItems : trim, ignore lignes vides', () => {
	assert.deepEqual(linesToItems('  faire X \n\n  relancer Y\n'), [
		'faire X',
		'relancer Y',
	]);
	assert.deepEqual(linesToItems('   '), []);
});

test('pruneHandled : ne garde que les ids du jour', () => {
	assert.deepEqual(pruneHandled(['a', 'old'], ['a', 'b']), ['a']);
});

test('lastDebriefable : dernière réunion terminée + debriefable, sinon null', () => {
	const meetings = [
		m('a', '2026-07-06T09:00:00Z'),
		m('b', '2026-07-06T14:00:00Z'),
		m('future', '2026-07-06T23:00:00Z'),
		m('nondeb', '2026-07-06T08:00:00Z', false),
	];
	assert.equal(lastDebriefable(meetings, '2026-07-06T15:00:00Z')?.id, 'b');
	assert.equal(lastDebriefable([], '2026-07-06T15:00:00Z'), null);
});
