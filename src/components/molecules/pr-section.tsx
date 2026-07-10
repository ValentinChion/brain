import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import {ageDays, type PrGroup, type PrKind} from '../../core/forge.ts';
import Panel from '../atoms/panel.tsx';

export type AzState = 'off' | 'code' | 'connecting' | 'connected' | 'error';

// ponytail: les libellés (« à reviewer », « CI rouge »…) ne sont plus affichés —
// le compteur ouvert porte ▾ et l'inverse, un sous-entête ne dirait rien de neuf.
// Quatre glyphes à apprendre. Remettre un sous-entête si l'usage montre que ça coince.
const LOOK: Record<PrKind, {icon: string; tint: string}> = {
	'review-requested': {icon: glyph.prReview, tint: color.ember},
	'changes-requested': {icon: glyph.prChanges, tint: color.brick},
	'ci-failed': {icon: glyph.prCiFail, tint: color.brick},
	approved: {icon: glyph.prApproved, tint: color.gold},
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
							{LOOK[g.kind].icon} {g.items.length}
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
					// tronquée sauf sélection (dépliée, comptée dans prRows par app.tsx)
					<Text key={pr.id} wrap={sel ? 'wrap' : 'truncate-end'}>
						<Text color={color.amber} bold={sel}>
							{sel ? glyph.caret : ' '}{' '}
						</Text>
						<Text color={LOOK[open.kind].tint}>{LOOK[open.kind].icon} </Text>
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
