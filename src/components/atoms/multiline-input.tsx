import React, {useEffect, useRef, useState} from 'react';
import {Text, useInput, useStdout} from 'ink';
import {decodeKey, applyEdit} from '../../core/multiline.ts';

// Protocole clavier kitty (Ghostty) : « désambigue » les touches pour que
// Shift+Entrée arrive distinct (CSI 13;2u) au lieu d'être confondu avec Entrée,
// et pour que les touches modifiées (Option/Cmd + flèches) arrivent en séquences
// distinctes. On l'active tant que le champ a le focus, on le désactive en sortant.
const ESC = String.fromCodePoint(27);
const KITTY_PUSH = `${ESC}[>1u`;
const KITTY_POP = `${ESC}[<u`;

type Props = {
	value: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onCancel: () => void;
	focus?: boolean;
	placeholder?: string;
};

export default function MultilineInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	focus = true,
	placeholder = '',
}: Props) {
	const {stdout} = useStdout();
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

	useEffect(() => {
		if (!focus) return;
		stdout.write(KITTY_PUSH);
		return () => {
			stdout.write(KITTY_POP);
		};
	}, [focus, stdout]);

	useInput(
		(input, key) => {
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
			<Text dimColor>{placeholder}</Text>
		) : (
			<Text>{value}</Text>
		);
	}

	if (value.length === 0) {
		return (
			<Text dimColor>
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
