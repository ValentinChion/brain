import {test} from 'node:test';
import assert from 'node:assert/strict';
import {todayYMD, addDays, parseReminder} from '../src/date.ts';

test('todayYMD formate une date locale en AAAA-MM-JJ', () => {
	assert.equal(todayYMD(new Date(2026, 6, 2)), '2026-07-02'); // mois 6 = juillet
	assert.equal(todayYMD(new Date(2026, 0, 5)), '2026-01-05');
});

test('addDays gère le passage de mois', () => {
	assert.equal(addDays('2026-07-02', 1), '2026-07-03');
	assert.equal(addDays('2026-07-31', 1), '2026-08-01');
	assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('parseReminder accepte une date absolue valide', () => {
	assert.deepEqual(parseReminder('2026-08-15', '2026-07-02'), {
		ok: true,
		value: '2026-08-15',
	});
});

test('parseReminder: vide ou espaces = effacer le rappel (value null)', () => {
	assert.deepEqual(parseReminder('', '2026-07-02'), {ok: true, value: null});
	assert.deepEqual(parseReminder('   ', '2026-07-02'), {ok: true, value: null});
});

test("parseReminder gère les raccourcis aujourd'hui / demain", () => {
	assert.deepEqual(parseReminder("aujourd'hui", '2026-07-02'), {
		ok: true,
		value: '2026-07-02',
	});
	assert.deepEqual(parseReminder('demain', '2026-07-02'), {
		ok: true,
		value: '2026-07-03',
	});
});

test('parseReminder rejette un format inconnu ou une date impossible', () => {
	assert.equal(parseReminder('vendredi', '2026-07-02').ok, false);
	assert.equal(parseReminder('2026-13-01', '2026-07-02').ok, false);
	assert.equal(parseReminder('2026-02-30', '2026-07-02').ok, false);
});
