import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand, matchCommands} from '../src/core/commands.ts';

test('parseCommand : /gauth reconnu (+ args, + trim)', () => {
	assert.deepEqual(parseCommand('/gauth'), {name: 'gauth', args: []});
	assert.deepEqual(parseCommand('  /gauth  '), {name: 'gauth', args: []});
	assert.deepEqual(parseCommand('/gauth foo bar'), {
		name: 'gauth',
		args: ['foo', 'bar'],
	});
});

test('parseCommand : non-commandes → null (restent du contenu)', () => {
	assert.equal(parseCommand('/etc/hosts'), null); // chemin, pas une commande
	assert.equal(parseCommand('acheter du pain'), null);
	assert.equal(parseCommand('/deploy staging'), null); // non enregistrée
	assert.equal(parseCommand(''), null);
});

test('parseCommand : /debrief reconnu', () => {
	assert.deepEqual(parseCommand('/debrief'), {name: 'debrief', args: []});
});

test('/azure et /prs sont des commandes, avec args', () => {
	assert.deepEqual(parseCommand('/azure org proj'), {
		name: 'azure',
		args: ['org', 'proj'],
	});
	assert.deepEqual(parseCommand('/prs'), {name: 'prs', args: []});
});

test('/changelog est une commande', () => {
	assert.deepEqual(parseCommand('/changelog'), {name: 'changelog', args: []});
});

test('/stats est une commande', () => {
	assert.deepEqual(parseCommand('/stats'), {name: 'stats', args: []});
});

test('matchCommands : préfixe → commandes filtrées, insensible à la casse', () => {
	assert.equal(matchCommands('/').length, 6); // toutes
	assert.deepEqual(
		matchCommands('/ga').map(c => c.name),
		['gauth'],
	);
	assert.deepEqual(
		matchCommands('/GA').map(c => c.name),
		['gauth'],
	);
	assert.ok(matchCommands('/prs')[0]?.description); // chaque commande est décrite
});

test('matchCommands : fermé hors frappe du nom de commande', () => {
	assert.deepEqual(matchCommands(''), []);
	assert.deepEqual(matchCommands('acheter du pain'), []);
	assert.deepEqual(matchCommands('/etc'), []); // aucun préfixe → contenu normal
	assert.deepEqual(matchCommands('/azure '), []); // espace → saisie des args
	assert.deepEqual(matchCommands('/g\nx'), []); // retour-ligne = fermé aussi
});
