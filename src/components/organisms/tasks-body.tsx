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
	// la fenêtre montre moins que tout → on scrolle. Dans ce cas les lignes
	// « N de plus » du haut et du bas sont toujours réservées (vides si rien à
	// dire) pour que la liste ne saute pas d'une ligne au passage d'un bord.
	const scrolling = shown.length < visible.length;
	return (
		<Box flexDirection="column">
			{visible.length === 0 && (
				<Text color={color.faint}>
					Rien pour l'instant. Écris ci-dessous pour capturer.
				</Text>
			)}
			{/* ligne du haut : ▲ si scrollé, sinon entête d'échéance (les tâches
			    dues sont déjà en `resurface` dans Row), sinon vide pendant le scroll */}
			{start > 0 ? (
				<Text color={color.dim}>
					{glyph.moreUp} {start} de plus
				</Text>
			) : dueCount > 0 ? (
				<Text color={color.resurface}>
					▦ {dueCount} ressort{dueCount > 1 ? 'ent' : ''}
				</Text>
			) : scrolling ? (
				<Text> </Text>
			) : null}
			{shown.map(it => (
				<Row
					key={it.id}
					item={it}
					today={today}
					selected={active && selectedId === it.id}
				/>
			))}
			{end < visible.length ? (
				<Text color={color.dim}>
					{glyph.moreDown} {visible.length - end} de plus
				</Text>
			) : scrolling ? (
				<Text> </Text>
			) : null}
		</Box>
	);
}
