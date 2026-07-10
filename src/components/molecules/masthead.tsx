import React from 'react';
import {Box, Text, useWindowSize} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import BrainSprite from '../atoms/brain-sprite.tsx';

// Le mot-marque porte le dégradé braise, caractère par caractère : « br » ember,
// « a » amber, « in » gold. Fixe — il ne change pas avec le monde (le libellé
// dessous s'en charge). Le cerveau pixel reste l'identité, couleurs inchangées.
function Wordmark() {
	return (
		<Text bold>
			<Text color={color.ember}>br</Text>
			<Text color={color.amber}>a</Text>
			<Text color={color.gold}>in</Text>
		</Text>
	);
}

// Hauteur rendue : 6 lignes (sprite 4 + filet 1 + marginBottom 1). Si ça change,
// le terme `chrome` d'app.tsx doit suivre, sinon la liste déborde du terminal.
export default function Masthead({label}: {label: string}) {
	// le filet lit la largeur lui-même : les écrans de takeover (ménage, débrief,
	// changelog, connexion) montent le masthead sans avoir de `cols` à passer.
	const {columns} = useWindowSize();
	// paddingX={1} de part et d'autre → le filet fait columns - 2
	const rule = glyph.rule.repeat(Math.max(1, columns - 2));
	return (
		<Box flexDirection="column" paddingX={1} marginBottom={1}>
			<Box>
				<BrainSprite />
				<Box flexDirection="column" justifyContent="center" marginLeft={2}>
					<Wordmark />
					<Text color={color.world}>{label}</Text>
				</Box>
			</Box>
			<Text color={color.rule}>{rule}</Text>
		</Box>
	);
}
