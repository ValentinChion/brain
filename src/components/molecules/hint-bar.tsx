import React from 'react';
import {Text} from 'ink';
import {hint} from '../../core/hints.ts';

export default function HintBar({
	world,
	mode,
}: {
	world: 'tasks' | 'notes';
	mode: 'input' | 'nav' | 'reminder' | 'prnav';
}) {
	return <Text dimColor>{hint(world, mode)}</Text>;
}
