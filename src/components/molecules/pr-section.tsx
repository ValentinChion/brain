import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import {ageDays, type PrGroup, type PrKind} from '../../core/forge.ts';
import Panel from '../atoms/panel.tsx';

export type AzState = 'off' | 'code' | 'connecting' | 'connected' | 'error';

// Libellé court par genre : un mot vaut mieux qu'un glyphe cryptique (⇄/↺ ne
// disaient pas « à reviewer »/« à corriger »). Trois « à + verbe » = des tâches ;
// « CI » s'appuie sur sa teinte brick pour dire « rouge ». Reste sur une ligne
// jusqu'à ~60 colonnes. La couleur porte le genre ; le mot le nomme.
const LOOK: Record<PrKind, {label: string; tint: string}> = {
	'review-requested': {label: 'à voir', tint: color.ember},
	'changes-requested': {label: 'à corriger', tint: color.brick},
	'ci-failed': {label: 'CI', tint: color.brick},
	approved: {label: 'à merger', tint: color.gold},
	mine: {label: 'en cours', tint: color.dim}, // informatif : tes PRs en attente de review
};

// Miroir des PRs de la forge : lecture seule, disparaît quand la forge dit que
// c'est réglé. Aucune logique ici — groupes, focus et dépli arrivent résolus.
//
// Le cadre EST le panneau : il existe pour tous les états sauf `off`, et sauf
// connecté sans PR ni erreur. Les états transitoires ne le redimensionnent
// jamais (toujours une ligne de contenu) — le budget hauteur reste stable.
export default function PrSection({
	state,
	code,
	error,
	groups,
	nowISO,
	active,
	focusIdx,
	expanded,
	selected,
}: {
	state: AzState;
	code: string | null;
	error: string | null;
	groups: PrGroup[];
	nowISO: string;
	active: boolean;
	focusIdx: number;
	expanded: boolean;
	selected: number;
}) {
	if (state === 'off') return null;

	if (state !== 'connected') {
		return (
			<Panel>
				<Box>
					<Text color={color.dim}>PR </Text>
					{state === 'code' ? (
						<Text color={color.pr}>{code ?? '…'}</Text>
					) : state === 'connecting' ? (
						<Text color={color.dim}>connexion…</Text>
					) : (
						<Text color={color.danger}>
							{glyph.prReview} {error ?? 'erreur azure'} · /azure
						</Text>
					)}
				</Box>
			</Panel>
		);
	}

	// connecté : rien à traiter et rien à signaler → pas de panneau du tout
	if (groups.length === 0 && !error) return null;

	const open = expanded ? groups[focusIdx] : undefined;

	return (
		<Panel>
			<Box>
				<Text color={color.dim}>PR </Text>
				{groups.map((g, i) => (
					<Box key={g.kind} marginLeft={2}>
						<Text
							color={LOOK[g.kind].tint}
							bold={active && i === focusIdx}
							inverse={active && i === focusIdx}
						>
							{g.items.length} {LOOK[g.kind].label}
							{open && i === focusIdx ? ` ${glyph.open}` : ''}
						</Text>
					</Box>
				))}
				<Box flexGrow={1} />
				{active && !expanded && (
					<Text color={color.faint}>{glyph.multiline} déplier un groupe</Text>
				)}
			</Box>

			{error && (
				<Text color={color.dim}>
					{glyph.prReview} {error}
				</Text>
			)}

			{open?.items.map((pr, i) => {
				const age = ageDays(pr.createdAt, nowISO);
				const sel = i === selected;
				return (
					// tronquée sauf sélection (dépliée, comptée dans prRows par app.tsx).
					// Pas de glyphe de genre : le groupe déplié est d'un seul genre,
					// déjà nommé par le compteur ouvert au-dessus.
					<Text key={pr.id} wrap={sel ? 'wrap' : 'truncate-end'}>
						<Text color={color.amber} bold={sel}>
							{sel ? glyph.caret : ' '}{' '}
						</Text>
						<Text color={color.fg}>{pr.title}</Text>
						<Text color={color.dim}>
							{' '}
							({pr.author}){age > 0 ? ` ${glyph.bullet} ${age}j` : ''}
						</Text>
					</Text>
				);
			})}
		</Panel>
	);
}
