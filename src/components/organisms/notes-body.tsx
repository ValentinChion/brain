import React from 'react';
import {Box, Text} from 'ink';
import type {Note} from '../../core/types.ts';
import {color, glyph} from '../../core/theme.ts';
import NoteRow from '../atoms/note-row.tsx';

export default function NotesBody({
	list,
	shown,
	start,
	end,
	active,
	selectedId,
}: {
	list: Note[];
	shown: Note[];
	start: number;
	end: number;
	active: boolean;
	selectedId: string | undefined;
}) {
	// cf. tasks-body : pendant le scroll, les lignes « N de plus » du haut et du
	// bas sont réservées (vides si rien) pour que la liste ne saute pas.
	const scrolling = shown.length < list.length;
	return (
		<Box flexDirection="column">
			{list.length === 0 && (
				<Text color={color.dim}>
					Aucune note. Écris ci-dessous, ou Tab pour les tâches.
				</Text>
			)}
			{start > 0 ? (
				<Text color={color.dim}>
					{glyph.moreUp} {start} de plus
				</Text>
			) : scrolling ? (
				<Text> </Text>
			) : null}
			{shown.map(note => (
				<NoteRow
					key={note.id}
					note={note}
					selected={active && selectedId === note.id}
				/>
			))}
			{end < list.length ? (
				<Text color={color.dim}>
					{glyph.moreDown} {list.length - end} de plus
				</Text>
			) : scrolling ? (
				<Text> </Text>
			) : null}
		</Box>
	);
}
