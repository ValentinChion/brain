import React from 'react';
import {Text} from 'ink';
import type {Item} from '../../core/types.ts';
import {isDue} from '../../core/view.ts';
import {color, glyph} from '../../core/theme.ts';

export default function Row({
	item,
	today,
	selected,
}: {
	item: Item;
	today: string;
	selected: boolean;
}) {
	const due = isDue(item, today);
	// tronquée dans la liste (une ligne qui wrappe fausse le budget hauteur) ;
	// sélectionnée : texte complet, ses lignes sont comptées par app.tsx
	return (
		<Text bold={selected} wrap={selected ? 'wrap' : 'truncate-end'}>
			<Text color={color.task}>{selected ? `${glyph.caret} ` : '  '}</Text>
			<Text color={due ? color.resurface : undefined}>{item.text}</Text>
			{item.remindOn && (
				<Text color={due ? color.resurface : color.dim}>
					{'  '}
					{glyph.bullet}
					{item.remindOn.slice(5)}
				</Text>
			)}
			{item.source && (
				<Text color={color.dim}>
					{'  '}
					{glyph.bullet} {item.source}
				</Text>
			)}
		</Text>
	);
}
