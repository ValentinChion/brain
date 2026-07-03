import {randomUUID} from 'node:crypto';
import type {Note} from './types.ts';
import {todayYMD, addDays} from './date.ts';

export function addNote(notes: Note[], text: string, nowISO: string): Note[] {
	return [...notes, {id: randomUUID(), text, createdAt: nowISO, pinned: false}];
}

const patch = (notes: Note[], id: string, fn: (n: Note) => Note): Note[] =>
	notes.map(n => (n.id === id ? fn(n) : n));

export function editNote(notes: Note[], id: string, text: string): Note[] {
	return patch(notes, id, n => ({...n, text}));
}

export function removeNote(notes: Note[], id: string): Note[] {
	return notes.filter(n => n.id !== id);
}

export function togglePin(notes: Note[], id: string): Note[] {
	return patch(notes, id, n => ({...n, pinned: !n.pinned}));
}

// épinglées d'abord ; dans chaque groupe, createdAt décroissant (plus récente en haut)
export function sortNotes(notes: Note[]): Note[] {
	return [...notes].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
		return b.createdAt.localeCompare(a.createdAt);
	});
}

// date LOCALE de createdAt (cohérent avec todayYMD v1), strictement avant today − 7j
export function isStale(note: Note, todayYmd: string): boolean {
	if (note.pinned) return false;
	const created = todayYMD(new Date(note.createdAt));
	return created < addDays(todayYmd, -7);
}

export function staleNotes(notes: Note[], todayYmd: string): Note[] {
	return sortNotes(notes).filter(n => isStale(n, todayYmd));
}

export function sweepStale(notes: Note[], todayYmd: string): Note[] {
	return notes.filter(n => !isStale(n, todayYmd));
}
