// src/core/stats.ts — tout le numérique de l'écran /stats : heatmap étagée,
// streak (avec grâce), flux 7 jours, médiane de digestion, records.
// Pur (aucun import Ink) — c'est ici que vit la couverture de test.
import {addDays} from './date.ts';
import type {Item, JournalEvent, Note} from './types.ts';

export type HeatCell = {d: string; count: number; level: number}; // 0 = vide, 1–5 = palier néon
export type Heatmap =
	| {kind: 'band'; cells: HeatCell[]} // < 4 semaines de données : bande jour par jour
	| {kind: 'grid'; weeks: Array<Array<HeatCell | null>>}; // colonne = semaine lun→dim, null = futur

export type FluxDay = {d: string; captured: number; finished: number};

export type Stats = {
	streak: number; // jours consécutifs avec capture (grâce : hier compte encore)
	captured: number; // total captures (tâches + notes)
	finished: number; // done − undone, borné à 0
	heatmap: Heatmap;
	flux: {days: FluxDay[]; captured: number; finished: number; delta: number};
	medianLifeDays: number | null; // médiane capture → done, en jours
	records: {
		bestDay: {d: string; count: number} | null;
		longestStreak: number;
		oldestClosedDays: number | null;
	};
	worlds: {openTasks: number; notes: number; pinned: number};
};

const DAY = 86_400_000;
// les deux dates sont des "AAAA-MM-JJ" parsés en UTC → différence exacte en jours
const spanDays = (a: string, b: string) =>
	Math.round((Date.parse(b) - Date.parse(a)) / DAY);

// 0 = lundi … 6 = dimanche (semaine française)
const dayOfWeek = (ymd: string) => {
	const [y, m, d] = ymd.split('-').map(Number);
	return (new Date(y, m - 1, d).getDay() + 6) % 7;
};

const level = (count: number) => Math.min(count, 5);

function capturesByDay(events: JournalEvent[]): Map<string, number> {
	const byDay = new Map<string, number>();
	for (const e of events) {
		if (e.t === 'task' || e.t === 'note')
			byDay.set(e.d, (byDay.get(e.d) ?? 0) + 1);
	}

	return byDay;
}

function streakFrom(byDay: Map<string, number>, start: string): number {
	let n = 0;
	let d = start;
	while (byDay.has(d)) {
		n++;
		d = addDays(d, -1);
	}

	return n;
}

function longestStreak(byDay: Map<string, number>): number {
	const days = [...byDay.keys()].sort();
	let best = 0;
	let run = 0;
	let prev: string | null = null;
	for (const d of days) {
		run = prev !== null && addDays(prev, 1) === d ? run + 1 : 1;
		if (run > best) best = run;
		prev = d;
	}

	return best;
}

// étage déterminé par la plus vieille date du journal : < 4 semaines → bande
// jour par jour ; 4–12 semaines → grille 4 semaines ; 12+ → grille 12 semaines
function buildHeatmap(
	byDay: Map<string, number>,
	events: JournalEvent[],
	todayYmd: string,
): Heatmap {
	let oldest = todayYmd;
	for (const e of events) if (e.d < oldest) oldest = e.d;
	const dataDays = spanDays(oldest, todayYmd) + 1;
	const cellAt = (d: string): HeatCell => {
		const count = byDay.get(d) ?? 0;
		return {d, count, level: level(count)};
	};

	if (dataDays < 4 * 7) {
		const n = Math.max(dataDays, 7); // jamais moins d'une semaine affichée
		const cells: HeatCell[] = [];
		for (let i = n - 1; i >= 0; i--) cells.push(cellAt(addDays(todayYmd, -i)));
		return {kind: 'band', cells};
	}

	const weekCount = dataDays < 12 * 7 ? 4 : 12;
	const monday = addDays(todayYmd, -dayOfWeek(todayYmd));
	const weeks: Array<Array<HeatCell | null>> = [];
	for (let w = weekCount - 1; w >= 0; w--) {
		const start = addDays(monday, -7 * w);
		const col: Array<HeatCell | null> = [];
		for (let i = 0; i < 7; i++) {
			const d = addDays(start, i);
			col.push(d > todayYmd ? null : cellAt(d));
		}

		weeks.push(col);
	}

	return {kind: 'grid', weeks};
}

// fenêtre glissante 7 jours : captées vs finies (done − undone par jour, borné à 0)
function buildFlux(events: JournalEvent[], todayYmd: string) {
	const start = addDays(todayYmd, -6);
	const perDay = new Map<
		string,
		{captured: number; done: number; undone: number}
	>();
	for (const e of events) {
		if (e.d < start || e.d > todayYmd) continue;
		const b = perDay.get(e.d) ?? {captured: 0, done: 0, undone: 0};
		if (e.t === 'done') b.done++;
		else if (e.t === 'undone') b.undone++;
		else b.captured++;
		perDay.set(e.d, b);
	}

	const days: FluxDay[] = [];
	for (let i = 6; i >= 0; i--) {
		const d = addDays(todayYmd, -i);
		const b = perDay.get(d);
		days.push({
			d,
			captured: b?.captured ?? 0,
			finished: Math.max(0, (b?.done ?? 0) - (b?.undone ?? 0)),
		});
	}

	const captured = days.reduce((s, x) => s + x.captured, 0);
	const finished = days.reduce((s, x) => s + x.finished, 0);
	return {days, captured, finished, delta: captured - finished};
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const s = [...values].sort((a, b) => a - b);
	const mid = Math.floor(s.length / 2);
	return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeStats(
	events: JournalEvent[],
	items: Item[],
	notes: Note[],
	todayYmd: string,
): Stats {
	const byDay = capturesByDay(events);
	let done = 0;
	let undone = 0;
	let captured = 0;
	for (const e of events) {
		if (e.t === 'done') done++;
		else if (e.t === 'undone') undone++;
		else captured++;
	}

	// grâce : la série se compte depuis aujourd'hui OU hier, elle ne casse qu'à minuit
	const graceStart = byDay.has(todayYmd) ? todayYmd : addDays(todayYmd, -1);

	// durées de vie (jours) des tâches closes — depuis tasks.json, le journal n'a pas d'identité
	const lifetimes = items.flatMap(i =>
		i.done && i.doneAt
			? [(Date.parse(i.doneAt) - Date.parse(i.createdAt)) / DAY]
			: [],
	);

	let bestDay: {d: string; count: number} | null = null;
	for (const [d, count] of byDay) {
		if (
			!bestDay ||
			count > bestDay.count ||
			(count === bestDay.count && d < bestDay.d)
		)
			bestDay = {d, count};
	}

	return {
		streak: streakFrom(byDay, graceStart),
		captured,
		finished: Math.max(0, done - undone),
		heatmap: buildHeatmap(byDay, events, todayYmd),
		flux: buildFlux(events, todayYmd),
		medianLifeDays: median(lifetimes),
		records: {
			bestDay,
			longestStreak: longestStreak(byDay),
			oldestClosedDays: lifetimes.length > 0 ? Math.max(...lifetimes) : null,
		},
		worlds: {
			openTasks: items.filter(i => !i.done).length,
			notes: notes.length,
			pinned: notes.filter(n => n.pinned).length,
		},
	};
}
