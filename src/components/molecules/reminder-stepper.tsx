import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';

export default function ReminderStepper({
	reminderValue,
	today,
}: {
	reminderValue: string | null;
	today: string;
}) {
	return (
		<Box flexDirection="column">
			<Text color={color.task}>⏰ rappel</Text>
			<Text>
				{glyph.stepLeft} {reminderValue ?? today} {glyph.stepRight}
			</Text>
			<Text dimColor>
				←/→ ±1 j · ↑/↓ ±1 sem · ⌫ retirer · ↵ ok · esc annuler
			</Text>
		</Box>
	);
}
