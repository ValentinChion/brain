import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';

// Vue plein écran des nouveautés : lignes pré-formatées par changelogLines(),
// fenêtrées par app.tsx (offset + rows) — le composant ne fait que rendre.
export default function ChangelogView({
	lines,
	offset,
	rows,
	loadError,
}: {
	lines: string[];
	offset: number;
	rows: number;
	loadError: string | null;
}) {
	const end = Math.min(lines.length, offset + rows);
	// clé = numéro de ligne absolu dans le changelog (stable pendant le défilement)
	const shown = lines
		.slice(offset, end)
		.map((line, i) => ({line, n: offset + i}));
	return (
		<Box flexDirection="column">
			<Masthead accent={color.task} label="NOUVEAUTÉS" />
			<Box flexDirection="column" paddingX={1} paddingBottom={1}>
				{loadError && <Text color={color.danger}>{loadError}</Text>}
				{offset > 0 && (
					<Text dimColor>
						{glyph.moreUp} {offset} au-dessus
					</Text>
				)}
				{shown.map(({line, n}) => (
					<Text
						key={n}
						color={line.startsWith('v') ? color.task : undefined}
						bold={line.startsWith('v')}
					>
						{/* un <Text> vide ne rend pas de ligne : l'espace préserve la ligne vide entre versions */}
						{line || ' '}
					</Text>
				))}
				{end < lines.length && (
					<Text dimColor>
						{glyph.moreDown} {lines.length - end} de plus
					</Text>
				)}
				<Box marginTop={1}>
					<Text dimColor>↑↓ défiler · [Entrée/Échap] fermer</Text>
				</Box>
			</Box>
		</Box>
	);
}
