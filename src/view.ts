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
