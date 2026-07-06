import {randomUUID} from 'node:crypto';
import type {Item} from './types.ts';

export function addItem(items: Item[], text: string, nowISO: string): Item[] {
	const item: Item = {
		id: randomUUID(),
		text,
		createdAt: nowISO,
		remindOn: null,
		done: false,
		doneAt: null,
	};
	return [...items, item];
}

const patch = (items: Item[], id: string, fn: (i: Item) => Item): Item[] =>
	items.map(i => (i.id === id ? fn(i) : i));

export function editText(items: Item[], id: string, text: string): Item[] {
	return patch(items, id, i => ({...i, text}));
}

export function setDone(
	items: Item[],
	id: string,
	done: boolean,
	nowISO: string,
): Item[] {
	return patch(items, id, i => ({...i, done, doneAt: done ? nowISO : null}));
}

export function setReminder(
	items: Item[],
	id: string,
	remindOn: string | null,
): Item[] {
	return patch(items, id, i => ({...i, remindOn}));
}

export function removeItem(items: Item[], id: string): Item[] {
	return items.filter(i => i.id !== id);
}
