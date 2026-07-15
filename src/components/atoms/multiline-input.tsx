import React, {useEffect, useRef, useState} from 'react';
import {Text, useInput} from 'ink';
import {color} from '../../core/theme.ts';
import {
	decodeKey,
	applyEdit,
	atFirstLine,
	atLastLine,
} from '../../core/multiline.ts';

// Le protocole clavier kitty (Shift+Entrée distinct, modificateurs Option/Cmd)
// est géré globalement par Ink 7 (render option kittyKeyboard dans cli.tsx).

type Props = {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onCancel: () => void;
	focus?: boolean;
	placeholder?: string;
	onExitUp?: () => void;
	onExitDown?: () => void;
};

export default function MultilineInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	focus = true,
	placeholder = '',
	onExitUp,
	onExitDown,
}: Props) {
	const [cursor, setCursor] = useState(value.length);

	// resync du curseur quand `value` change depuis l'extérieur (soumission qui
	// vide le champ, `e` qui charge une note existante) : on place le curseur en
	// fin. `emitted` retient la dernière valeur qu'on a nous-mêmes produite.
	const emitted = useRef(value);
	useEffect(() => {
		if (value !== emitted.current) {
			emitted.current = value;
			setCursor(value.length);
		}
	}, [value]);

	useInput(
		(input, key) => {
			// Maj+↑/↓ : saut de section (le parent route via onExit*), même en
			// plein milieu d'un texte multi-lignes — on ne bouge pas le curseur.
			if (key.shift && (key.upArrow || key.downArrow)) {
				if (key.upArrow) onExitUp?.();
				else onExitDown?.();
				return;
			}

			const action = decodeKey(input, key);
			if (action.type === 'submit') {
				onSubmit(value);
				return;
			}

			if (action.type === 'cancel') {
				onCancel();
				return;
			}

			if (action.type === 'ignore') return;

			if (action.type === 'move' && action.unit === 'vertical') {
				if (action.dir === 'up' && atFirstLine(value, cursor)) {
					onExitUp?.();
					return;
				}

				if (action.dir === 'down' && atLastLine(value, cursor)) {
					onExitDown?.();
					return;
				}
			}

			const next = applyEdit(value, cursor, action);
			setCursor(next.cursor);
			if (next.value !== value) {
				emitted.current = next.value;
				onChange(next.value);
			}
		},
		{isActive: focus},
	);

	// hors focus : rendu simple (pas de curseur).
	if (!focus) {
		return value.length === 0 ? (
			<Text color={color.faint}>{placeholder}</Text>
		) : (
			<Text>{value}</Text>
		);
	}

	if (value.length === 0) {
		return (
			<Text color={color.dim}>
				<Text inverse> </Text>
				{placeholder}
			</Text>
		);
	}

	// curseur au milieu du texte : on inverse le caractère au curseur (ou une
	// espace en fin de ligne / de texte / sur un `\n`), le reste s'affiche normal.
	const c = Math.max(0, Math.min(cursor, value.length));
	const before = value.slice(0, c);
	const ch = value[c];
	const onNewlineOrEnd = ch === undefined || ch === '\n';

	return (
		<Text>
			{before}
			<Text inverse>{onNewlineOrEnd ? ' ' : ch}</Text>
			{onNewlineOrEnd ? value.slice(c) : value.slice(c + 1)}
		</Text>
	);
}
