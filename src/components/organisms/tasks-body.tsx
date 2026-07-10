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
	dueCount,
	today,
	active,
	selectedId,
}: {
	visible: Item[];
	shown: Item[];
	start: number;
	end: number;
	dueCount: number;
	today: string;
	active: boolean;
	selectedId: string | undefined;
}) {
	return (
		<Box flexDirection="column">
			{/* entête d'alerte : rien à dire les jours sans échéance → pas de ligne.
			    Remplace l'ancienne bannière pleine largeur ; les tâches dues sont
			    déjà en `resurface` dans Row. */}
			{dueCount > 0 && start === 0 && (
				<Text color={color.resurface}>
					▦ {dueCount} ressort{dueCount > 1 ? 'ent' : ''}
				</Text>
			)}
			{visible.length === 0 && (
				<Text color={color.faint}>
					Rien pour l'instant. Écris ci-dessous pour capturer.
				</Text>
			)}
			{start > 0 && (
				<Text color={color.dim}>
					{glyph.moreUp} {start} de plus
				</Text>
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
				<Text color={color.dim}>
					{glyph.moreDown} {visible.length - end} de plus
				</Text>
			)}
		</Box>
	);
}
