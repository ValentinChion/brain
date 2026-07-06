import React from 'react';
import {Box, Text} from 'ink';

// cerveau en pixels (échantillonné depuis la réf. fournie) : sprite 11×8,
// un demi-bloc ▀ = 2 pixels verticaux. D contour, P chair, L reflet. '.' transparent.
const PINK: Record<string, string> = {
	D: '#b45152',
	P: '#cd6666',
	L: '#ef8180',
};
const BRAIN_PX = [
	'...DPDDD...',
	'.PPLLLLLPP.',
	'DLLLLLLLLLP',
	'DLLPPPPLLLD',
	'PPLDLLLPPPP',
	'..DPLLPPLP.',
	'....DPDPP..',
	'.......PD..',
];

export default function BrainSprite() {
	const rows: React.ReactNode[] = [];
	for (let t = 0; t < BRAIN_PX.length; t += 2) {
		const top = BRAIN_PX[t];
		const bot = BRAIN_PX[t + 1] ?? '';
		const spans: React.ReactNode[] = [];
		for (const [c, ch] of [...top].entries()) {
			const tc = PINK[ch];
			const bc = PINK[bot[c] ?? '.'];
			const key = `c${c}`;
			if (tc && bc) {
				spans.push(
					<Text key={key} color={tc} backgroundColor={bc}>
						▀
					</Text>,
				);
			} else if (tc) {
				spans.push(
					<Text key={key} color={tc}>
						▀
					</Text>,
				);
			} else if (bc) {
				spans.push(
					<Text key={key} color={bc}>
						▄
					</Text>,
				);
			} else {
				spans.push(<Text key={key}> </Text>);
			}
		}

		rows.push(<Text key={`r${t}`}>{spans}</Text>);
	}

	return <Box flexDirection="column">{rows}</Box>;
}
