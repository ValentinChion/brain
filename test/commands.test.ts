import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCommand} from '../src/core/commands.ts';

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
