import React from 'react';
import {Box, Text} from 'ink';
import type {Item} from '../../core/types.ts';
import {color, glyph} from '../../core/theme.ts';
import Row from '../atoms/row.tsx';

export default function TasksBody({
	visible,
	shown,
	start,
	end,
	due,
	dueRule,
	today,
	active,
	selectedId,
}: {
	visible: Item[];
	shown: Item[];
	start: number;
	end: number;
	due: Item[];
	dueRule: string;
	today: string;
	active: boolean;
	selectedId: string | undefined;
}) {
	return (
		<Box flexDirection="column">
			{visible.length === 0 && (
				<Text dimColor>
					Rien pour l'instant. Écris ci-dessous pour capturer.
				</Text>
			)}
			{start > 0 && (
				<Text dimColor>
					{glyph.moreUp} {start} de plus
				</Text>
			)}
			{due.length > 0 && start === 0 && (
				<Text color={color.resurface}>{dueRule}</Text>
			)}
			{shown.map(it => (
				<Row
					key={it.id}
					item={it}
					today={today}
					selected={active && selectedId === it.id}
				/>
			))}
			{end < visible.length && (
				<Text dimColor>
					{glyph.moreDown} {visible.length - end} de plus
				</Text>
			)}
		</Box>
	);
}
