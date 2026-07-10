import React from 'react';
import {Box, Text} from 'ink';
import {color} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';
import Panel from '../atoms/panel.tsx';

// Sous ce seuil, le chrome (masthead 6 + panneaux + saisie + hints) ne laisse
// plus une seule ligne de liste. Un seul chemin de rendu au-dessus : pas de
// mode compact à maintenir en parallèle du budget hauteur.
export const MIN_ROWS = 20;

// Squelette de la page principale : masthead + corps cadré qui pousse la barre
// de saisie et les hints tout en bas. Ne reçoit que des slots.
export default function AppLayout({
	termRows,
	label,
	loadError,
	status,
	body,
	footer,
	hints,
}: {
	termRows: number;
	label: string;
	loadError: string | null;
	status: React.ReactNode;
	body: React.ReactNode;
	footer: React.ReactNode;
	hints: React.ReactNode;
}) {
	// termRows === 0 sous ink-testing-library (pas de vrai stdout) : ne pas
	// dégainer l'écran minimal là où il n'y a pas de terminal à agrandir.
	if (termRows > 0 && termRows < MIN_ROWS) {
		return (
			<Box height={termRows} alignItems="center" justifyContent="center">
				<Text color={color.faint}>
					brain a besoin de {MIN_ROWS} lignes · agrandis le panneau 🍸
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" height={termRows}>
			<Masthead label={label} />
			<Box flexDirection="column" flexGrow={1} paddingX={1} paddingBottom={1}>
				{loadError && <Text color={color.danger}>{loadError}</Text>}
				{status && (
					<Box flexDirection="column" marginBottom={1}>
						{status}
					</Box>
				)}

				{/* corps cadré et extensible : pousse la saisie + hints tout en bas */}
				<Panel grow>{body}</Panel>

				<Box marginTop={1}>{footer}</Box>

				<Box marginTop={1}>{hints}</Box>
			</Box>
		</Box>
	);
}
