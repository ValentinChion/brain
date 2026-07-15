import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	shapeEvents,
	nextMeeting,
	agendaBar,
	fuseBar,
	formatCountdown,
} from '../src/core/agenda.ts';
import type {Meeting} from '../src/core/types.ts';

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

const mtg = (id: string, start: string, end: string, title = id): Meeting => ({
	id,
	title,
	start,
	end,
	debriefable: false,
});

test('agendaBar : aucune réunion → vide', () => {
	assert.deepEqual(agendaBar([], '2026-07-06T08:00:00Z'), {kind: 'empty'});
});

test('agendaBar : toutes finies → terminé', () => {
	const m = [mtg('1', '2026-07-06T09:00:00Z', '2026-07-06T09:30:00Z')];
	assert.deepEqual(agendaBar(m, '2026-07-06T18:00:00Z'), {
		kind: 'done',
		total: 1,
	});
});

test('agendaBar : à venir, hors fenêtre (>90 min) → idle, pas de mèche', () => {
	const m = [
		mtg('1', '2026-07-06T14:00:00Z', '2026-07-06T15:00:00Z', 'Standup'),
	];
	const b = agendaBar(m, '2026-07-06T10:00:00Z'); // 4 h avant
	assert.equal(b.kind, 'meeting');
	if (b.kind !== 'meeting') return;
	assert.equal(b.live, false);
	assert.equal(b.urgency, 'idle');
	assert.equal(b.fuse, null);
	assert.equal(b.minutes, 240);
});

test('agendaBar : urgence selon les minutes restantes', () => {
	const m = [mtg('1', '2026-07-06T14:00:00Z', '2026-07-06T15:00:00Z')];
	const at = (iso: string) => {
		const b = agendaBar(m, iso);
		return b.kind === 'meeting' ? b.urgency : null;
	};

	assert.equal(at('2026-07-06T13:00:00Z'), 'far'); // 60 min → dans la fenêtre
	assert.equal(at('2026-07-06T13:40:00Z'), 'soon'); // 20 min
	assert.equal(at('2026-07-06T13:55:00Z'), 'imminent'); // 5 min
});

test('agendaBar : mèche pleine à l’entrée de la fenêtre, vide au départ', () => {
	const m = [mtg('1', '2026-07-06T14:00:00Z', '2026-07-06T15:00:00Z')];
	// pas de réunion précédente → ancre = début - 90 min = 12:30
	const entry = agendaBar(m, '2026-07-06T12:30:00Z');
	const near = agendaBar(m, '2026-07-06T13:59:00Z');
	assert.ok(entry.kind === 'meeting' && entry.fuse);
	assert.ok(near.kind === 'meeting' && near.fuse);
	assert.equal(entry.fuse.filled, entry.fuse.total); // pleine
	assert.equal(near.fuse.filled, 0); // consumée
});

test('agendaBar : la mèche épouse le trou libre s’il est plus court que 90 min', () => {
	const m = [
		mtg('1', '2026-07-06T13:00:00Z', '2026-07-06T13:30:00Z'), // finit 13:30
		mtg('2', '2026-07-06T14:00:00Z', '2026-07-06T15:00:00Z'), // trou de 30 min
	];
	// à 13:30 pile (fin de la précédente) → mèche pleine sur le trou de 30 min
	const b = agendaBar(m, '2026-07-06T13:30:00Z');
	assert.ok(b.kind === 'meeting' && b.fuse);
	assert.equal(b.fuse.filled, b.fuse.total);
	assert.equal(b.remaining, 0); // la n°2 est la dernière
});

test('agendaBar : réunion en cours → live + minutes jusqu’à la fin', () => {
	const m = [mtg('1', '2026-07-06T14:00:00Z', '2026-07-06T15:00:00Z', 'Daily')];
	const b = agendaBar(m, '2026-07-06T14:52:00Z');
	assert.equal(b.kind, 'meeting');
	if (b.kind !== 'meeting') return;
	assert.equal(b.live, true);
	assert.equal(b.urgency, 'live');
	assert.equal(b.minutes, 8); // finit dans 8 min
	assert.equal(b.title, 'Daily');
});

test('fuseBar : ▓ restant, █ tête, ░ consumé', () => {
	assert.equal(fuseBar(6, 10), '▓▓▓▓▓█░░░░');
	assert.equal(fuseBar(10, 10), '▓▓▓▓▓▓▓▓▓█');
	assert.equal(fuseBar(0, 10), '░░░░░░░░░░');
});

test('formatCountdown : minutes, heures, en cours', () => {
	assert.equal(formatCountdown(24, false), 'dans 24 min');
	assert.equal(formatCountdown(240, false), 'dans 4 h');
	assert.equal(formatCountdown(75, false), 'dans 1 h 15');
	assert.equal(formatCountdown(0, false), 'maintenant');
	assert.equal(formatCountdown(8, true), 'finit dans 8 min');
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
