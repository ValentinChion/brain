// src/core/azure-config.ts
// Organisation + projet Azure DevOps. Aucun secret ici (l'auth est en device-code).
// Renseigné via /azure <org> <projet> ou l'environnement.

import {join} from 'node:path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {brainDir} from './storage.ts';

export type AzureConfig = {
	organization: string;
	project: string;
	// tenant Entra de l'organisation, découvert au premier /azure (invités B2B)
	tenantId?: string;
};

const FILE = 'azure-config.json';

// ordre : variables d'env, puis ~/.brain/azure-config.json. null si non
// configuré → la section PRs est simplement absente (zéro bruit).
export function loadAzureConfig(): AzureConfig | null {
	const org = process.env.BRAIN_AZURE_ORG;
	const project = process.env.BRAIN_AZURE_PROJECT;
	if (org && project) return {organization: org, project};

	const path = join(brainDir(), FILE);
	if (!existsSync(path)) return null;
	try {
		const cfg = JSON.parse(readFileSync(path, 'utf8')) as Partial<AzureConfig>;
		if (cfg.organization && cfg.project) {
			return {
				organization: cfg.organization,
				project: cfg.project,
				...(cfg.tenantId ? {tenantId: cfg.tenantId} : {}),
			};
		}

		return null;
	} catch {
		return null;
	}
}

export function saveAzureConfig(cfg: AzureConfig): void {
	mkdirSync(brainDir(), {recursive: true});
	writeFileSync(join(brainDir(), FILE), JSON.stringify(cfg, null, 2));
}
