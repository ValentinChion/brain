import React from 'react';
import {Text} from 'ink';
import {hint} from '../../core/hints.ts';

export default function HintBar({
	world,
	mode,
	menuOpen = false,
}: {
	world: 'tasks' | 'notes';
	mode: 'input' | 'nav' | 'reminder' | 'prnav';
	menuOpen?: boolean;
}) {
	return <Text dimColor>{hint(world, mode, menuOpen)}</Text>;
}
