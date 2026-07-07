import React from 'react';
import {Text} from 'ink';
import type {Note} from '../../core/types.ts';
import {color, glyph} from '../../core/theme.ts';

export default function NoteRow({
	note,
	selected,
}: {
	note: Note;
	selected: boolean;
}) {
	const lines = note.text.split('\n');
	const extra = lines.length - 1;
	// gouttière fixe 2 colonnes (caret + épingle) → les corps s'alignent
	return (
		<Text bold={selected}>
			<Text color={color.note}>{selected ? glyph.caret : ' '}</Text>
			<Text color={color.pinned}>{note.pinned ? glyph.pin : ' '}</Text>{' '}
			{selected ? note.text : lines[0]}
			{!selected && extra > 0 && (
				<Text dimColor>
					{'  '}
					{glyph.multiline} +{extra}
				</Text>
			)}
			{note.source && (
				<Text dimColor>
					{'  '}
					{glyph.bullet} {note.source}
				</Text>
			)}
		</Text>
	);
}
