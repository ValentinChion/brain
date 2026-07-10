import React from 'react';
import {Text} from 'ink';
import {color} from '../../core/theme.ts';
import {hint} from '../../core/hints.ts';

export default function HintBar({
	world,
	mode,
	menuOpen = false,
	prExpanded = false,
}: {
	world: 'tasks' | 'notes';
	mode: 'input' | 'nav' | 'reminder' | 'prnav';
	menuOpen?: boolean;
	prExpanded?: boolean;
}) {
	return (
		<Text color={color.faint}>{hint(world, mode, menuOpen, prExpanded)}</Text>
	);
}
