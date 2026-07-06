// Édition d'un champ texte (buffer + curseur), pur et testé — la couche Ink
// (multiline-input.tsx) ne fait que décoder la frappe et appliquer l'action.
//
// Deux fonctions pures :
//   - decodeKey(input, key) : frappe (déjà parsée par Ink) → action d'édition.
//   - applyEdit(value, cursor, action) : applique l'action au (value, cursor).
//
// Contexte kitty : quand le protocole clavier kitty est activé (Ghostty),
// Ink livre Shift+Entrée comme input `[13;2u` et Échap comme `[27u`
// (« désambiguation » : Échap n'arrive plus via key.escape). Les flèches
// simples arrivent via key.leftArrow/rightArrow ; les touches modifiées
// (Option/Cmd) soit via key.meta, soit en séquence CSI brute.

export type KeyAction =
	| {type: 'newline'}
	| {type: 'submit'}
	| {type: 'cancel'}
	| {type: 'backspace'}
	| {type: 'insert'; text: string}
	| {type: 'move'; unit: 'char' | 'word' | 'line'; dir: 'left' | 'right'}
	| {type: 'ignore'};

export type KeyFlags = {
	return?: boolean;
	escape?: boolean;
	backspace?: boolean;
	delete?: boolean;
	tab?: boolean;
	ctrl?: boolean;
	meta?: boolean;
	leftArrow?: boolean;
	rightArrow?: boolean;
};

// une séquence CSI résiduelle ressemble à `[13;2u`, `[A`, `[1;3D`… (jamais du texte)
const isCsi = (s: string): boolean => /^\[[\d;]*[A-Za-z~]$/.test(s);

// Ctrl+C pour quitter. Sous le protocole kitty (actif quand la barre a le focus),
// Ctrl+C n'arrive plus comme `\x03` mais comme une séquence kitty `[99;5u`
// (« c » = 99, bit Ctrl dans le modificateur = (mod-1)&4). Ink ne quitte alors
// plus tout seul → l'app doit le détecter. Le cas hérité `key.ctrl && 'c'` est
// couvert aussi. Pur → testable.
const KITTY_KEY = /^\[(\d+);(\d+)u$/;
export function isCtrlC(input: string, key: KeyFlags): boolean {
	if ((key.ctrl ?? false) && input === 'c') return true;
	const m = KITTY_KEY.exec(input);
	if (!m) return false;
	// modificateur kitty = 1 + bitmask (shift1, alt2, ctrl4) : bit Ctrl présent
	// ssi (bitmask mod 8) >= 4 — sans opérateur bit-à-bit.
	const bitmask = Number(m[2]) - 1;
	return Number(m[1]) === 99 && bitmask % 8 >= 4;
}

const CTRL_A = String.fromCodePoint(1); // Ctrl+A → début de ligne (repli terminal fiable)
const CTRL_E = String.fromCodePoint(5); // Ctrl+E → fin de ligne

// Séquences CSI modifiées attendues sous Ghostty/kitty.
// ⚠️ À CONFIRMER par capture réelle (Étape 0) : modificateurs = 1+bitmask
// (Shift1, Alt2, Ctrl4, Super8), donc Alt/Option=3, Ctrl=5, Cmd/Super=9.
const CSI_WORD_LEFT = new Set(['[1;3D', '[1;5D']); // Option (ou Ctrl) + ←
const CSI_WORD_RIGHT = new Set(['[1;3C', '[1;5C']);
const CSI_LINE_LEFT = new Set(['[1;9D', '[H', '[1~']); // Cmd + ← / Home
const CSI_LINE_RIGHT = new Set(['[1;9C', '[F', '[4~']); // Cmd + → / End

export function decodeKey(input: string, key: KeyFlags): KeyAction {
	// normalise les drapeaux optionnels en booléens
	const ret = key.return ?? false;
	const esc = key.escape ?? false;
	const back = (key.backspace ?? false) || (key.delete ?? false);
	const tab = key.tab ?? false;
	const ctrl = key.ctrl ?? false;
	const meta = key.meta ?? false;
	const left = key.leftArrow ?? false;
	const right = key.rightArrow ?? false;

	// --- contrôles ---
	if (input === '[13;2u') return {type: 'newline'}; // Shift+Entrée (kitty)
	if (ret) return {type: 'submit'}; // Entrée
	if (esc || input === '[27u') return {type: 'cancel'}; // Échap (kitty → [27u)
	if (back) return {type: 'backspace'};

	// --- déplacements : ligne (le plus spécifique) → mot → caractère ---
	if (input === CTRL_A || (ctrl && input === 'a')) {
		return {type: 'move', unit: 'line', dir: 'left'};
	}

	if (input === CTRL_E || (ctrl && input === 'e')) {
		return {type: 'move', unit: 'line', dir: 'right'};
	}

	if (CSI_LINE_LEFT.has(input))
		return {type: 'move', unit: 'line', dir: 'left'};
	if (CSI_LINE_RIGHT.has(input)) {
		return {type: 'move', unit: 'line', dir: 'right'};
	}

	if ((meta && left) || CSI_WORD_LEFT.has(input)) {
		return {type: 'move', unit: 'word', dir: 'left'};
	}

	if ((meta && right) || CSI_WORD_RIGHT.has(input)) {
		return {type: 'move', unit: 'word', dir: 'right'};
	}

	if (left) return {type: 'move', unit: 'char', dir: 'left'};
	if (right) return {type: 'move', unit: 'char', dir: 'right'};

	// --- texte : lettre, `[` littéral, collage ; on écarte CSI, Tab, combos ---
	if (input && !isCsi(input) && !tab && !ctrl && !meta) {
		return {type: 'insert', text: input};
	}

	return {type: 'ignore'};
}

// --- Frontières de mot / ligne (pures) ---

const isSpace = (ch: string): boolean => /\s/.test(ch);

// mot à gauche : saute les espaces puis les non-espaces
function wordLeft(value: string, c: number): number {
	let i = c;
	while (i > 0 && isSpace(value[i - 1]!)) i--;
	while (i > 0 && !isSpace(value[i - 1]!)) i--;
	return i;
}

// mot à droite : saute les espaces puis les non-espaces
function wordRight(value: string, c: number): number {
	let i = c;
	const n = value.length;
	while (i < n && isSpace(value[i]!)) i++;
	while (i < n && !isSpace(value[i]!)) i++;
	return i;
}

// début de la ligne visuelle courante (après le `\n` précédent, ou 0)
const lineStart = (value: string, c: number): number =>
	value.lastIndexOf('\n', c - 1) + 1;

// fin de la ligne visuelle courante (avant le `\n` suivant, ou la fin)
function lineEnd(value: string, c: number): number {
	const nl = value.indexOf('\n', c);
	return nl === -1 ? value.length : nl;
}

function moveCursor(
	value: string,
	c: number,
	unit: 'char' | 'word' | 'line',
	dir: 'left' | 'right',
): number {
	if (unit === 'char') {
		return dir === 'left' ? Math.max(0, c - 1) : Math.min(value.length, c + 1);
	}

	if (unit === 'word') {
		return dir === 'left' ? wordLeft(value, c) : wordRight(value, c);
	}

	return dir === 'left' ? lineStart(value, c) : lineEnd(value, c);
}

// Applique une action d'édition. submit/cancel/ignore ne touchent pas le
// buffer → renvoyés inchangés (la couche Ink les traite en amont).
export function applyEdit(
	value: string,
	cursor: number,
	action: KeyAction,
): {value: string; cursor: number} {
	const c = Math.max(0, Math.min(cursor, value.length));
	switch (action.type) {
		case 'insert': {
			return {
				value: value.slice(0, c) + action.text + value.slice(c),
				cursor: c + action.text.length,
			};
		}

		case 'newline': {
			return {value: value.slice(0, c) + '\n' + value.slice(c), cursor: c + 1};
		}

		case 'backspace': {
			if (c === 0) return {value, cursor: 0};
			return {value: value.slice(0, c - 1) + value.slice(c), cursor: c - 1};
		}

		case 'move': {
			return {value, cursor: moveCursor(value, c, action.unit, action.dir)};
		}

		default: {
			return {value, cursor: c};
		}
	}
}
