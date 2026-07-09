// test/azure-auth.test.ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	AZURE_CLIENT_ID,
	buildDeviceCodeBody,
	parseDeviceCode,
	buildDeviceTokenBody,
	buildAzureRefreshBody,
	deviceCodeEndpoint,
	azureTokenEndpoint,
	parseTenantHeader,
} from '../src/core/azure-auth.ts';

test('buildDeviceCodeBody : client_id public VS + scope ADO + offline_access', () => {
	const q = new URLSearchParams(buildDeviceCodeBody());
	assert.equal(q.get('client_id'), AZURE_CLIENT_ID);
	assert.equal(
		q.get('scope'),
		'499b84ac-1321-427f-aa17-267ca6975798/.default offline_access',
	);
});

test('parseDeviceCode : convertit secondes → ms, défauts sains', () => {
	const dc = parseDeviceCode({
		device_code: 'dc',
		user_code: 'ABCD-1234',
		verification_uri: 'https://microsoft.com/devicelogin',
		interval: 5,
		expires_in: 900,
	});
	assert.equal(dc.deviceCode, 'dc');
	assert.equal(dc.userCode, 'ABCD-1234');
	assert.equal(dc.intervalMs, 5000);
	assert.equal(dc.expiresInMs, 900_000);
});

test('parseDeviceCode : réponse sans device_code → jette', () => {
	assert.throws(() => parseDeviceCode({user_code: 'X'}));
});

test('buildDeviceTokenBody : grant_type device_code', () => {
	const q = new URLSearchParams(buildDeviceTokenBody('dc'));
	assert.equal(
		q.get('grant_type'),
		'urn:ietf:params:oauth:grant-type:device_code',
	);
	assert.equal(q.get('device_code'), 'dc');
	assert.equal(q.get('client_id'), AZURE_CLIENT_ID);
});

test('buildAzureRefreshBody : grant_type refresh_token + scope', () => {
	const q = new URLSearchParams(buildAzureRefreshBody('rt'));
	assert.equal(q.get('grant_type'), 'refresh_token');
	assert.equal(q.get('refresh_token'), 'rt');
	assert.ok(q.get('scope')?.includes('499b84ac'));
});

test('endpoints : tenant spécifique si fourni, sinon /organizations', () => {
	assert.equal(
		deviceCodeEndpoint(),
		'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode',
	);
	assert.equal(
		azureTokenEndpoint(),
		'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
	);
	const t = '11111111-2222-3333-4444-555555555555';
	assert.equal(
		deviceCodeEndpoint(t),
		`https://login.microsoftonline.com/${t}/oauth2/v2.0/devicecode`,
	);
	assert.equal(
		azureTokenEndpoint(t),
		`https://login.microsoftonline.com/${t}/oauth2/v2.0/token`,
	);
});

test('parseTenantHeader : GUID accepté, absent/vide/zéros/bruit → null', () => {
	const t = '72f988bf-86f1-41af-91ab-2d7cd011db47';
	assert.equal(parseTenantHeader(t), t);
	assert.equal(parseTenantHeader(` ${t.toUpperCase()} `), t.toLowerCase());
	assert.equal(parseTenantHeader(null), null);
	assert.equal(parseTenantHeader(''), null);
	// orgs adossées à un compte Microsoft perso : GUID nul → repli /organizations
	assert.equal(parseTenantHeader('00000000-0000-0000-0000-000000000000'), null);
	assert.equal(parseTenantHeader('<html>page erreur</html>'), null);
});
