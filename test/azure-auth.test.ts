// test/azure-auth.test.ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	AZURE_CLIENT_ID,
	buildDeviceCodeBody,
	parseDeviceCode,
	buildDeviceTokenBody,
	buildAzureRefreshBody,
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
