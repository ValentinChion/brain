import React from 'react';
import {Box, Text} from 'ink';
import MultilineInput from '../atoms/multiline-input.tsx';
import {color, glyph} from '../../core/theme.ts';

// Barre de saisie : les deux mondes partagent MultilineInput (curseur + édition
// inline). Seuls le libellé et la couleur du prompt changent.
export default function InputBar({
	world,
	editing,
	value,
	focus,
	placeholder,
	onChange,
	onSubmit,
	onCancel,
	onExitUp,
	onExitDown,
}: {
	world: 'tasks' | 'notes';
	editing: boolean;
	value: string;
	focus: boolean;
	placeholder: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onCancel?: () => void;
	onExitUp?: () => void;
	onExitDown?: () => void;
}) {
	const prompt = editing ? `${glyph.editing} ` : `${glyph.prompt} `;
	const label = world === 'tasks' ? '[tâche]' : '[note]';
	return (
		<Box>
			<Text color={world === 'tasks' ? color.task : color.note}>
				{prompt}
				{label}{' '}
			</Text>
			<MultilineInput
				value={value}
				focus={focus}
				placeholder={placeholder}
				onChange={onChange}
				onSubmit={onSubmit}
				onCancel={onCancel ?? (() => undefined)}
				onExitUp={onExitUp}
				onExitDown={onExitDown}
			/>
		</Box>
	);
}
