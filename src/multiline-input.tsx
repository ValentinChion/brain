import React, {useEffect} from 'react';
import {Text, useInput, useStdout} from 'ink';
import {decodeKey} from './multiline.ts';

// Protocole clavier kitty (Ghostty) : « désambigue » les touches pour que
// Shift+Entrée arrive distinct (CSI 13;2u) au lieu d'être confondu avec Entrée.
// On l'active tant que le champ a le focus, on le désactive en sortant —
// ailleurs (nav), Ink garde son décodage normal (Échap, flèches).
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
			switch (action.type) {
				case 'newline': {
					onChange(`${value}\n`);
					break;
				}

				case 'submit': {
					onSubmit(value);
					break;
				}

				case 'cancel': {
					onCancel();
					break;
				}

				case 'backspace': {
					onChange(value.slice(0, -1));
					break;
				}

				case 'insert': {
					onChange(value + action.text);
					break;
				}

				default: {
					break;
				}
			}
		},
		{isActive: focus},
	);

	// ponytail: curseur en fin de saisie ; pas de navigation curseur multi-ligne (YAGNI)
	return (
		<Text dimColor={value.length === 0}>
			{value.length > 0 ? value : placeholder}
			{focus ? '▏' : ''}
		</Text>
	);
}
