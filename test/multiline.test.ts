import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeKey} from '../src/multiline.ts';

test('Shift+Entrée (kitty [13;2u) → saut de ligne', () => {
	assert.deepEqual(decodeKey('[13;2u', {}), {type: 'newline'});
});

test('Entrée → valider', () => {
	assert.deepEqual(decodeKey('\r', {return: true}), {type: 'submit'});
});

test('Échap → annuler, protocole on (input [27u) comme off (key.escape)', () => {
	assert.deepEqual(decodeKey('[27u', {}), {type: 'cancel'});
	assert.deepEqual(decodeKey('', {escape: true}), {type: 'cancel'});
});

test('backspace / delete → effacer', () => {
	assert.deepEqual(decodeKey('', {backspace: true}), {type: 'backspace'});
	assert.deepEqual(decodeKey('', {delete: true}), {type: 'backspace'});
});

test('texte : lettre, [ littéral, collage multi-caractères', () => {
	assert.deepEqual(decodeKey('a', {}), {type: 'insert', text: 'a'});
	assert.deepEqual(decodeKey('[', {}), {type: 'insert', text: '['}); // pas une séquence CSI
	assert.deepEqual(decodeKey('kubectl get po', {}), {
		type: 'insert',
		text: 'kubectl get po',
	});
});

test('séquences CSI résiduelles (flèches, etc.) et combos ignorés', () => {
	assert.deepEqual(decodeKey('[A', {}), {type: 'ignore'}); // flèche brute éventuelle
	assert.deepEqual(decodeKey('', {tab: true}), {type: 'ignore'}); // Tab = bascule (géré ailleurs)
	assert.deepEqual(decodeKey('', {upArrow: true} as never), {type: 'ignore'}); // flèche haut → parent
});
