import React from 'react';
import {Box, Text} from 'ink';
import type {Note} from '../../core/types.ts';
import {glyph} from '../../core/theme.ts';
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
	return (
		<Box flexDirection="column">
			{list.length === 0 && (
				<Text dimColor>
					Aucune note. Écris ci-dessous, ou Tab pour les tâches.
				</Text>
			)}
			{start > 0 && (
				<Text dimColor>
					{glyph.moreUp} {start} de plus
				</Text>
			)}
			{shown.map(note => (
				<NoteRow
					key={note.id}
					note={note}
					selected={active && selectedId === note.id}
				/>
			))}
			{end < list.length && (
				<Text dimColor>
					{glyph.moreDown} {list.length - end} de plus
				</Text>
			)}
		</Box>
	);
}
