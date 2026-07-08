import type {Item} from './types.ts';

export function isDue(item: Item, todayYmd: string): boolean {
	return item.remindOn !== null && item.remindOn <= todayYmd;
}

export function buildView(
	items: Item[],
	todayYmd: string,
): {due: Item[]; active: Item[]} {
	const pending = items.filter(i => !i.done);
	return {
		// dus : remindOn non-null (isDue l'exige). Format AAAA-MM-JJ → tri lexical = chronologique ;
		// sort() stable garde l'ordre fichier à date égale. String() évite le non-null assertion (xo).
		due: pending
			.filter(i => isDue(i, todayYmd))
			.sort((a, b) => String(a.remindOn).localeCompare(String(b.remindOn))),
		active: pending.filter(i => !isDue(i, todayYmd)),
	};
}

// Nombre de lignes qu'occupe un texte enveloppé à `width` colonnes : chaque
// ligne dure (\n) compte, plus le wrap doux des lignes trop longues.
// ponytail: longueur de chaîne ≈ largeur d'affichage (CJK/emoji sous-comptés) ;
// passer à string-width si des textes larges apparaissent en pratique.
export function wrappedRows(text: string, width: number): number {
	const w = Math.max(1, width);
	return text
		.split('\n')
		.reduce((n, line) => n + Math.max(1, Math.ceil(line.length / w)), 0);
}

// Lignes disponibles pour une liste : hauteur du terminal moins le chrome
// (masthead, statut, saisie, hints… — calculé par l'appelant). Si la liste
// déborde, on réserve 2 lignes pour les indicateurs ▲/▼ « N de plus » afin
// que le rendu ne dépasse jamais la hauteur du terminal (sinon ça scrolle).
export function listRows(
	termRows: number,
	chrome: number,
	count: number,
): number {
	const base = Math.max(1, termRows - chrome);
	if (count <= base) return base;
	return Math.max(1, base - 2);
}

// ponytail: fenêtre dérivée uniquement de `selected` (pas d'offset en state) — la sélection se cale en bas de
// fenêtre quand elle scrolle. Si un scroll plus "stable" gêne à l'usage, mémoriser start dans app.tsx.
export function windowView(
	count: number,
	selected: number,
	height: number,
): {start: number; end: number} {
	if (height <= 0 || count <= height) return {start: 0, end: count};
	const start = Math.max(0, Math.min(selected - height + 1, count - height));
	return {start, end: start + height};
}
