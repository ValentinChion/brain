// Couche I/O Azure DevOps : flux device-code, refresh silencieux, lecture des
// PRs « action requise ». S'appuie sur les fonctions pures de azure-auth.ts
// (corps de requêtes) et forge.ts (normalisation).

import {setTimeout as delay} from 'node:timers/promises';
import type {OAuthToken} from './types.ts';
import {
	deviceCodeEndpoint,
	azureTokenEndpoint,
	parseTenantHeader,
	buildDeviceCodeBody,
	parseDeviceCode,
	buildDeviceTokenBody,
	buildAzureRefreshBody,
	type DeviceCode,
	type RawDeviceCode,
} from './azure-auth.ts';
import {
	parseTokenResponse,
	isExpired,
	type RawTokenResponse,
} from './google-auth.ts';
import {loadAzureToken, saveAzureToken, clearAzureToken} from './storage.ts';
import {loadAzureConfig, saveAzureConfig} from './azure-config.ts';
import {shapePullRequests, type RawPullRequest, type PrItem} from './forge.ts';

const FORM = {'Content-Type': 'application/x-www-form-urlencoded'};
const nowISO = (): string => new Date().toISOString();

export function isAzureConnected(): boolean {
	return loadAzureToken() !== null;
}

// Tenant Entra de l'organisation : ADO l'annonce dans X-VSS-ResourceTenant,
// même sans authentification. Indispensable aux invités B2B en OTP e-mail
// (l'autorité /organizations les rejette avec AADSTS500346). null → repli.
async function discoverTenant(organization: string): Promise<string | null> {
	try {
		const res = await fetch(`https://dev.azure.com/${organization}`, {
			method: 'HEAD',
			redirect: 'manual', // l'en-tête est sur la réponse ADO, pas après redirection
		});
		return parseTenantHeader(res.headers.get('x-vss-resourcetenant'));
	} catch {
		return null; // réseau — on tentera /organizations
	}
}

// tenant à utiliser pour l'auth : config si déjà découvert, sinon découverte
// (persistée pour les prochains lancements). undefined → /organizations.
async function resolveTenant(): Promise<string | undefined> {
	const cfg = loadAzureConfig();
	if (!cfg) return undefined;
	if (cfg.tenantId) return cfg.tenantId;
	const tenant = await discoverTenant(cfg.organization);
	if (tenant) saveAzureConfig({...cfg, tenantId: tenant});
	return tenant ?? undefined;
}

export async function requestDeviceCode(): Promise<
	DeviceCode & {tenant?: string}
> {
	const tenant = await resolveTenant();
	const res = await fetch(deviceCodeEndpoint(tenant), {
		method: 'POST',
		headers: FORM,
		body: buildDeviceCodeBody(),
	});
	if (!res.ok) throw new Error(`device-code refusé (${res.status})`);
	return {...parseDeviceCode((await res.json()) as RawDeviceCode), tenant};
}

// poll le token endpoint jusqu'à validation dans le navigateur (ou expiration).
export async function pollDeviceToken(
	dc: DeviceCode & {tenant?: string},
): Promise<OAuthToken> {
	const deadline = Date.now() + dc.expiresInMs;
	let wait = dc.intervalMs;
	while (Date.now() < deadline) {
		// eslint-disable-next-line no-await-in-loop
		await delay(wait);

		let result: {
			ok: boolean;
			status: number;
			json: RawTokenResponse & {error?: string};
		};
		try {
			// eslint-disable-next-line no-await-in-loop
			const res = await fetch(azureTokenEndpoint(dc.tenant), {
				method: 'POST',
				headers: FORM,
				body: buildDeviceTokenBody(dc.deviceCode),
			});
			// eslint-disable-next-line no-await-in-loop
			const json = (await res.json()) as RawTokenResponse & {error?: string};
			result = {ok: res.ok, status: res.status, json};
		} catch {
			// aléa réseau pendant le poll (jusqu'à 15 min) — on retente au tick
			// suivant, la deadline continue de borner la boucle
			continue;
		}

		if (result.ok) {
			const token = parseTokenResponse(result.json, nowISO());
			saveAzureToken(token);
			return token;
		}

		if (result.json.error === 'slow_down') wait += 5000;
		else if (result.json.error !== 'authorization_pending') {
			throw new Error(
				`autorisation refusée (${result.json.error ?? result.status})`,
			);
		}
	}

	throw new Error('code expiré — relance /azure');
}

async function ensureAccessToken(): Promise<string> {
	const token = loadAzureToken();
	if (!token) throw new Error('non connecté — /azure');
	if (!isExpired(token, nowISO())) return token.accessToken;

	let res: Response;
	try {
		res = await fetch(azureTokenEndpoint(loadAzureConfig()?.tenantId), {
			method: 'POST',
			headers: FORM,
			body: buildAzureRefreshBody(token.refreshToken),
		});
	} catch {
		// panne réseau (DNS/offline...) — le token reste valable, on retentera plus tard
		throw new Error('azure injoignable — réessaie plus tard');
	}

	if (!res.ok) {
		clearAzureToken(); // refresh explicitement rejeté par le serveur → repartir propre
		throw new Error('session Azure expirée — reconnecte via /azure');
	}

	let json: RawTokenResponse;
	try {
		json = (await res.json()) as RawTokenResponse;
	} catch {
		// réponse 2xx mais JSON invalide — traité comme un aléa réseau, pas une révocation
		throw new Error('azure injoignable — réessaie plus tard');
	}

	const next = parseTokenResponse(json, nowISO(), token.refreshToken);
	saveAzureToken(next);
	return next.accessToken;
}

async function get<T>(url: string, access: string): Promise<T> {
	const res = await fetch(url, {
		headers: {Authorization: `Bearer ${access}`},
	});
	if (!res.ok) throw new Error(`azure indisponible (${res.status})`);
	return res.json() as Promise<T>;
}

// mon identité ADO — stable pour la durée du process, résolue une fois
let cachedMyId: string | null = null;

async function myId(base: string, access: string): Promise<string> {
	if (cachedMyId) return cachedMyId;
	const me = await get<{authenticatedUser?: {id?: string}}>(
		`${base}/_apis/connectionData`,
		access,
	);
	cachedMyId = me.authenticatedUser?.id ?? '';
	return cachedMyId;
}

type PrList = {value?: RawPullRequest[]};
type PolicyEvaluations = {
	value?: Array<{
		configuration?: {type?: {displayName?: string}};
		status?: string;
	}>;
};

// CI d'une de mes PRs : policy « Build » rejetée. Pas de policy build → inconnu, ignoré.
async function ciFailed(
	base: string,
	access: string,
	pr: RawPullRequest,
): Promise<number | null> {
	const projectId = pr.repository?.project?.id;
	const id = pr.pullRequestId;
	if (!projectId || !id) return null;
	try {
		const artifact = encodeURIComponent(
			`vstfs:///CodeReview/CodeReviewId/${projectId}/${id}`,
		);
		const evals = await get<PolicyEvaluations>(
			`${base}/${projectId}/_apis/policy/evaluations?artifactId=${artifact}&api-version=7.1-preview.1`,
			access,
		);
		const failed = (evals.value ?? []).some(
			e =>
				e.configuration?.type?.displayName === 'Build' &&
				e.status === 'rejected',
		);
		return failed ? id : null;
	} catch {
		return null; // droits manquants / pas de policy → statut CI inconnu
	}
}

// PRs « action requise » : à reviewer + mes PRs actionnables (CI rouge incluse).
export async function fetchActionablePrs(): Promise<PrItem[]> {
	const cfg = loadAzureConfig();
	if (!cfg) throw new Error('non configuré — /azure <org> <projet>');
	const access = await ensureAccessToken();
	const base = `https://dev.azure.com/${cfg.organization}`;
	const me = await myId(base, access);
	// ponytail: $top=200 — pagination le jour où un projet dépasse 200 PRs actives
	const prs = await get<PrList>(
		`${base}/${encodeURIComponent(
			cfg.project,
		)}/_apis/git/pullrequests?searchCriteria.status=active&$top=200&api-version=7.1`,
		access,
	);
	const raw = prs.value ?? [];
	const mine = raw.filter(pr => pr.createdBy?.id === me && !pr.isDraft);
	const ciChecks = await Promise.all(
		mine.map(async pr => ciFailed(base, access, pr)),
	);
	const ciFailedIds = ciChecks.filter((id): id is number => id !== null);
	return shapePullRequests(raw, me, ciFailedIds);
}
