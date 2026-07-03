// Décodage d'une frappe (déjà passée par le parsing Ink) en action d'édition
// multi-ligne. Pur et testé — la couche Ink (MultilineInput.tsx) ne fait
// qu'appliquer l'action au `value`.
//
// Contexte kitty : quand le protocole clavier kitty est activé (Ghostty),
// Ink nous livre Shift+Entrée comme input `[13;2u` et Échap comme `[27u`
// (le protocole « désambigue » : Échap n'arrive plus via key.escape).
// Protocole absent (autre terminal) : Shift+Entrée = Entrée → on valide
// (repli gracieux, note mono-ligne).

export type KeyAction =
	| {type: 'newline'}
	| {type: 'submit'}
	| {type: 'cancel'}
	| {type: 'backspace'}
	| {type: 'insert'; text: string}
	| {type: 'ignore'};

export type KeyFlags = {
	return?: boolean;
	escape?: boolean;
	backspace?: boolean;
	delete?: boolean;
	tab?: boolean;
	ctrl?: boolean;
};

// une séquence CSI résiduelle ressemble à `[13;2u`, `[A`, `[27u`… (jamais du texte)
const isCsi = (s: string): boolean => /^\[[\d;]*[A-Za-z~]$/.test(s);

export function decodeKey(input: string, key: KeyFlags): KeyAction {
	// normalise les drapeaux optionnels en booléens (évite `||` sur `boolean | undefined`)
	const ret = key.return ?? false;
	const esc = key.escape ?? false;
	const back = (key.backspace ?? false) || (key.delete ?? false);
	const tab = key.tab ?? false;
	const ctrl = key.ctrl ?? false;

	if (input === '[13;2u') return {type: 'newline'}; // Shift+Entrée (kitty)
	if (ret) return {type: 'submit'}; // Entrée
	if (esc || input === '[27u') return {type: 'cancel'}; // Échap (kitty → [27u)
	if (back) return {type: 'backspace'};
	// texte : y compris `[` littéral (longueur 1) et collage multi-caractères ;
	// on écarte les séquences CSI résiduelles, Tab et les combos Ctrl.
	if (input && !isCsi(input) && !tab && !ctrl) {
		return {type: 'insert', text: input};
	}

	return {type: 'ignore'};
}
