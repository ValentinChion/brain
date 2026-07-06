import {test} from 'node:test';
import assert from 'node:assert/strict';
import {todayYMD, addDays, stepReminder} from '../src/core/date.ts';

test('todayYMD formate une date locale en AAAA-MM-JJ', () => {
	assert.equal(todayYMD(new Date(2026, 6, 2)), '2026-07-02'); // mois 6 = juillet
	assert.equal(todayYMD(new Date(2026, 0, 5)), '2026-01-05');
});

test('addDays gère le passage de mois', () => {
	assert.equal(addDays('2026-07-02', 1), '2026-07-03');
	assert.equal(addDays('2026-07-31', 1), '2026-08-01');
	assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test("stepReminder avance/recule d'un jour et d'une semaine", () => {
	assert.equal(
		stepReminder('2026-07-05', 'day', 1, '2026-07-01'),
		'2026-07-06',
	);
	assert.equal(
		stepReminder('2026-07-05', 'day', -1, '2026-07-01'),
		'2026-07-04',
	);
	assert.equal(
		stepReminder('2026-07-05', 'week', 1, '2026-07-01'),
		'2026-07-12',
	);
	assert.equal(
		stepReminder('2026-07-12', 'week', -1, '2026-07-01'),
		'2026-07-05',
	);
});

test("stepReminder ne descend jamais sous aujourd'hui (plancher)", () => {
	assert.equal(
		stepReminder('2026-07-02', 'day', -1, '2026-07-02'),
		'2026-07-02',
	);
	assert.equal(
		stepReminder('2026-07-04', 'week', -1, '2026-07-02'),
		'2026-07-02',
	);
});

test("stepReminder démarre à aujourd'hui quand current est null", () => {
	assert.equal(stepReminder(null, 'day', 1, '2026-07-02'), '2026-07-03');
	assert.equal(stepReminder(null, 'day', -1, '2026-07-02'), '2026-07-02'); // planché
});
