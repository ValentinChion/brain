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
	return (
		<Text bold={selected}>
			<Text color={color.task}>{selected ? `${glyph.caret} ` : '  '}</Text>
			<Text color={due ? color.resurface : undefined}>{item.text}</Text>
			{item.remindOn && (
				<Text color={due ? color.resurface : undefined} dimColor={!due}>
					{'  '}
					{glyph.bullet}
					{item.remindOn.slice(5)}
				</Text>
			)}
			{item.source && (
				<Text dimColor>
					{'  '}
					{glyph.bullet} {item.source}
				</Text>
			)}
		</Text>
	);
}
