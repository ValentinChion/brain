// test/azure-config.test.ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const withDir = async (fn: (dir: string) => Promise<void>) => {
	const dir = mkdtempSync(join(tmpdir(), 'brain-'));
	process.env.BRAIN_DIR = dir;
	try {
		await fn(dir);
	} finally {
		delete process.env.BRAIN_DIR;
	}
};

test('loadAzureConfig : null si rien de configuré', async () => {
	await withDir(async () => {
		const {loadAzureConfig} = await import(
			`../src/core/azure-config.ts?${Math.random()}`
		);
		assert.equal(loadAzureConfig(), null);
	});
});

test('saveAzureConfig puis loadAzureConfig : aller-retour', async () => {
	await withDir(async () => {
		const {saveAzureConfig, loadAzureConfig} = await import(
			`../src/core/azure-config.ts?${Math.random()}`
		);
		saveAzureConfig({organization: 'org', project: 'proj'});
		assert.deepEqual(loadAzureConfig(), {organization: 'org', project: 'proj'});
	});
});

test('tenantId : persisté et relu quand présent, absent sinon', async () => {
	await withDir(async () => {
		const {saveAzureConfig, loadAzureConfig} = await import(
			`../src/core/azure-config.ts?${Math.random()}`
		);
		saveAzureConfig({
			organization: 'org',
			project: 'proj',
			tenantId: '72f988bf-86f1-41af-91ab-2d7cd011db47',
		});
		assert.deepEqual(loadAzureConfig(), {
			organization: 'org',
			project: 'proj',
			tenantId: '72f988bf-86f1-41af-91ab-2d7cd011db47',
		});
	});
});

test("l'environnement prime sur le fichier", async () => {
	await withDir(async () => {
		const {saveAzureConfig, loadAzureConfig} = await import(
			`../src/core/azure-config.ts?${Math.random()}`
		);
		saveAzureConfig({organization: 'file-org', project: 'file-proj'});
		process.env.BRAIN_AZURE_ORG = 'env-org';
		process.env.BRAIN_AZURE_PROJECT = 'env-proj';
		try {
			assert.deepEqual(loadAzureConfig(), {
				organization: 'env-org',
				project: 'env-proj',
			});
		} finally {
			delete process.env.BRAIN_AZURE_ORG;
			delete process.env.BRAIN_AZURE_PROJECT;
		}
	});
});

test('fichier corrompu ou incomplet → null, sans jeter', async () => {
	await withDir(async dir => {
		const {loadAzureConfig} = await import(
			`../src/core/azure-config.ts?${Math.random()}`
		);
		writeFileSync(join(dir, 'azure-config.json'), '{ pas du json');
		assert.equal(loadAzureConfig(), null);
		writeFileSync(join(dir, 'azure-config.json'), '{"organization":"o"}');
		assert.equal(loadAzureConfig(), null);
	});
});
