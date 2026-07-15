// Mise en forme des événements Google Calendar → Meeting[]. Pur et testé.

import type {Meeting} from './types.ts';

export type RawEvent = {
	id?: string;
	summary?: string;
	start?: {dateTime?: string; date?: string};
	end?: {dateTime?: string; date?: string};
	eventType?: string;
	attendees?: Array<{self?: boolean; responseStatus?: string}>;
};

type TimedEvent = RawEvent & {start: {dateTime: string}};

function isDebriefable(e: TimedEvent): boolean {
	if ((e.eventType ?? 'default') !== 'default') return false; // focus / OOO / etc.
	const attendees = e.attendees ?? [];
	const others = attendees.filter(a => !a.self).length;
	if (others < 1) return false; // besoin d'au moins un autre participant
	const me = attendees.find(a => a.self);
	return me?.responseStatus !== 'declined';
}

// on ne garde que les événements horodatés (les « journées entières » n'ont
// que `date`, pas `dateTime`), triés par heure de début.
export function shapeEvents(raw: readonly RawEvent[]): Meeting[] {
	return raw
		.filter((e): e is TimedEvent => Boolean(e.start?.dateTime))
		.map(e => ({
			id: e.id ?? '',
			title: e.summary ?? '(sans titre)',
			start: e.start.dateTime,
			end: e.end?.dateTime ?? e.start.dateTime,
			debriefable: isDebriefable(e),
		}))
		.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

export function nextMeeting(
	meetings: readonly Meeting[],
	nowISO: string,
): Meeting | null {
	const now = new Date(nowISO).getTime();
	return meetings.find(m => new Date(m.start).getTime() >= now) ?? null;
}

// --- Bandeau agenda : réunion active/à venir → descripteur peint par le .tsx ---

// urgence croissante ; le .tsx la mappe en couleur (dim → ember → amber → gold).
export type AgendaUrgency = 'idle' | 'far' | 'soon' | 'imminent' | 'live';

export type AgendaBar =
	| {kind: 'empty'} // aucune réunion aujourd'hui
	| {kind: 'done'; total: number} // toutes terminées
	| {
			kind: 'meeting';
			live: boolean; // a commencé, pas finie
			title: string;
			start: string; // ISO, pour l'affichage hh:mm côté .tsx
			minutes: number; // minutes jusqu'au début (ou jusqu'à la fin si live)
			urgency: AgendaUrgency;
			fuse: {filled: number; total: number} | null; // mèche, ou null hors fenêtre
			remaining: number; // réunions après celle-ci
	  };

const MIN = 60_000;
const FUSE_WINDOW_MIN = 90; // « run-up » max avant d'allumer la mèche
const FUSE_CELLS = 10;

// fraction [0,1] restante → cellules pleines (arrondi)
function fuse(fracRemaining: number): {filled: number; total: number} {
	const f = Math.max(0, Math.min(1, fracRemaining));
	return {filled: Math.round(f * FUSE_CELLS), total: FUSE_CELLS};
}

export function agendaBar(
	meetings: readonly Meeting[],
	nowISO: string,
): AgendaBar {
	if (meetings.length === 0) return {kind: 'empty'};
	const now = new Date(nowISO).getTime();
	// active ou à venir = première dont la fin est encore dans le futur
	const idx = meetings.findIndex(m => new Date(m.end).getTime() > now);
	if (idx === -1) return {kind: 'done', total: meetings.length};

	const m = meetings[idx];
	const start = new Date(m.start).getTime();
	const end = new Date(m.end).getTime();
	const remaining = meetings.length - idx - 1;
	const common = {
		kind: 'meeting' as const,
		title: m.title,
		start: m.start,
		remaining,
	};

	if (start <= now) {
		// en cours : la mèche montre le temps de réunion restant
		const span = Math.max(1, end - start);
		return {
			...common,
			live: true,
			minutes: Math.max(0, Math.round((end - now) / MIN)),
			urgency: 'live',
			fuse: fuse((end - now) / span),
		};
	}

	const minutes = Math.max(0, Math.round((start - now) / MIN));
	// ancre de la mèche : fin de la réunion précédente, ou début - fenêtre
	const prevEnd =
		idx > 0
			? new Date(meetings[idx - 1].end).getTime()
			: Number.NEGATIVE_INFINITY;
	const anchor = Math.max(prevEnd, start - FUSE_WINDOW_MIN * MIN);
	const span = start - anchor;
	const inWindow = now >= anchor && span > 0; // dans le run-up / le trou libre
	const urgency: AgendaUrgency =
		minutes < 10
			? 'imminent'
			: minutes < 30
			? 'soon'
			: inWindow
			? 'far'
			: 'idle';
	return {
		...common,
		live: false,
		minutes,
		urgency,
		fuse: inWindow ? fuse((start - now) / span) : null,
	};
}

// Rendu de la mèche : ▓ = restant, █ = tête qui se consume, ░ = déjà passé.
export function fuseBar(filled: number, total: number): string {
	const f = Math.max(0, Math.min(total, filled));
	if (f === 0) return '░'.repeat(total);
	return '▓'.repeat(f - 1) + '█' + '░'.repeat(total - f);
}

// Compte à rebours humain. Pur (pas de locale) → testable.
export function formatCountdown(minutes: number, live: boolean): string {
	if (live) return `finit dans ${minutes} min`;
	if (minutes <= 0) return 'maintenant';
	if (minutes < 60) return `dans ${minutes} min`;
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return m === 0 ? `dans ${h} h` : `dans ${h} h ${m}`;
}
