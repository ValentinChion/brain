import React from 'react';
import {Box, Text} from 'ink';
import type {HeatCell, Stats} from '../../core/stats.ts';
import {color, statsPalette} from '../../core/theme.ts';
import Panel from '../atoms/panel.tsx';

// Rendu muet de `Stats` (calculé par stats.ts à l'ouverture) — zéro logique métier.
// Esthétique « braise » : chrome neutre, la couleur (rouge sombre → or) est
// réservée aux données. Grille 2×2 : un panneau = une idée.

export const STATS_MIN_ROWS = 22;
const SPARK = '▁▂▃▄▅▆▇█';
const GAUGE_WIDTH = 14;
const [, braise, orange, ambre, or] = statsPalette;

// dégradé true-color caractère par caractère sur la rampe braise
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

// cellule de heatmap : futur → blanc, jour vide → point estompé, sinon palier braise
function Cell({cell}: {cell: HeatCell | null}) {
	if (cell === null) return <Text> </Text>;
	if (cell.level === 0) return <Text color={color.track}>· </Text>;
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

// jauge de série : remplissage en dégradé braise fixe (l'or n'apparaît qu'au bout)
function Gauge({filled}: {filled: number}) {
	return (
		<>
			<Text>
				{Array.from({length: filled}, (_, i) => (
					<Text
						key={i}
						color={
							statsPalette[
								Math.min(
									statsPalette.length - 1,
									Math.floor((i / GAUGE_WIDTH) * statsPalette.length),
								)
							]
						}
					>
						█
					</Text>
				))}
			</Text>
			<Text color={color.track}>{'░'.repeat(GAUGE_WIDTH - filled)}</Text>
		</>
	);
}

function FluxRow({
	label,
	counts,
	total,
	tint,
}: {
	label: string;
	counts: number[];
	total: number;
	tint: string;
}) {
	return (
		<Box>
			<Text color={color.dim}>{label.padEnd(9)}</Text>
			<Spark counts={counts} tint={tint} />
			<Text bold color={tint}>
				{String(total).padStart(4)}
			</Text>
		</Box>
	);
}

function RecordRow({label, value}: {label: string; value: string}) {
	return (
		<Box>
			<Text color={color.dim}>{label.padEnd(16)}</Text>
			<Text bold color={or}>
				{value}
			</Text>
		</Box>
	);
}

const formatDays = (n: number | null) =>
	n === null ? '—' : n < 1 ? '<1 j' : `${Math.round(n)} j`;

// 'L M M J V S D' — lettre du jour d'une date AAAA-MM-JJ (semaine française)
const DAY_LETTERS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
function dayLetter(ymd: string): string {
	const [y, m, d] = ymd.split('-').map(Number);
	return DAY_LETTERS[(new Date(y, m - 1, d).getDay() + 6) % 7];
}

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
				<Text color={color.faint}>
					terminal trop petit pour /stats ({STATS_MIN_ROWS} lignes min) ·
					[Échap] fermer
				</Text>
			</Box>
		);
	}

	const {heatmap, flux, records, worlds} = stats;

	// jauge de série : progression vers le record (pleine si record en cours)
	const gaugeMax = Math.max(records.longestStreak, stats.streak, 1);
	const filled =
		stats.streak === 0
			? 0
			: Math.max(1, Math.round((stats.streak / gaugeMax) * GAUGE_WIDTH));
	const recordEnCours = stats.streak > 0 && stats.streak >= gaugeMax;

	const today = new Intl.DateTimeFormat('fr-FR', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	}).format(new Date());

	return (
		<Box flexDirection="column" paddingX={1}>
			<Box justifyContent="space-between">
				<Gradient text="░▒▓█  S T A T S  █▓▒░" />
				<Text color={color.dim}>{today}</Text>
			</Box>

			<Box gap={1} marginTop={1}>
				<Panel title="🔥 SÉRIE" grow>
					<Box marginTop={1}>
						{/* Texts imbriqués (pas frères) : sinon flexbox écrase le chiffre */}
						<Text>
							<Text bold color={or}>
								{stats.streak}
							</Text>
							{` jour${stats.streak > 1 ? 's' : ''} d’affilée`}
							<Text color={color.dim}> · {stats.captured} captées</Text>
						</Text>
					</Box>
					<Box marginTop={1}>
						<Gauge filled={filled} />
						{recordEnCours ? (
							<Text bold color={ambre}>
								{' '}
								record en cours !
							</Text>
						) : (
							<Text color={color.dim}> record {records.longestStreak} j</Text>
						)}
					</Box>
				</Panel>

				<Panel title="⚡ FLUX · 7 jours" grow>
					<Box flexDirection="column" gap={1} marginTop={1}>
						<FluxRow
							label="entrées"
							counts={flux.days.map(d => d.captured)}
							total={flux.captured}
							tint={orange}
						/>
						<FluxRow
							label="sorties"
							counts={flux.days.map(d => d.finished)}
							total={flux.finished}
							tint={or}
						/>
						<Box>
							<Text color={color.dim}>{'backlog'.padEnd(9)}</Text>
							{flux.delta === 0 ? (
								<Text color={color.dim}>= stable</Text>
							) : flux.delta > 0 ? (
								<Text color={braise}>↗ +{flux.delta} (ça s’empile)</Text>
							) : (
								<Text color={or}>↘ {flux.delta} (tu vides)</Text>
							)}
						</Box>
					</Box>
				</Panel>
			</Box>

			<Box gap={1}>
				<Panel title="▦ ACTIVITÉ" grow>
					<Box flexDirection="column" marginTop={1}>
						{heatmap.kind === 'band' ? (
							<>
								<Box>
									{heatmap.cells.map(cell => (
										<Cell key={cell.d} cell={cell} />
									))}
								</Box>
								<Box>
									{heatmap.cells.map(cell => (
										<Text key={cell.d} color={color.dim}>
											{dayLetter(cell.d)}{' '}
										</Text>
									))}
								</Box>
							</>
						) : (
							Array.from({length: 7}, (_, i) => (
								<Box key={i}>
									<Text color={color.dim}>{DAY_LETTERS[i]} </Text>
									{heatmap.weeks.map((w, j) => (
										// eslint-disable-next-line react/no-array-index-key
										<Cell key={j} cell={w[i]} />
									))}
								</Box>
							))
						)}
						<Box marginTop={1}>
							<Text color={color.dim}>capture → done : </Text>
							<Text bold color={or}>
								{formatDays(stats.medianLifeDays)}
							</Text>
							<Text color={color.dim}> (médiane)</Text>
						</Box>
					</Box>
				</Panel>

				<Panel title="🏆 RECORDS" grow>
					<Box flexDirection="column" marginTop={1}>
						<RecordRow
							label="meilleur jour"
							value={
								records.bestDay
									? `${records.bestDay.count} (${records.bestDay.d.slice(5)})`
									: '—'
							}
						/>
						<RecordRow
							label="série max"
							value={
								records.longestStreak > 0 ? `${records.longestStreak} j` : '—'
							}
						/>
						<RecordRow
							label="+ vieille close"
							value={formatDays(records.oldestClosedDays)}
						/>
						<Box marginTop={1}>
							<Text>
								<Text bold color={or}>
									{worlds.openTasks}
								</Text>
								<Text color={color.dim}> tâches · </Text>
								<Text bold color={or}>
									{worlds.notes}
								</Text>
								<Text color={color.dim}> notes</Text>
								{worlds.pinned > 0 && (
									<Text color={color.dim}> ({worlds.pinned} ◆)</Text>
								)}
								{prCount !== null && (
									<>
										<Text color={color.dim}> · </Text>
										<Text bold color={or}>
											{prCount}
										</Text>
										<Text color={color.dim}> PRs</Text>
									</>
								)}
							</Text>
						</Box>
					</Box>
				</Panel>
			</Box>

			<Box justifyContent="flex-end">
				<Text color={color.faint}>[Échap] fermer</Text>
			</Box>
		</Box>
	);
}
