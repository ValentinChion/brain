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

export function summary(
	meetings: readonly Meeting[],
	nowISO: string,
): {count: number; next: Meeting | null} {
	return {count: meetings.length, next: nextMeeting(meetings, nowISO)};
}
