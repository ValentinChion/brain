import React from 'react';
import {Box, Text} from 'ink';
import {color} from '../../core/theme.ts';

// Panneau cadré : la seule définition de bordure de l'app. Chrome neutre et
// chaud — la couleur reste réservée aux données. `title` optionnel : un panneau
// sans rien à annoncer n'emporte pas de ligne de titre.
export default function Panel({
	title,
	grow = false,
	children,
}: {
	title?: string;
	grow?: boolean;
	children: React.ReactNode;
}) {
	return (
		<Box
			flexDirection="column"
			flexGrow={grow ? 1 : 0}
			flexBasis={grow ? 0 : undefined}
			borderStyle="round"
			borderColor={color.chrome}
			paddingX={1}
		>
			{title !== undefined && <Text bold>{title}</Text>}
			{children}
		</Box>
	);
}
