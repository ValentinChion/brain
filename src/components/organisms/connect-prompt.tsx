import React from 'react';
import {Box, Text} from 'ink';
import {color} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';

// Modal de démarrage (même famille que sweep-view) : proposer la connexion agenda.
export default function ConnectPrompt({loadError}: {loadError: string | null}) {
	return (
		<Box flexDirection="column">
			<Masthead label="AGENDA" />
			<Box flexDirection="column" paddingX={1} paddingBottom={1}>
				{loadError && <Text color={color.danger}>{loadError}</Text>}
				<Box flexDirection="column" marginTop={1}>
					<Text color={color.task}>Connecter ton agenda Google ?</Text>
					<Text color={color.dim}>
						Ouvre le navigateur pour autoriser la lecture de tes réunions du
						jour.
					</Text>
					<Box marginTop={1}>
						<Text color={color.faint}>
							[o] oui · [n] plus tard (rejouable via /gauth)
						</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
