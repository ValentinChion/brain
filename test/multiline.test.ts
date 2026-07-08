import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	decodeKey,
	applyEdit,
	isCtrlC,
	atFirstLine,
	atLastLine,
} from '../src/core/multiline.ts';

const CTRL_A = String.fromCodePoint(1);
const CTRL_E = String.fromCodePoint(5);

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
	assert.deepEqual(decodeKey('[A', {}), {type: 'ignore'}); // flèche haut brute → parent
	assert.deepEqual(decodeKey('', {tab: true}), {type: 'ignore'}); // Tab = bascule (géré ailleurs)
	assert.deepEqual(decodeKey('', {downArrow: false, tab: true}), {
		type: 'ignore',
	}); // Tab reste ignoré
});

test('isCtrlC : legacy et séquence kitty', () => {
	assert.equal(isCtrlC('c', {ctrl: true}), true); // legacy ctrl+c
	assert.equal(isCtrlC('[99;5u', {}), true); // kitty : « c » (99) + Ctrl (mod 5)
	assert.equal(isCtrlC('[99;7u', {}), true); // Ctrl+Alt+c : bit Ctrl présent
	assert.equal(isCtrlC('[13;2u', {}), false); // Shift+Entrée
	assert.equal(isCtrlC('c', {}), false); // « c » simple
	assert.equal(isCtrlC('[99;2u', {}), false); // Shift+c (pas de bit Ctrl)
});

test('decodeKey : déplacement caractère (flèches simples)', () => {
	assert.deepEqual(decodeKey('', {leftArrow: true}), {
		type: 'move',
		unit: 'char',
		dir: 'left',
	});
	assert.deepEqual(decodeKey('', {rightArrow: true}), {
		type: 'move',
		unit: 'char',
		dir: 'right',
	});
});

test('decodeKey : déplacement mot (Option/meta + flèche, ou CSI)', () => {
	assert.deepEqual(decodeKey('', {leftArrow: true, meta: true}), {
		type: 'move',
		unit: 'word',
		dir: 'left',
	});
	assert.deepEqual(decodeKey('', {rightArrow: true, meta: true}), {
		type: 'move',
		unit: 'word',
		dir: 'right',
	});
	assert.deepEqual(decodeKey('[1;3C', {}), {
		type: 'move',
		unit: 'word',
		dir: 'right',
	});
});

test('decodeKey : déplacement ligne (Ctrl+A/E, Home/End, CSI Cmd)', () => {
	assert.deepEqual(decodeKey(CTRL_A, {ctrl: true}), {
		type: 'move',
		unit: 'line',
		dir: 'left',
	});
	assert.deepEqual(decodeKey(CTRL_E, {ctrl: true}), {
		type: 'move',
		unit: 'line',
		dir: 'right',
	});
	assert.deepEqual(decodeKey('[H', {}), {
		type: 'move',
		unit: 'line',
		dir: 'left',
	});
	assert.deepEqual(decodeKey('[F', {}), {
		type: 'move',
		unit: 'line',
		dir: 'right',
	});
	assert.deepEqual(decodeKey('[1;9D', {}), {
		type: 'move',
		unit: 'line',
		dir: 'left',
	});
});

test('applyEdit : insertion au milieu', () => {
	assert.deepEqual(applyEdit('ac', 1, {type: 'insert', text: 'b'}), {
		value: 'abc',
		cursor: 2,
	});
	// collage multi-caractères au curseur
	assert.deepEqual(applyEdit('ad', 1, {type: 'insert', text: 'bc'}), {
		value: 'abcd',
		cursor: 3,
	});
});

test('applyEdit : backspace au milieu et au début (borné)', () => {
	assert.deepEqual(applyEdit('abc', 2, {type: 'backspace'}), {
		value: 'ac',
		cursor: 1,
	});
	assert.deepEqual(applyEdit('abc', 0, {type: 'backspace'}), {
		value: 'abc',
		cursor: 0,
	}); // début → no-op
});

test('applyEdit : newline insère \\n au curseur', () => {
	assert.deepEqual(applyEdit('ab', 1, {type: 'newline'}), {
		value: 'a\nb',
		cursor: 2,
	});
});

test('applyEdit : saut de mot sur "foo bar baz"', () => {
	const v = 'foo bar baz';
	// depuis la fin, un mot à gauche → début de "baz" (index 8)
	assert.equal(
		applyEdit(v, v.length, {type: 'move', unit: 'word', dir: 'left'}).cursor,
		8,
	);
	// depuis 0, un mot à droite → fin de "foo" (index 3)
	assert.equal(
		applyEdit(v, 0, {type: 'move', unit: 'word', dir: 'right'}).cursor,
		3,
	);
});

test('applyEdit : saut de ligne (début/fin de la ligne visuelle)', () => {
	const v = 'abc\ndefgh'; // ligne 2 = index 4..9
	assert.equal(
		applyEdit(v, 7, {type: 'move', unit: 'line', dir: 'left'}).cursor,
		4,
	); // début ligne 2
	assert.equal(
		applyEdit(v, 5, {type: 'move', unit: 'line', dir: 'right'}).cursor,
		9,
	); // fin ligne 2
	assert.equal(
		applyEdit(v, 1, {type: 'move', unit: 'line', dir: 'left'}).cursor,
		0,
	); // ligne 1 → 0
});

test('applyEdit : déplacement caractère borné [0, len]', () => {
	assert.equal(
		applyEdit('ab', 0, {type: 'move', unit: 'char', dir: 'left'}).cursor,
		0,
	);
	assert.equal(
		applyEdit('ab', 2, {type: 'move', unit: 'char', dir: 'right'}).cursor,
		2,
	);
});

test('decodeKey : suppression mot (Option/Ctrl+Backspace) et ligne (Cmd+Backspace)', () => {
	assert.deepEqual(decodeKey('', {meta: true, backspace: true}), {
		type: 'delete',
		unit: 'word',
	});
	assert.deepEqual(decodeKey('', {ctrl: true, backspace: true}), {
		type: 'delete',
		unit: 'word',
	});
	assert.deepEqual(decodeKey('[127;3u', {}), {type: 'delete', unit: 'word'});
	assert.deepEqual(decodeKey('[127;9u', {}), {type: 'delete', unit: 'line'});
	assert.deepEqual(decodeKey('', {backspace: true}), {type: 'backspace'}); // simple inchangé
});

test('applyEdit : delete word / line (arrière)', () => {
	assert.deepEqual(
		applyEdit('foo bar baz', 11, {type: 'delete', unit: 'word'}),
		{
			value: 'foo bar ',
			cursor: 8,
		},
	);
	assert.deepEqual(
		applyEdit('abc\ndef ghi', 11, {type: 'delete', unit: 'line'}),
		{
			value: 'abc\n',
			cursor: 4,
		},
	);
});

test('decodeKey : flèches verticales', () => {
	assert.deepEqual(decodeKey('', {upArrow: true}), {
		type: 'move',
		unit: 'vertical',
		dir: 'up',
	});
	assert.deepEqual(decodeKey('', {downArrow: true}), {
		type: 'move',
		unit: 'vertical',
		dir: 'down',
	});
});

test('applyEdit : vertical préserve la colonne (clampée)', () => {
	const v = 'abcdef\ngh'; // ligne 0 = abcdef (0..6), \n@6, ligne 1 = gh (7..9)
	assert.equal(
		applyEdit(v, 3, {type: 'move', unit: 'vertical', dir: 'down'}).cursor,
		9,
	); // col 3 → 'gh' (len 2) clampé à la fin (9)
	assert.equal(
		applyEdit(v, 8, {type: 'move', unit: 'vertical', dir: 'up'}).cursor,
		1,
	); // col 1 → ligne 0 col 1
});

test('atFirstLine / atLastLine', () => {
	const v = 'abcdef\ngh';
	assert.equal(atFirstLine(v, 3), true);
	assert.equal(atFirstLine(v, 8), false);
	assert.equal(atLastLine(v, 8), true);
	assert.equal(atLastLine(v, 3), false);
});

// --- formes parsées par Ink 7 (protocole kitty géré par le render, pas par nous) ---

test('decodeKey : Shift+Entrée parsé par Ink (return+shift) → newline', () => {
	assert.deepEqual(decodeKey('', {return: true, shift: true}), {
		type: 'newline',
	});
});

test('decodeKey : Cmd (super) + flèche/Backspace → ligne', () => {
	assert.deepEqual(decodeKey('', {leftArrow: true, super: true}), {
		type: 'move',
		unit: 'line',
		dir: 'left',
	});
	assert.deepEqual(decodeKey('', {rightArrow: true, super: true}), {
		type: 'move',
		unit: 'line',
		dir: 'right',
	});
	assert.deepEqual(decodeKey('', {backspace: true, super: true}), {
		type: 'delete',
		unit: 'line',
	});
});

test('decodeKey : Home/End parsés par Ink → début/fin de ligne', () => {
	assert.deepEqual(decodeKey('', {home: true}), {
		type: 'move',
		unit: 'line',
		dir: 'left',
	});
	assert.deepEqual(decodeKey('', {end: true}), {
		type: 'move',
		unit: 'line',
		dir: 'right',
	});
});

test('decodeKey : Cmd+lettre n’insère pas', () => {
	assert.deepEqual(decodeKey('k', {super: true}), {type: 'ignore'});
});
