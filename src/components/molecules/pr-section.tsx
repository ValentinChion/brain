import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import {ageDays, type PrItem, type PrKind} from '../../core/forge.ts';

export type AzState = 'off' | 'code' | 'connecting' | 'connected' | 'error';

const LOOK: Record<PrKind, {icon: string; label: string; tint: string}> = {
	'review-requested': {
		icon: glyph.prReview,
		label: 'à reviewer',
		tint: color.pr,
	},
	'ci-failed': {icon: glyph.prCiFail, label: 'CI rouge', tint: color.danger},
	'changes-requested': {
		icon: glyph.prChanges,
		label: 'changements demandés',
		tint: color.danger,
	},
	approved: {icon: glyph.prApproved, label: 'approuvée', tint: color.pinned},
};

// Miroir des PRs de la forge : lecture seule, disparaît quand la forge dit
// que c'est réglé. Aucune logique ici — tout vient de forge.ts.
export default function PrSection({
	state,
	code,
	error,
	prs,
	nowISO,
	active,
	selected,
}: {
	state: AzState;
	code: string | null;
	error: string | null;
	prs: PrItem[];
	nowISO: string;
	active: boolean;
	selected: number;
}) {
	if (state === 'off') return null;

	if (state === 'code') {
		return <Text color={color.pr}>⇄ azure : {code ?? '…'}</Text>;
	}

	if (state === 'connecting') {
		return <Text dimColor>⇄ azure : connexion…</Text>;
	}

	if (state === 'error') {
		return (
			<Text color={color.danger}>⇄ {error ?? 'erreur azure'} · /azure</Text>
		);
	}

	// connected
	if (prs.length === 0 && !error) return null;

	return (
		<Box flexDirection="column">
			{error ? <Text dimColor>⇄ {error}</Text> : null}
			{prs.map((pr, i) => {
				const look = LOOK[pr.kind];
				const age = ageDays(pr.createdAt, nowISO);
				const sel = active && i === selected;
				return (
					// tronquée sauf sélection (dépliée, comptée dans prRows par app.tsx)
					<Text key={pr.id} inverse={sel} wrap={sel ? 'wrap' : 'truncate-end'}>
						<Text color={look.tint}>
							{sel ? glyph.caret : ' '} {look.icon} {look.label}
						</Text>
						<Text>
							{' '}
							{glyph.bullet} {pr.title} ({pr.author})
							{age > 0 ? ` ${glyph.bullet} ${age}j` : ''}
						</Text>
					</Text>
				);
			})}
		</Box>
	);
}
