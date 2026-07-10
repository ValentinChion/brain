import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import type {CommandInfo} from '../../core/commands.ts';

// Menu des commandes sous la barre de saisie : affichage pur — la sélection et
// le clavier (↑/↓/Entrée/Tab/Échap) vivent dans app.tsx. Une ligne par commande,
// caret en gouttière sur la sélection, description en dim.
export default function CommandMenu({
	matches,
	selected,
	accent,
}: {
	matches: CommandInfo[];
	selected: number;
	accent: string;
}) {
	const width = Math.max(...matches.map(m => m.name.length));
	return (
		<Box flexDirection="column" marginLeft={2}>
			{matches.map((m, i) => (
				<Box key={m.name}>
					<Text
						bold={i === selected}
						color={i === selected ? accent : undefined}
					>
						{i === selected ? glyph.caret : ' '} /{m.name.padEnd(width)}
					</Text>
					<Text color={color.dim}> {m.description}</Text>
				</Box>
			))}
		</Box>
	);
}
