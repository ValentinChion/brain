import React from 'react';
import {Box, Text} from 'ink';
import type {Meeting} from '../../core/types.ts';
import {color, glyph} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';
import MultilineInput from '../atoms/multiline-input.tsx';

export default function DebriefView({
	meeting,
	phase,
	remaining,
	draft,
	onChange,
	onSubmit,
	onSkip,
}: {
	meeting: Meeting;
	phase: 'actions' | 'infos';
	remaining: number;
	draft: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onSkip: () => void;
}) {
	const accent = phase === 'actions' ? color.task : color.note;
	const question =
		phase === 'actions' ? '✅ Actions à faire ?' : '📝 Infos à garder ?';
	return (
		<Box flexDirection="column">
			<Masthead accent={accent} label="DEBRIEF" />
			<Box flexDirection="column" paddingX={1} paddingBottom={1}>
				<Text color={accent}>
					{meeting.title}
					{remaining > 1 ? `  (${remaining - 1} autre(s) après)` : ''}
				</Text>
				<Box marginTop={1}>
					<Text color={accent}>{question}</Text>
				</Box>
				<Box>
					<Text color={accent}>{glyph.prompt} </Text>
					<MultilineInput
						value={draft}
						onChange={onChange}
						onSubmit={onSubmit}
						onCancel={onSkip}
						focus
						placeholder="une par ligne…"
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Entrée: valider · Shift+Entrée: ligne · Échap: passer la réunion
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
