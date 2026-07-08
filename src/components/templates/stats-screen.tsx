import React from 'react';
import {Box, Text} from 'ink';
import type {HeatCell, Stats} from '../../core/stats.ts';
import {color, glyph, statsPalette} from '../../core/theme.ts';

// Rendu muet de `Stats` (calculé par stats.ts à l'ouverture) — zéro logique métier.
// Esthétique néon volontairement en rupture : convoquer /stats fait événement.

export const STATS_MIN_ROWS = 22;
const SPARK = '▁▂▃▄▅▆▇█';
const neon = statsPalette[statsPalette.length - 1]; // cyan électrique

// dégradé true-color caractère par caractère sur la rampe néon
function Gradient({text}: {text: string}) {
	const chars = [...text];
	return (
		<Text bold>
			{chars.map((ch, i) => (
				<Text
					// eslint-disable-next-line react/no-array-index-key
					key={i}
					color={
						statsPalette[
							Math.min(
								statsPalette.length - 1,
								Math.floor((i / chars.length) * statsPalette.length),
							)
						]
					}
				>
					{ch}
				</Text>
			))}
		</Text>
	);
}

// cellule de heatmap : futur → blanc, jour vide → point estompé, sinon palier néon
function Cell({cell}: {cell: HeatCell | null}) {
	if (cell === null) return <Text> </Text>;
	if (cell.level === 0) return <Text dimColor>· </Text>;
	return <Text color={statsPalette[cell.level - 1]}>■ </Text>;
}

function Spark({counts, tint}: {counts: number[]; tint: string}) {
	const max = Math.max(...counts, 1);
	return (
		<Text color={tint}>
			{counts
				.map(c => SPARK[c === 0 ? 0 : Math.max(1, Math.round((c / max) * 7))])
				.join('')}
		</Text>
	);
}

function Label({children}: {children: string}) {
	// libellé de zone : largeur fixe pour aligner les contenus
	return <Text dimColor>{children.padEnd(11)}</Text>;
}

const formatDays = (n: number | null) =>
	n === null ? '—' : n < 1 ? '<1 j' : `${Math.round(n)} j`;

export default function StatsScreen({
	stats,
	prCount,
	termRows,
}: {
	stats: Stats;
	prCount: number | null; // null = Azure non connecté → segment omis
	termRows: number;
}) {
	if (termRows < STATS_MIN_ROWS) {
		return (
			<Box height={termRows} alignItems="center" justifyContent="center">
				<Text dimColor>
					terminal trop petit pour /stats ({STATS_MIN_ROWS} lignes min) ·
					[Échap] fermer
				</Text>
			</Box>
		);
	}

	const {heatmap, flux, records, worlds} = stats;
	const heatRows =
		heatmap.kind === 'band'
			? [heatmap.cells]
			: Array.from({length: 7}, (_, i) => heatmap.weeks.map(w => w[i]));

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box
				alignSelf="flex-start"
				paddingX={2}
				borderColor={statsPalette[1]}
				borderStyle={{
					topLeft: '▛',
					top: '▀',
					topRight: '▜',
					left: '▌',
					right: '▐',
					bottomLeft: '▙',
					bottom: '▄',
					bottomRight: '▟',
				}}
			>
				<Gradient text="B R A I N ⚡ S T A T S" />
			</Box>

			<Box marginTop={1}>
				<Text>🔥 </Text>
				<Text bold color={neon}>
					{stats.streak} j
				</Text>
				<Text dimColor> de série · </Text>
				<Text bold color={statsPalette[3]}>
					{stats.captured}
				</Text>
				<Text dimColor> captées · </Text>
				<Text bold color={statsPalette[2]}>
					{stats.finished}
				</Text>
				<Text dimColor> finies · </Text>
				<Text bold color={statsPalette[1]}>
					{worlds.openTasks}
				</Text>
				<Text dimColor> ouvertes</Text>
			</Box>

			<Box marginTop={1} flexDirection="column">
				{heatRows.map((row, i) => (
					// eslint-disable-next-line react/no-array-index-key
					<Box key={i}>
						<Label>{i === 0 ? 'activité' : ''}</Label>
						{row.map((cell, j) => (
							// eslint-disable-next-line react/no-array-index-key
							<Cell key={j} cell={cell} />
						))}
					</Box>
				))}
			</Box>

			<Box marginTop={1}>
				<Label>flux 7 j</Label>
				<Text dimColor>captées </Text>
				<Spark counts={flux.days.map(d => d.captured)} tint={neon} />
				<Text color={neon}> {flux.captured}</Text>
				<Text dimColor> · finies </Text>
				<Spark counts={flux.days.map(d => d.finished)} tint={statsPalette[2]} />
				<Text color={statsPalette[2]}> {flux.finished}</Text>
				<Text dimColor> · </Text>
				{flux.delta === 0 ? (
					<Text dimColor>= stable</Text>
				) : (
					<Text color={flux.delta > 0 ? statsPalette[2] : neon}>
						{flux.delta > 0 ? glyph.moreUp : glyph.moreDown}{' '}
						{flux.delta > 0 ? '+' : ''}
						{flux.delta} backlog
					</Text>
				)}
			</Box>

			<Box marginTop={1}>
				<Label>digestion</Label>
				<Text dimColor>médiane capture → done : </Text>
				<Text bold color={neon}>
					{formatDays(stats.medianLifeDays)}
				</Text>
			</Box>

			<Box marginTop={1}>
				<Label>records</Label>
				<Text dimColor>meilleur jour </Text>
				<Text bold color={statsPalette[3]}>
					{records.bestDay
						? `${records.bestDay.count} (${records.bestDay.d.slice(5)})`
						: '—'}
				</Text>
				<Text dimColor> · série max </Text>
				<Text bold color={statsPalette[3]}>
					{records.longestStreak > 0 ? `${records.longestStreak} j` : '—'}
				</Text>
				<Text dimColor> · plus vieille close </Text>
				<Text bold color={statsPalette[3]}>
					{formatDays(records.oldestClosedDays)}
				</Text>
			</Box>

			<Box marginTop={1}>
				<Label>mondes</Label>
				<Text color={color.task}>{worlds.openTasks} tâches ouvertes</Text>
				<Text dimColor> · </Text>
				<Text color={color.note}>{worlds.notes} notes</Text>
				{worlds.pinned > 0 && (
					<Text color={color.pinned}>
						{' '}
						({worlds.pinned} {glyph.pin})
					</Text>
				)}
				{prCount !== null && (
					<>
						<Text dimColor> · </Text>
						<Text color={color.pr}>{prCount} PRs</Text>
					</>
				)}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>[Échap] fermer</Text>
			</Box>
		</Box>
	);
}
