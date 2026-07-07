import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shapeEvents, nextMeeting, summary} from '../src/core/agenda.ts';

const raw = [
	{
		id: '1',
		summary: 'B',
		start: {dateTime: '2026-07-06T14:00:00Z'},
		end: {dateTime: '2026-07-06T15:00:00Z'},
	},
	{
		id: '2',
		summary: 'A',
		start: {dateTime: '2026-07-06T09:00:00Z'},
		end: {dateTime: '2026-07-06T09:30:00Z'},
	},
	{id: '3', summary: 'Journée', start: {date: '2026-07-06'}}, // toute la journée → exclue
];

test('shapeEvents : exclut les journées entières, trie par début', () => {
	const m = shapeEvents(raw);
	assert.equal(m.length, 2);
	assert.deepEqual(
		m.map(x => x.id),
		['2', '1'],
	); // 09:00 avant 14:00
	assert.equal(m[0].title, 'A');
});

test('shapeEvents : titre par défaut si absent', () => {
	const m = shapeEvents([{id: 'x', start: {dateTime: '2026-07-06T08:00:00Z'}}]);
	assert.equal(m[0].title, '(sans titre)');
});

test('nextMeeting : prochaine à venir, sinon null', () => {
	const m = shapeEvents(raw);
	assert.equal(nextMeeting(m, '2026-07-06T10:00:00Z')?.id, '1'); // 14:00 à venir
	assert.equal(nextMeeting(m, '2026-07-06T23:00:00Z'), null);
});

test('summary : compte + prochaine', () => {
	const s = summary(shapeEvents(raw), '2026-07-06T08:00:00Z');
	assert.equal(s.count, 2);
	assert.equal(s.next?.id, '2');
});

test('shapeEvents : debriefable = réunion avec autrui, non déclinée, type default', () => {
	const real = shapeEvents([
		{
			id: 'r',
			summary: 'Sprint',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			end: {dateTime: '2026-07-06T09:30:00Z'},
			eventType: 'default',
			attendees: [
				{self: true, responseStatus: 'accepted'},
				{responseStatus: 'accepted'},
			],
		},
	]);
	assert.equal(real[0].debriefable, true);

	const solo = shapeEvents([
		{
			id: 's',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			attendees: [{self: true}],
		},
	]);
	assert.equal(solo[0].debriefable, false); // pas d'autre participant

	const declined = shapeEvents([
		{
			id: 'd',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			attendees: [
				{self: true, responseStatus: 'declined'},
				{responseStatus: 'accepted'},
			],
		},
	]);
	assert.equal(declined[0].debriefable, false); // décliné

	const focus = shapeEvents([
		{
			id: 'f',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			eventType: 'focusTime',
			attendees: [{self: true}, {responseStatus: 'accepted'}],
		},
	]);
	assert.equal(focus[0].debriefable, false); // bloc focus
});
