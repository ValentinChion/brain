import React from 'react';
import {Box, Text} from 'ink';
import BrainSprite from '../atoms/brain-sprite.tsx';

export default function Masthead({
	accent,
	label,
	compact = false,
}: {
	accent: string;
	label: string;
	compact?: boolean;
}) {
	// compact (terminal bas) : une seule ligne, le sprite coûterait 20 % de l'écran
	if (compact) {
		return (
			<Box paddingX={1} marginBottom={1}>
				<Text bold color={accent}>
					Brain
				</Text>
				<Text dimColor> · {label}</Text>
			</Box>
		);
	}

	// cerveau pixel = identité constante ; le mot-marque prend la couleur du monde
	return (
		<Box paddingX={1} marginBottom={1}>
			<BrainSprite />
			<Box flexDirection="column" justifyContent="center" marginLeft={2}>
				<Text bold color={accent}>
					Brain
				</Text>
				<Text dimColor>{label}</Text>
			</Box>
		</Box>
	);
}
