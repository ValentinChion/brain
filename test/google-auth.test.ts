import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
	pkcePair,
	buildAuthUrl,
	buildTokenExchangeBody,
	buildRefreshBody,
	parseTokenResponse,
	isExpired,
	isRefreshRevoked,
} from '../src/core/google-auth.ts';

test('pkcePair : challenge = base64url(sha256(verifier))', () => {
	const {verifier, challenge} = pkcePair();
	const expected = createHash('sha256')
		.update(verifier)
		.digest()
		.toString('base64url');
	assert.equal(challenge, expected);
	assert.match(verifier, /^[\w-]+$/); // base64url : pas de + / =
});

test('buildAuthUrl : paramètres OAuth requis', () => {
	const url = buildAuthUrl({
		endpoint: 'https://x/auth',
		clientId: 'cid',
		redirectUri: 'http://127.0.0.1:1',
		scope: 's',
		challenge: 'ch',
		state: 'st',
	});
	const q = new URL(url).searchParams;
	assert.equal(q.get('client_id'), 'cid');
	assert.equal(q.get('code_challenge'), 'ch');
	assert.equal(q.get('code_challenge_method'), 'S256');
	assert.equal(q.get('access_type'), 'offline');
	assert.equal(q.get('state'), 'st');
});

test('buildTokenExchangeBody / buildRefreshBody', () => {
	const ex = new URLSearchParams(
		buildTokenExchangeBody({
			clientId: 'c',
			clientSecret: 's',
			code: 'co',
			redirectUri: 'r',
			verifier: 'v',
		}),
	);
	assert.equal(ex.get('grant_type'), 'authorization_code');
	assert.equal(ex.get('code_verifier'), 'v');

	const rf = new URLSearchParams(
		buildRefreshBody({clientId: 'c', clientSecret: 's', refreshToken: 'rt'}),
	);
	assert.equal(rf.get('grant_type'), 'refresh_token');
	assert.equal(rf.get('refresh_token'), 'rt');
});

test('parseTokenResponse : expiresAt calculé, refresh précédent conservé', () => {
	const now = '2026-07-06T10:00:00.000Z';
	const t = parseTokenResponse(
		{access_token: 'a', expires_in: 3600},
		now,
		'old',
	);
	assert.equal(t.accessToken, 'a');
	assert.equal(t.refreshToken, 'old'); // pas de refresh_token dans la réponse
	assert.equal(t.expiresAt, '2026-07-06T11:00:00.000Z');

	const t2 = parseTokenResponse(
		{access_token: 'a', refresh_token: 'new', expires_in: 60},
		now,
	);
	assert.equal(t2.refreshToken, 'new');
});

test('isExpired : marge de 60 s', () => {
	const token = {
		accessToken: 'a',
		refreshToken: 'r',
		expiresAt: '2026-07-06T11:00:00.000Z',
	};
	assert.equal(isExpired(token, '2026-07-06T10:00:00.000Z'), false);
	assert.equal(isExpired(token, '2026-07-06T10:59:00.000Z'), true); // dans la marge
	assert.equal(isExpired(token, '2026-07-06T11:30:00.000Z'), true); // dépassé
});

test('isRefreshRevoked : seul un rejet auth (400/401) invalide le refresh token', () => {
	// révocation réelle → on peut effacer le token
	assert.equal(isRefreshRevoked(400), true); // invalid_grant
	assert.equal(isRefreshRevoked(401), true); // invalid_client
	// transitoire → garder le token, ne jamais déconnecter
	assert.equal(isRefreshRevoked(undefined), false); // erreur réseau (fetch rejeté)
	assert.equal(isRefreshRevoked(429), false);
	assert.equal(isRefreshRevoked(500), false);
	assert.equal(isRefreshRevoked(503), false);
});
