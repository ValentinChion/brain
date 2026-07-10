// Couche I/O : orchestre le flux OAuth (serveur loopback, navigateur, requêtes)
// et la lecture de l'agenda. S'appuie sur les fonctions pures de google-auth.ts.

import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import type {AddressInfo} from 'node:net';
import type {GoogleToken, Meeting} from './types.ts';
import {
	pkcePair,
	randomState,
	buildAuthUrl,
	buildTokenExchangeBody,
	buildRefreshBody,
	parseTokenResponse,
	isExpired,
	isRefreshRevoked,
	type RawTokenResponse,
} from './google-auth.ts';
import {
	loadCredentials,
	AUTH_ENDPOINT,
	TOKEN_ENDPOINT,
	CALENDAR_ENDPOINT,
	SCOPE,
} from './google-config.ts';
import {loadToken, saveToken, clearToken} from './storage.ts';
import {shapeEvents, type RawEvent} from './agenda.ts';

const CONNECT_TIMEOUT_MS = 120_000;
const FORM = {'Content-Type': 'application/x-www-form-urlencoded'};

const nowISO = (): string => new Date().toISOString();

export function isConnected(): boolean {
	return loadToken() !== null;
}

export function openBrowser(url: string): void {
	// macOS : `open`. Si indisponible, on avale l'erreur (le flux expirera).
	// Partagé avec le flux Azure.
	const child = spawn('open', [url], {stdio: 'ignore', detached: true});
	child.on('error', () => undefined);
	child.unref();
}

// serveur loopback éphémère : renvoie l'URI de redirection (avec le port assigné)
// et une promesse qui se résout avec le code d'autorisation.
async function startLoopback(state: string): Promise<{
	redirectUri: string;
	code: Promise<string>;
	close: () => void;
}> {
	return new Promise((resolve, reject) => {
		let resolveCode: (c: string) => void = () => undefined;
		let rejectCode: (e: Error) => void = () => undefined;
		const code = new Promise<string>((res, rej) => {
			resolveCode = res;
			rejectCode = rej;
		});

		const server = createServer((req, res) => {
			const url = new URL(req.url ?? '', 'http://127.0.0.1');
			const got = url.searchParams.get('code');
			const gotState = url.searchParams.get('state');
			res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
			if (got && gotState === state) {
				res.end(
					'<p>brain : agenda connecté ✅ — tu peux fermer cet onglet.</p>',
				);
				resolveCode(got);
			} else {
				res.end('<p>brain : échec de connexion (state invalide).</p>');
			}
		});

		server.on('error', reject);
		server.listen(0, '127.0.0.1', () => {
			const {port} = server.address() as AddressInfo;
			const timer = setTimeout(() => {
				rejectCode(new Error('délai dépassé — autorisation non reçue'));
			}, CONNECT_TIMEOUT_MS);
			timer.unref();
			resolve({
				redirectUri: `http://127.0.0.1:${port}`,
				code,
				close() {
					clearTimeout(timer);
					server.close();
				},
			});
		});
	});
}

class TokenHttpError extends Error {
	constructor(readonly status: number) {
		super(`jeton refusé (${status})`);
	}
}

async function postForm(body: string): Promise<RawTokenResponse> {
	const res = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: FORM,
		body,
	});
	if (!res.ok) throw new TokenHttpError(res.status);
	return res.json() as Promise<RawTokenResponse>;
}

export async function connect(): Promise<GoogleToken> {
	const {clientId, clientSecret} = loadCredentials();
	const {verifier, challenge} = pkcePair();
	const state = randomState();
	const {redirectUri, code, close} = await startLoopback(state);
	try {
		openBrowser(
			buildAuthUrl({
				endpoint: AUTH_ENDPOINT,
				clientId,
				redirectUri,
				scope: SCOPE,
				challenge,
				state,
			}),
		);
		const authCode = await code;
		const json = await postForm(
			buildTokenExchangeBody({
				clientId,
				clientSecret,
				code: authCode,
				redirectUri,
				verifier,
			}),
		);
		const token = parseTokenResponse(json, nowISO());
		if (!token.refreshToken) {
			throw new Error('aucun refresh token — révoque l’accès puis réessaie');
		}

		saveToken(token);
		return token;
	} finally {
		close();
	}
}

async function ensureAccessToken(): Promise<string> {
	const token = loadToken();
	if (!token) throw new Error('non connecté');
	if (!isExpired(token, nowISO())) return token.accessToken;

	const {clientId, clientSecret} = loadCredentials();
	let json: RawTokenResponse;
	try {
		json = await postForm(
			buildRefreshBody({
				clientId,
				clientSecret,
				refreshToken: token.refreshToken,
			}),
		);
	} catch (error) {
		// n'effacer le token que sur révocation réelle (400/401) — une erreur
		// réseau ou un 5xx/429 au boot ne doit pas déconnecter (cf. isRefreshRevoked)
		const status = error instanceof TokenHttpError ? error.status : undefined;
		if (isRefreshRevoked(status)) {
			clearToken();
			throw new Error('session expirée — reconnecte via /gauth');
		}

		throw new Error('agenda indisponible — réseau ? (token conservé)');
	}

	const next = parseTokenResponse(json, nowISO(), token.refreshToken);
	saveToken(next);
	return next.accessToken;
}

export async function fetchTodaysEvents(): Promise<Meeting[]> {
	const access = await ensureAccessToken();
	const now = new Date();
	const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	const q = new URLSearchParams({
		timeMin: start.toISOString(),
		timeMax: end.toISOString(),
		singleEvents: 'true',
		orderBy: 'startTime',
	});
	const res = await fetch(`${CALENDAR_ENDPOINT}?${q.toString()}`, {
		headers: {Authorization: `Bearer ${access}`},
	});
	if (!res.ok) throw new Error(`agenda indisponible (${res.status})`);
	const json = (await res.json()) as {items?: RawEvent[]};
	return shapeEvents(json.items ?? []);
}
