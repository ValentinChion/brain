import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import type {Meeting} from '../../core/types.ts';
import {
	agendaBar,
	fuseBar,
	formatCountdown,
	type AgendaUrgency,
} from '../../core/agenda.ts';

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';

const hhmm = (iso: string): string =>
	new Date(iso).toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	});

// urgence → couleur + emphase. La chaleur encode l'imminence : dim (loin) →
// ember → amber → gold (imminent) → gold inversé (en cours).
const URGENCY: Record<
	AgendaUrgency,
	{tint: string; bold?: boolean; inverse?: boolean}
> = {
	idle: {tint: color.dim},
	far: {tint: color.ember},
	soon: {tint: color.amber},
	imminent: {tint: color.gold, bold: true},
	live: {tint: color.gold, bold: true, inverse: true},
};

// Bandeau agenda (preuve de connexion + prochaine réunion, mèche qui se consume).
// Toute la logique vit dans agenda.ts ; ici on ne fait que peindre.
export default function AgendaStatus({
	state,
	meetings,
	nowISO,
	error,
}: {
	state: ConnState;
	meetings: Meeting[];
	nowISO: string;
	error: string | null;
}) {
	if (state === 'connecting') {
		return (
			<Text color={color.dim}>
				{glyph.clock} ouverture du navigateur… autorise dans l’onglet
			</Text>
		);
	}

	if (state === 'disconnected') {
		return (
			<Text color={color.dim}>{glyph.calm} agenda déconnecté · /gauth</Text>
		);
	}

	if (state === 'error') {
		return (
			<Text color={color.danger}>
				{glyph.calm} {error ?? 'erreur agenda'} · /gauth
			</Text>
		);
	}

	const bar = agendaBar(meetings, nowISO);

	if (bar.kind === 'empty') {
		return (
			<Text color={color.dim}>
				{glyph.calm} aucune réunion — journée dégagée
			</Text>
		);
	}

	if (bar.kind === 'done') {
		return (
			<Text color={color.dim}>
				{glyph.calm} terminé pour aujourd’hui · {bar.total} réunion
				{bar.total > 1 ? 's' : ''} faite{bar.total > 1 ? 's' : ''}
			</Text>
		);
	}

	const u = URGENCY[bar.urgency];
	// Colonne gauche extensible (titre tronqué) + bloc droit fixe (mèche + compte
	// à rebours + reste) → jamais de retour à la ligne, la hauteur reste d'une ligne.
	return (
		<Box>
			<Box flexGrow={1} flexShrink={1} minWidth={0}>
				<Text wrap="truncate-end">
					<Text color={color.gold}>{glyph.clock} </Text>
					{bar.live ? (
						<Text color={u.tint} bold inverse>
							{' '}
							EN COURS{' '}
						</Text>
					) : (
						<Text color={color.amber}>{hhmm(bar.start)} </Text>
					)}
					<Text color={color.fg}> {bar.title}</Text>
				</Text>
			</Box>
			<Box flexShrink={0}>
				<Text>
					{bar.fuse ? (
						<Text color={u.tint}>
							{'  '}
							{fuseBar(bar.fuse.filled, bar.fuse.total)}
						</Text>
					) : null}
					<Text color={u.tint} bold={u.bold} inverse={u.inverse}>
						{'  '}
						{formatCountdown(bar.minutes, bar.live)}
					</Text>
					{bar.remaining > 0 ? (
						<Text color={color.faint}>
							{'  '}+{bar.remaining}
						</Text>
					) : null}
				</Text>
			</Box>
		</Box>
	);
}
