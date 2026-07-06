import React from 'react';
import {Box, Text} from 'ink';
import {color} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';

// Squelette de la page principale : masthead + corps extensible qui pousse
// la barre de saisie et les hints tout en bas. Ne reçoit que des slots.
export default function AppLayout({
	termRows,
	accent,
	label,
	loadError,
	status,
	body,
	footer,
	hints,
}: {
	termRows: number;
	accent: string;
	label: string;
	loadError: string | null;
	status: React.ReactNode;
	body: React.ReactNode;
	footer: React.ReactNode;
	hints: React.ReactNode;
}) {
	return (
		<Box flexDirection="column" height={termRows}>
			<Masthead accent={accent} label={label} />
			<Box flexDirection="column" flexGrow={1} paddingX={1} paddingBottom={1}>
				{loadError && <Text color={color.danger}>{loadError}</Text>}
				{status && <Box marginBottom={1}>{status}</Box>}

				{/* corps extensible : pousse la barre de saisie + hints tout en bas */}
				<Box flexGrow={1} flexDirection="column">
					{body}
				</Box>

				<Box marginTop={1}>{footer}</Box>

				<Box marginTop={1}>{hints}</Box>
			</Box>
		</Box>
	);
}
