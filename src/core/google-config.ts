// Configuration Google. Les constantes (endpoints, scope) sont publiques et
// committées. Les identifiants client (secrets) sont lus au runtime depuis
// ~/.brain/google-config.json ou l'environnement — jamais committés.

import {join} from 'node:path';
import {existsSync, readFileSync} from 'node:fs';
import {brainDir} from './storage.ts';

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const CALENDAR_ENDPOINT =
	'https://www.googleapis.com/calendar/v3/calendars/primary/events';
export const SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';

export type Credentials = {clientId: string; clientSecret: string};

// ordre : variables d'env, puis ~/.brain/google-config.json. Erreur claire sinon.
export function loadCredentials(): Credentials {
	const envId = process.env.BRAIN_GOOGLE_CLIENT_ID;
	const envSecret = process.env.BRAIN_GOOGLE_CLIENT_SECRET;
	if (envId && envSecret) return {clientId: envId, clientSecret: envSecret};

	const path = join(brainDir(), 'google-config.json');
	if (!existsSync(path)) {
		throw new Error(
			`Google non configuré — crée ${path} : {"clientId":"…","clientSecret":"…"}`,
		);
	}

	const cfg = JSON.parse(readFileSync(path, 'utf8')) as Partial<Credentials>;
	if (!cfg.clientId || !cfg.clientSecret) {
		throw new Error(`${path} incomplet — attend {"clientId","clientSecret"}`);
	}

	return {clientId: cfg.clientId, clientSecret: cfg.clientSecret};
}
