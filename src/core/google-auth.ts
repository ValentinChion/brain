// Logique OAuth 2.0 (flux « installed app », PKCE) — pure et testée.
// Aucune I/O : la couche google-client.ts fait les requêtes et le stockage.

import {randomBytes, createHash} from 'node:crypto';
import type {Buffer} from 'node:buffer';
import type {GoogleToken} from './types.ts';

const b64url = (b: Buffer): string => b.toString('base64url');

export function pkcePair(): {verifier: string; challenge: string} {
	const verifier = b64url(randomBytes(32));
	const challenge = b64url(createHash('sha256').update(verifier).digest());
	return {verifier, challenge};
}

export function randomState(): string {
	return b64url(randomBytes(16));
}

export function buildAuthUrl(p: {
	endpoint: string;
	clientId: string;
	redirectUri: string;
	scope: string;
	challenge: string;
	state: string;
}): string {
	const q = new URLSearchParams({
		client_id: p.clientId,
		redirect_uri: p.redirectUri,
		response_type: 'code',
		scope: p.scope,
		code_challenge: p.challenge,
		code_challenge_method: 'S256',
		access_type: 'offline',
		prompt: 'consent',
		state: p.state,
	});
	return `${p.endpoint}?${q.toString()}`;
}

export function buildTokenExchangeBody(p: {
	clientId: string;
	clientSecret: string;
	code: string;
	redirectUri: string;
	verifier: string;
}): string {
	return new URLSearchParams({
		client_id: p.clientId,
		client_secret: p.clientSecret,
		code: p.code,
		redirect_uri: p.redirectUri,
		grant_type: 'authorization_code',
		code_verifier: p.verifier,
	}).toString();
}

export function buildRefreshBody(p: {
	clientId: string;
	clientSecret: string;
	refreshToken: string;
}): string {
	return new URLSearchParams({
		client_id: p.clientId,
		client_secret: p.clientSecret,
		refresh_token: p.refreshToken,
		grant_type: 'refresh_token',
	}).toString();
}

export type RawTokenResponse = {
	access_token?: string;
	refresh_token?: string;
	expires_in?: number;
};

// La réponse de rafraîchissement n'inclut pas de refresh_token → on garde l'ancien.
export function parseTokenResponse(
	json: RawTokenResponse,
	nowISO: string,
	prevRefresh = '',
): GoogleToken {
	const expiresAt = new Date(
		new Date(nowISO).getTime() + (json.expires_in ?? 0) * 1000,
	).toISOString();
	return {
		accessToken: json.access_token ?? '',
		refreshToken: json.refresh_token ?? prevRefresh,
		expiresAt,
	};
}

// Un refresh raté ne signifie « déconnecté » que si Google rejette l'auth
// elle-même : 400 invalid_grant (token révoqué/expiré) ou 401 invalid_client.
// Tout le reste (pas de réseau → status undefined, 429, 5xx) est transitoire :
// effacer le token dans ces cas forçait une reconnexion à chaque aléa réseau.
export function isRefreshRevoked(status: number | undefined): boolean {
	return status === 400 || status === 401;
}

const SKEW_MS = 60_000; // rafraîchir 60 s avant l'expiration réelle (marge réseau)

export function isExpired(token: GoogleToken, nowISO: string): boolean {
	return (
		new Date(token.expiresAt).getTime() - SKEW_MS <= new Date(nowISO).getTime()
	);
}
