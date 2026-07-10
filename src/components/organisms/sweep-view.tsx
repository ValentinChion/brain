import React from 'react';
import {Box, Text} from 'ink';
import type {Note} from '../../core/types.ts';
import {color} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';

export default function SweepView({
	list,
	mode,
	index,
	loadError,
}: {
	list: Note[];
	mode: 'bulk' | 'review';
	index: number;
	loadError: string | null;
}) {
	const current = list[index];
	return (
		<Box flexDirection="column">
			<Masthead label="MÉNAGE" />
			<Box flexDirection="column" paddingX={1} paddingBottom={1}>
				{loadError && <Text color={color.danger}>{loadError}</Text>}
				{mode === 'bulk' ? (
					<Box flexDirection="column" marginTop={1}>
						<Text color={color.note}>
							{list.length} note{list.length > 1 ? 's' : ''} de plus d'une
							semaine :
						</Text>
						{list.slice(0, 8).map(note => (
							<Text key={note.id} color={color.dim}>
								{'  · '}
								{note.text.split('\n')[0]}
							</Text>
						))}
						{list.length > 8 && (
							<Text color={color.dim}>
								{'  '}… et {list.length - 8} autres
							</Text>
						)}
						<Box marginTop={1}>
							<Text color={color.dim}>
								[d] tout supprimer · [k] tout garder · [r] passer en revue
							</Text>
						</Box>
					</Box>
				) : (
					<Box flexDirection="column" marginTop={1}>
						<Text color={color.note}>
							Note {index + 1}/{list.length} :
						</Text>
						<Text>{current?.text ?? ''}</Text>
						<Box marginTop={1}>
							<Text color={color.faint}>
								[k] garder · [d] supprimer · [p] épingler
							</Text>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}
