// Détection des débriefs en attente + utilitaires. Pur et testé.
import type {Meeting} from './types.ts';

export function pendingDebriefs(
	meetings: readonly Meeting[],
	nowISO: string,
	handled: readonly string[],
): Meeting[] {
	const now = new Date(nowISO).getTime();
	const done = new Set(handled);
	return meetings
		.filter(
			m => m.debriefable && !done.has(m.id) && new Date(m.end).getTime() <= now,
		)
		.sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime());
}

export function linesToItems(text: string): string[] {
	return text
		.split('\n')
		.map(l => l.trim())
		.filter(l => l.length > 0);
}

export function pruneHandled(
	handled: readonly string[],
	todaysIds: readonly string[],
): string[] {
	const today = new Set(todaysIds);
	return handled.filter(id => today.has(id));
}
