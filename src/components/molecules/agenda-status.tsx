import React from 'react';
import {Text} from 'ink';
import {color} from '../../core/theme.ts';
import type {Meeting} from '../../core/types.ts';
import {summary} from '../../core/agenda.ts';

export type ConnState = 'disconnected' | 'connecting' | 'connected' | 'error';

const hhmm = (iso: string): string =>
	new Date(iso).toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	});

// Ligne de statut de l'agenda (preuve de connexion + prochaine réunion).
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
			<Text dimColor>🗓 ouverture du navigateur… autorise dans l’onglet</Text>
		);
	}

	if (state === 'disconnected') {
		return <Text dimColor>🗓 agenda non connecté · /gauth</Text>;
	}

	if (state === 'error') {
		return (
			<Text color={color.danger}>🗓 {error ?? 'erreur agenda'} · /gauth</Text>
		);
	}

	const {count, next} = summary(meetings, nowISO);
	if (count === 0) return <Text dimColor>🗓 aucune réunion aujourd’hui</Text>;

	return (
		<Text dimColor>
			🗓 {count} réunion{count > 1 ? 's' : ''} aujourd’hui
			{next ? ` · prochaine ${hhmm(next.start)} ${next.title}` : ''}
		</Text>
	);
}
