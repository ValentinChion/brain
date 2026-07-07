# Forge PR Mirror (Azure DevOps) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A read-only "PRs" section in the brain panel mirroring Azure DevOps state — PRs awaiting my review + my own actionable PRs — with one-time device-code auth.

**Architecture:** Mirrors the Google Calendar split exactly: pure tested modules (`forge.ts` shaping, `azure-auth.ts` device-code bodies), thin I/O (`azure-client.ts`, `azure-config.ts`, storage additions), and a display-only Ink layer (`PrSection` + one poll `useEffect` in `app.tsx`). Nothing is written to `tasks.json`; the forge is the source of truth and lines vanish at the next poll when handled.

**Tech Stack:** Node/TypeScript ESM (run via `tsx`, no build), Ink 5, `node:test` + `node:assert`, zero new dependencies.

**Spec:** `docs/plans/2026-07-07-forge-pr-mirror.md` — read it first.

## Global Constraints

- Zero new npm dependencies.
- ESM project: relative imports keep `.ts`/`.tsx` extensions.
- All UI copy and code comments in **French** (match existing files).
- `standards/ink.md` governs: business logic in pure modules (tested), `.tsx` = display + keyboard only, one active `useInput` per responsibility (`isActive`), exit via `useApp().exit()`.
- `npm test` (prettier + xo + node:test) must pass at every commit.
- Entra public client ID (Visual Studio, same as Git Credential Manager): `872cd9fa-d31f-45e0-9eab-6e460a02d1f1`. Azure DevOps resource ID: `499b84ac-1321-427f-aa17-267ca6975798`.
- Azure vote values: `10` approved, `5` approved with suggestions, `0` no vote, `-5` waiting for author, `-10` rejected.
- Token storage file: `~/.brain/azure-token.json`, chmod 600, atomic write — identical guarantees to `google-token.json`.

---

### Task 1: `forge.ts` — pure PR shaping

**Files:**
- Create: `src/core/forge.ts`
- Test: `test/forge.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `type PrKind = 'review-requested' | 'ci-failed' | 'changes-requested' | 'approved'`; `type PrItem = {id: number; title: string; author: string; url: string; createdAt: string; kind: PrKind}`; `type RawPullRequest` (shape of Azure's PR list payload); `shapePullRequests(raw: readonly RawPullRequest[], myId: string, ciFailedIds?: readonly number[]): PrItem[]`; `ageDays(createdAt: string, nowISO: string): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// test/forge.test.ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	shapePullRequests,
	ageDays,
	type RawPullRequest,
} from '../src/core/forge.ts';

const ME = 'me-id';

const pr = (over: Partial<RawPullRequest>): RawPullRequest => ({
	pullRequestId: 1,
	title: 'T',
	isDraft: false,
	creationDate: '2026-07-01T00:00:00Z',
	createdBy: {id: 'alice-id', displayName: 'Alice'},
	reviewers: [],
	repository: {webUrl: 'https://dev.azure.com/org/proj/_git/repo'},
	...over,
});

test('reviewer demandé sans vote → review-requested', () => {
	const raw = [pr({reviewers: [{id: ME, vote: 0}]})];
	const out = shapePullRequests(raw, ME);
	assert.equal(out.length, 1);
	assert.equal(out[0].kind, 'review-requested');
	assert.equal(out[0].author, 'Alice');
	assert.equal(
		out[0].url,
		'https://dev.azure.com/org/proj/_git/repo/pullrequest/1',
	);
});

test("j'ai déjà voté → la PR sort de la liste", () => {
	const raw = [pr({reviewers: [{id: ME, vote: 10}]})];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test('draft → exclue, même si je suis reviewer', () => {
	const raw = [pr({isDraft: true, reviewers: [{id: ME, vote: 0}]})];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test("PR d'un autre où je ne suis pas reviewer → exclue", () => {
	const raw = [pr({reviewers: [{id: 'bob-id', vote: 0}]})];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test('ma PR, CI en échec → ci-failed (prioritaire sur les votes)', () => {
	const raw = [
		pr({createdBy: {id: ME, displayName: 'Moi'}, reviewers: [{id: 'b', vote: -5}]}),
	];
	const out = shapePullRequests(raw, ME, [1]);
	assert.equal(out[0].kind, 'ci-failed');
});

test('ma PR, un vote négatif → changes-requested', () => {
	const raw = [
		pr({createdBy: {id: ME, displayName: 'Moi'}, reviewers: [{id: 'b', vote: -5}]}),
	];
	assert.equal(shapePullRequests(raw, ME)[0].kind, 'changes-requested');
});

test('ma PR, ≥1 approbation et aucun vote bloquant → approved', () => {
	const raw = [
		pr({
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [
				{id: 'b', vote: 5},
				{id: 'c', vote: 0},
			],
		}),
	];
	assert.equal(shapePullRequests(raw, ME)[0].kind, 'approved');
});

test('ma PR sans vote ni CI rouge → exclue (rien à faire)', () => {
	const raw = [
		pr({createdBy: {id: ME, displayName: 'Moi'}, reviewers: [{id: 'b', vote: 0}]}),
	];
	assert.equal(shapePullRequests(raw, ME).length, 0);
});

test('tri : reviews avant mes PRs, puis plus anciennes en premier', () => {
	const raw = [
		pr({
			pullRequestId: 1,
			creationDate: '2026-07-03T00:00:00Z',
			createdBy: {id: ME, displayName: 'Moi'},
			reviewers: [{id: 'b', vote: -5}],
		}),
		pr({
			pullRequestId: 2,
			creationDate: '2026-07-02T00:00:00Z',
			reviewers: [{id: ME, vote: 0}],
		}),
		pr({
			pullRequestId: 3,
			creationDate: '2026-07-01T00:00:00Z',
			reviewers: [{id: ME, vote: 0}],
		}),
	];
	assert.deepEqual(
		shapePullRequests(raw, ME).map(p => p.id),
		[3, 2, 1],
	);
});

test('entrée malformée (champs absents) → ignorée sans jeter', () => {
	const out = shapePullRequests([{} as RawPullRequest], ME);
	assert.deepEqual(out, []);
});

test('ageDays : jours entiers écoulés, jamais négatif', () => {
	assert.equal(ageDays('2026-07-01T00:00:00Z', '2026-07-03T12:00:00Z'), 2);
	assert.equal(ageDays('2026-07-05T00:00:00Z', '2026-07-03T00:00:00Z'), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --import tsx --test test/forge.test.ts`
Expected: FAIL — cannot find module `../src/core/forge.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/forge.ts
// Normalisation des PRs de la forge (Azure DevOps) → PrItem[]. Pur et testé.
// Le type PrItem est neutre : ajouter GitHub/GitLab = une fonction shape de plus.

export type PrKind =
	| 'review-requested'
	| 'ci-failed'
	| 'changes-requested'
	| 'approved';

export type PrItem = {
	id: number;
	title: string;
	author: string;
	url: string;
	createdAt: string; // ISO 8601
	kind: PrKind;
};

export type RawPullRequest = {
	pullRequestId?: number;
	title?: string;
	isDraft?: boolean;
	creationDate?: string;
	createdBy?: {id?: string; displayName?: string};
	reviewers?: Array<{id?: string; vote?: number}>;
	repository?: {webUrl?: string; project?: {id?: string}};
};

// votes Azure : 10 approuvé, 5 approuvé avec suggestions, 0 pas de vote,
// -5 waiting for author, -10 rejeté.
function myPrKind(pr: RawPullRequest, ciFailed: boolean): PrKind | null {
	if (ciFailed) return 'ci-failed';
	const votes = (pr.reviewers ?? []).map(r => r.vote ?? 0);
	if (votes.some(v => v < 0)) return 'changes-requested';
	if (votes.some(v => v >= 5)) return 'approved';
	return null; // rien d'actionnable → pas affichée
}

function kindOf(
	pr: RawPullRequest,
	myId: string,
	ciFailed: boolean,
): PrKind | null {
	if (pr.isDraft) return null;
	if (pr.createdBy?.id === myId) return myPrKind(pr, ciFailed);
	const me = (pr.reviewers ?? []).find(r => r.id === myId);
	return me && (me.vote ?? 0) === 0 ? 'review-requested' : null;
}

const rank = (k: PrKind): number => (k === 'review-requested' ? 0 : 1);

export function shapePullRequests(
	raw: readonly RawPullRequest[],
	myId: string,
	ciFailedIds: readonly number[] = [],
): PrItem[] {
	const failed = new Set(ciFailedIds);
	return raw
		.map(pr => {
			const id = pr.pullRequestId ?? 0;
			const kind = kindOf(pr, myId, failed.has(id));
			if (!kind) return null;
			return {
				id,
				title: pr.title ?? '(sans titre)',
				author: pr.createdBy?.displayName ?? '?',
				url: pr.repository?.webUrl
					? `${pr.repository.webUrl}/pullrequest/${id}`
					: '',
				createdAt: pr.creationDate ?? '',
				kind,
			};
		})
		.filter((p): p is PrItem => p !== null)
		.sort(
			(a, b) =>
				rank(a.kind) - rank(b.kind) || a.createdAt.localeCompare(b.createdAt),
		);
}

export function ageDays(createdAt: string, nowISO: string): number {
	const ms = new Date(nowISO).getTime() - new Date(createdAt).getTime();
	return Math.max(0, Math.floor(ms / 86_400_000));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx node --import tsx --test test/forge.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Full check + commit**

```bash
npm test
git add src/core/forge.ts test/forge.test.ts
git commit -m "feat: pure forge module (shape Azure PRs into action-needed items)"
```

---

### Task 2: `azure-auth.ts` — pure device-code flow helpers

**Files:**
- Create: `src/core/azure-auth.ts`
- Test: `test/azure-auth.test.ts`

**Interfaces:**
- Consumes: nothing (pure). Note: `parseTokenResponse`/`isExpired` from `src/core/google-auth.ts` are already token-shape-generic and are reused as-is by Task 5 — do NOT duplicate them here.
- Produces: constants `AZURE_CLIENT_ID`, `DEVICE_CODE_ENDPOINT`, `AZURE_TOKEN_ENDPOINT`, `AZURE_SCOPE`; `buildDeviceCodeBody(): string`; `type RawDeviceCode`; `type DeviceCode = {deviceCode: string; userCode: string; verificationUri: string; intervalMs: number; expiresInMs: number}`; `parseDeviceCode(json: RawDeviceCode): DeviceCode`; `buildDeviceTokenBody(deviceCode: string): string`; `buildAzureRefreshBody(refreshToken: string): string`.

- [ ] **Step 1: Write the failing tests**

```ts
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
	assert.equal(q.get('grant_type'), 'urn:ietf:params:oauth:grant-type:device_code');
	assert.equal(q.get('device_code'), 'dc');
	assert.equal(q.get('client_id'), AZURE_CLIENT_ID);
});

test('buildAzureRefreshBody : grant_type refresh_token + scope', () => {
	const q = new URLSearchParams(buildAzureRefreshBody('rt'));
	assert.equal(q.get('grant_type'), 'refresh_token');
	assert.equal(q.get('refresh_token'), 'rt');
	assert.ok(q.get('scope')?.includes('499b84ac'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --import tsx --test test/azure-auth.test.ts`
Expected: FAIL — cannot find module `../src/core/azure-auth.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/azure-auth.ts
// Flux device-code Entra ID (Azure DevOps) — pur et testé.
// La couche azure-client.ts fait les requêtes et le stockage.
// parseTokenResponse/isExpired de google-auth.ts sont génériques : réutilisés tels quels.

// Client ID public de Visual Studio (même usage que Git Credential Manager)
// → aucun enregistrement d'application requis.
export const AZURE_CLIENT_ID = '872cd9fa-d31f-45e0-9eab-6e460a02d1f1';
export const DEVICE_CODE_ENDPOINT =
	'https://login.microsoftonline.com/organizations/oauth2/v2.0/devicecode';
export const AZURE_TOKEN_ENDPOINT =
	'https://login.microsoftonline.com/organizations/oauth2/v2.0/token';
// Ressource Azure DevOps (ID bien connu) + offline_access pour le refresh token.
export const AZURE_SCOPE =
	'499b84ac-1321-427f-aa17-267ca6975798/.default offline_access';

export function buildDeviceCodeBody(): string {
	return new URLSearchParams({
		client_id: AZURE_CLIENT_ID,
		scope: AZURE_SCOPE,
	}).toString();
}

export type RawDeviceCode = {
	device_code?: string;
	user_code?: string;
	verification_uri?: string;
	interval?: number;
	expires_in?: number;
};

export type DeviceCode = {
	deviceCode: string;
	userCode: string;
	verificationUri: string;
	intervalMs: number;
	expiresInMs: number;
};

export function parseDeviceCode(json: RawDeviceCode): DeviceCode {
	if (!json.device_code || !json.user_code) {
		throw new Error('réponse device-code invalide');
	}

	return {
		deviceCode: json.device_code,
		userCode: json.user_code,
		verificationUri:
			json.verification_uri ?? 'https://microsoft.com/devicelogin',
		intervalMs: (json.interval ?? 5) * 1000,
		expiresInMs: (json.expires_in ?? 900) * 1000,
	};
}

export function buildDeviceTokenBody(deviceCode: string): string {
	return new URLSearchParams({
		grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
		client_id: AZURE_CLIENT_ID,
		device_code: deviceCode,
	}).toString();
}

export function buildAzureRefreshBody(refreshToken: string): string {
	return new URLSearchParams({
		grant_type: 'refresh_token',
		client_id: AZURE_CLIENT_ID,
		refresh_token: refreshToken,
		scope: AZURE_SCOPE,
	}).toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx node --import tsx --test test/azure-auth.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Full check + commit**

```bash
npm test
git add src/core/azure-auth.ts test/azure-auth.test.ts
git commit -m "feat: pure Entra device-code flow helpers (Azure DevOps auth)"
```

---

### Task 3: storage — Azure token file (generic refactor)

**Files:**
- Modify: `src/core/types.ts` (add `OAuthToken`, keep `GoogleToken` as alias)
- Modify: `src/core/storage.ts:66-97` (generalize the token trio, add azure variants)
- Test: `test/storage.test.ts` (append tests)

**Interfaces:**
- Consumes: existing `loadToken`/`saveToken`/`clearToken` internals.
- Produces: in `types.ts`: `type OAuthToken = {refreshToken: string; accessToken: string; expiresAt: string}` and `type GoogleToken = OAuthToken` (existing imports keep working). In `storage.ts`: `loadAzureToken(): OAuthToken | null`, `saveAzureToken(token: OAuthToken): void`, `clearAzureToken(): void` — same atomicity + chmod 600 as the Google ones. Existing exports keep their exact signatures.

- [ ] **Step 1: Write the failing tests (append to `test/storage.test.ts`)**

```ts
test('saveAzureToken puis loadAzureToken : aller-retour, fichier séparé', async () => {
	await withDir(async dir => {
		const {saveAzureToken, loadAzureToken} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		const token = {
			refreshToken: 'r',
			accessToken: 'a',
			expiresAt: '2026-07-07T00:00:00.000Z',
		};
		saveAzureToken(token);
		assert.ok(existsSync(join(dir, 'azure-token.json')));
		assert.deepEqual(loadAzureToken(), token);
	});
});

test('loadAzureToken : null si absent ou corrompu ; clearAzureToken supprime', async () => {
	await withDir(async dir => {
		const {loadAzureToken, saveAzureToken, clearAzureToken} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		assert.equal(loadAzureToken(), null);
		writeFileSync(join(dir, 'azure-token.json'), '{ pas du json');
		assert.equal(loadAzureToken(), null);
		saveAzureToken({refreshToken: 'r', accessToken: 'a', expiresAt: 'x'});
		clearAzureToken();
		assert.equal(loadAzureToken(), null);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --import tsx --test test/storage.test.ts`
Expected: FAIL — `saveAzureToken` is not a function.

- [ ] **Step 3: Implement**

In `src/core/types.ts`, replace the `GoogleToken` block:

```ts
export type OAuthToken = {
	refreshToken: string;
	accessToken: string;
	expiresAt: string; // ISO 8601
};

// alias historique — google-auth/google-client l'importent déjà
export type GoogleToken = OAuthToken;
```

In `src/core/storage.ts`, replace the whole token section (lines 66–97) with a generic trio + named wrappers (import type becomes `OAuthToken`):

```ts
// tokens OAuth (Google, Azure) — un fichier chacun, permissions restreintes (chmod 600)
function loadTokenFile(file: string): OAuthToken | null {
	const path = join(brainDir(), file);
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(
			readFileSync(path, 'utf8'),
		) as Partial<OAuthToken>;
		if (typeof parsed.refreshToken === 'string') return parsed as OAuthToken;
		return null;
	} catch {
		// token illisible → traité comme « non connecté », sans planter ni écraser
		return null;
	}
}

function saveTokenFile(file: string, token: OAuthToken): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `${file}.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(token, null, 2), {mode: 0o600});
	const dest = join(dir, file);
	renameSync(tmp, dest); // atomique sur le même volume
	chmodSync(dest, 0o600);
}

function clearTokenFile(file: string): void {
	const path = join(brainDir(), file);
	if (existsSync(path)) rmSync(path);
}

// Google — signatures inchangées
export const loadToken = (): OAuthToken | null =>
	loadTokenFile('google-token.json');
export const saveToken = (token: OAuthToken): void => {
	saveTokenFile('google-token.json', token);
};

export const clearToken = (): void => {
	clearTokenFile('google-token.json');
};

// Azure DevOps
export const loadAzureToken = (): OAuthToken | null =>
	loadTokenFile('azure-token.json');
export const saveAzureToken = (token: OAuthToken): void => {
	saveTokenFile('azure-token.json', token);
};

export const clearAzureToken = (): void => {
	clearTokenFile('azure-token.json');
};
```

Also update the import at the top of `storage.ts`: `import type {Item, Note, OAuthToken} from './types.ts';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx node --import tsx --test test/storage.test.ts`
Expected: PASS (9 tests — the 7 existing ones must still pass untouched).

- [ ] **Step 5: Full check + commit**

```bash
npm test
git add src/core/types.ts src/core/storage.ts test/storage.test.ts
git commit -m "feat: azure token storage (generic OAuth token file helpers)"
```

---

### Task 4: `azure-config.ts` — organization/project config

**Files:**
- Create: `src/core/azure-config.ts`
- Test: `test/azure-config.test.ts`

**Interfaces:**
- Consumes: `brainDir()` from `src/core/storage.ts`.
- Produces: `type AzureConfig = {organization: string; project: string}`; `loadAzureConfig(): AzureConfig | null` (env `BRAIN_AZURE_ORG`/`BRAIN_AZURE_PROJECT` first, then `~/.brain/azure-config.json`, `null` if unconfigured — the UI hides the section); `saveAzureConfig(cfg: AzureConfig): void`.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx node --import tsx --test test/azure-config.test.ts`
Expected: FAIL — cannot find module `../src/core/azure-config.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/azure-config.ts
// Organisation + projet Azure DevOps. Aucun secret ici (l'auth est en device-code).
// Renseigné via /azure <org> <projet> ou l'environnement.

import {join} from 'node:path';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {brainDir} from './storage.ts';

export type AzureConfig = {organization: string; project: string};

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
			return {organization: cfg.organization, project: cfg.project};
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx node --import tsx --test test/azure-config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Full check + commit**

```bash
npm test
git add src/core/azure-config.ts test/azure-config.test.ts
git commit -m "feat: azure org/project config (env then ~/.brain/azure-config.json)"
```

---

### Task 5: `azure-client.ts` — I/O orchestration

**Files:**
- Modify: `src/core/google-client.ts:37` (export `openBrowser` — add `export` keyword, nothing else changes)
- Create: `src/core/azure-client.ts`
- Test: none (I/O layer, per `standards/ink.md` §9 — same as `google-client.ts`)

**Interfaces:**
- Consumes: Task 2's `azure-auth.ts` exports; `parseTokenResponse`, `isExpired`, `type RawTokenResponse` from `google-auth.ts`; Task 3's `loadAzureToken`/`saveAzureToken`/`clearAzureToken`; Task 4's `loadAzureConfig`; Task 1's `shapePullRequests`, `type RawPullRequest`, `type PrItem`.
- Produces: `isAzureConnected(): boolean`; `requestDeviceCode(): Promise<DeviceCode>`; `pollDeviceToken(dc: DeviceCode): Promise<OAuthToken>` (saves the token); `fetchActionablePrs(): Promise<PrItem[]>`. Also `export function openBrowser(url: string): void` from `google-client.ts`.

- [ ] **Step 1: Export `openBrowser` from `google-client.ts`**

Line 37, change `function openBrowser(url: string): void {` to `export function openBrowser(url: string): void {`. Update its comment to note it's shared with the Azure flow.

- [ ] **Step 2: Write `azure-client.ts`**

```ts
// src/core/azure-client.ts
// Couche I/O Azure DevOps : flux device-code, refresh silencieux, lecture des
// PRs « action requise ». S'appuie sur les fonctions pures de azure-auth.ts
// (corps de requêtes) et forge.ts (normalisation).

import {setTimeout as delay} from 'node:timers/promises';
import type {OAuthToken} from './types.ts';
import {
	DEVICE_CODE_ENDPOINT,
	AZURE_TOKEN_ENDPOINT,
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
import {loadAzureConfig} from './azure-config.ts';
import {
	shapePullRequests,
	type RawPullRequest,
	type PrItem,
} from './forge.ts';

const FORM = {'Content-Type': 'application/x-www-form-urlencoded'};
const nowISO = (): string => new Date().toISOString();

export function isAzureConnected(): boolean {
	return loadAzureToken() !== null;
}

export async function requestDeviceCode(): Promise<DeviceCode> {
	const res = await fetch(DEVICE_CODE_ENDPOINT, {
		method: 'POST',
		headers: FORM,
		body: buildDeviceCodeBody(),
	});
	if (!res.ok) throw new Error(`device-code refusé (${res.status})`);
	return parseDeviceCode((await res.json()) as RawDeviceCode);
}

// poll le token endpoint jusqu'à validation dans le navigateur (ou expiration).
export async function pollDeviceToken(dc: DeviceCode): Promise<OAuthToken> {
	const deadline = Date.now() + dc.expiresInMs;
	let wait = dc.intervalMs;
	while (Date.now() < deadline) {
		// eslint-disable-next-line no-await-in-loop
		await delay(wait);
		// eslint-disable-next-line no-await-in-loop
		const res = await fetch(AZURE_TOKEN_ENDPOINT, {
			method: 'POST',
			headers: FORM,
			body: buildDeviceTokenBody(dc.deviceCode),
		});
		// eslint-disable-next-line no-await-in-loop
		const json = (await res.json()) as RawTokenResponse & {error?: string};
		if (res.ok) {
			const token = parseTokenResponse(json, nowISO());
			saveAzureToken(token);
			return token;
		}

		if (json.error === 'slow_down') wait += 5000;
		else if (json.error !== 'authorization_pending') {
			throw new Error(`autorisation refusée (${json.error ?? res.status})`);
		}
	}

	throw new Error('code expiré — relance /azure');
}

async function ensureAccessToken(): Promise<string> {
	const token = loadAzureToken();
	if (!token) throw new Error('non connecté — /azure');
	if (!isExpired(token, nowISO())) return token.accessToken;

	let json: RawTokenResponse;
	try {
		const res = await fetch(AZURE_TOKEN_ENDPOINT, {
			method: 'POST',
			headers: FORM,
			body: buildAzureRefreshBody(token.refreshToken),
		});
		if (!res.ok) throw new Error(String(res.status));
		json = (await res.json()) as RawTokenResponse;
	} catch {
		clearAzureToken(); // refresh révoqué/expiré → repartir propre
		throw new Error('session Azure expirée — reconnecte via /azure');
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
		`${base}/${encodeURIComponent(cfg.project)}/_apis/git/pullrequests?searchCriteria.status=active&$top=200&api-version=7.1`,
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
```

- [ ] **Step 3: Verify lint + types + existing tests**

Run: `npm test`
Expected: PASS — prettier, xo, and all existing tests green (no unit tests for this I/O file).

- [ ] **Step 4: Commit**

```bash
git add src/core/azure-client.ts src/core/google-client.ts
git commit -m "feat: azure devops client (device-code connect + actionable PR fetch)"
```

---

### Task 6: commands + hints + theme

**Files:**
- Modify: `src/core/commands.ts:7` (registry)
- Modify: `src/core/hints.ts` (accept `prnav` mode)
- Modify: `src/core/theme.ts` (PR color + glyphs)
- Test: `test/commands.test.ts`, `test/hints.test.ts` (append)

**Interfaces:**
- Consumes: existing `parseCommand`, `hint`, `color`/`glyph`.
- Produces: `/azure` and `/prs` recognized by `parseCommand` (args preserved: `/azure org proj` → `{name: 'azure', args: ['org', 'proj']}`); `hint(world, mode)` accepts `mode: 'prnav'` and returns `'↑/↓ · o/Entrée: ouvrir · Échap: saisie'`; theme gains `color.pr = 'magenta'` and `glyph.prReview = '⇄'`, `glyph.prCiFail = '✗'`, `glyph.prChanges = '↺'`, `glyph.prApproved = '✓'`.

- [ ] **Step 1: Write the failing tests**

Append to `test/commands.test.ts`:

```ts
test('/azure et /prs sont des commandes, avec args', () => {
	assert.deepEqual(parseCommand('/azure org proj'), {
		name: 'azure',
		args: ['org', 'proj'],
	});
	assert.deepEqual(parseCommand('/prs'), {name: 'prs', args: []});
});
```

Append to `test/hints.test.ts`:

```ts
test('mode prnav : navigation + ouvrir', () => {
	assert.equal(hint('tasks', 'prnav'), '↑/↓ · o/Entrée: ouvrir · Échap: saisie');
});
```

(Match the exact import/test style already present in those two files.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx node --import tsx --test test/commands.test.ts test/hints.test.ts`
Expected: FAIL on both new tests.

- [ ] **Step 3: Implement**

`src/core/commands.ts` line 7:

```ts
const REGISTRY = new Set(['gauth', 'debrief', 'azure', 'prs']);
```

`src/core/hints.ts` — extend the local `Mode` type and handle it first:

```ts
type Mode = 'input' | 'nav' | 'reminder' | 'prnav';

export function hint(world: World, mode: Mode): string {
	if (mode === 'prnav') return '↑/↓ · o/Entrée: ouvrir · Échap: saisie';
	// … reste inchangé
```

`src/core/theme.ts` — add to `color`:

```ts
	pr: 'magenta', // section PRs (miroir de la forge)
```

and to `glyph`:

```ts
	prReview: '⇄', // PR à reviewer
	prCiFail: '✗', // CI rouge
	prChanges: '↺', // changements demandés
	prApproved: '✓', // approuvée, à merger
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx node --import tsx --test test/commands.test.ts test/hints.test.ts`
Expected: PASS.

- [ ] **Step 5: Full check + commit**

```bash
npm test
git add src/core/commands.ts src/core/hints.ts src/core/theme.ts test/commands.test.ts test/hints.test.ts
git commit -m "feat: register /azure + /prs, prnav hints, PR theme tokens"
```

---

### Task 7: `PrSection` component (display only)

**Files:**
- Create: `src/components/molecules/pr-section.tsx`
- Test: none (Ink layer — display only, no logic)

**Interfaces:**
- Consumes: `PrItem`, `PrKind`, `ageDays` from `src/core/forge.ts`; `color`, `glyph` from `src/core/theme.ts`.
- Produces: `export type AzState = 'off' | 'code' | 'connecting' | 'connected' | 'error'`; default export `PrSection({state, code, error, prs, nowISO, active, selected}: {state: AzState; code: string | null; error: string | null; prs: PrItem[]; nowISO: string; active: boolean; selected: number})` — renders `null` when `state === 'off'`, or when connected with no PRs and no error.

- [ ] **Step 1: Write the component**

```tsx
// src/components/molecules/pr-section.tsx
import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import {ageDays, type PrItem, type PrKind} from '../../core/forge.ts';

export type AzState = 'off' | 'code' | 'connecting' | 'connected' | 'error';

const LOOK: Record<PrKind, {icon: string; label: string; tint: string}> = {
	'review-requested': {icon: glyph.prReview, label: 'à reviewer', tint: color.pr},
	'ci-failed': {icon: glyph.prCiFail, label: 'CI rouge', tint: color.danger},
	'changes-requested': {
		icon: glyph.prChanges,
		label: 'changements demandés',
		tint: color.danger,
	},
	approved: {icon: glyph.prApproved, label: 'approuvée', tint: color.pinned},
};

// Miroir des PRs de la forge : lecture seule, disparaît quand la forge dit
// que c'est réglé. Aucune logique ici — tout vient de forge.ts.
export default function PrSection({
	state,
	code,
	error,
	prs,
	nowISO,
	active,
	selected,
}: {
	state: AzState;
	code: string | null;
	error: string | null;
	prs: PrItem[];
	nowISO: string;
	active: boolean;
	selected: number;
}) {
	if (state === 'off') return null;

	if (state === 'code') {
		return <Text color={color.pr}>⇄ azure : {code ?? '…'}</Text>;
	}

	if (state === 'connecting') {
		return <Text dimColor>⇄ azure : connexion…</Text>;
	}

	if (state === 'error') {
		return (
			<Text color={color.danger}>⇄ {error ?? 'erreur azure'} · /azure</Text>
		);
	}

	// connected
	if (prs.length === 0 && !error) return null;

	return (
		<Box flexDirection="column">
			{error ? <Text dimColor>⇄ {error}</Text> : null}
			{prs.map((pr, i) => {
				const look = LOOK[pr.kind];
				const age = ageDays(pr.createdAt, nowISO);
				const sel = active && i === selected;
				return (
					<Text key={pr.id} inverse={sel}>
						<Text color={look.tint}>
							{sel ? glyph.caret : ' '} {look.icon} {look.label}
						</Text>
						<Text>
							{' '}
							{glyph.bullet} {pr.title} ({pr.author})
							{age > 0 ? ` ${glyph.bullet} ${age}j` : ''}
						</Text>
					</Text>
				);
			})}
		</Box>
	);
}
```

- [ ] **Step 2: Verify lint + types**

Run: `npm test`
Expected: PASS (component not yet imported anywhere — that's Task 8).
Note: if xo flags the unused default export, it won't — exported symbols are exempt. If prettier reformats, accept its formatting (`npx prettier --write src/components/molecules/pr-section.tsx`).

- [ ] **Step 3: Commit**

```bash
git add src/components/molecules/pr-section.tsx
git commit -m "feat: PrSection component (forge mirror lines + auth states)"
```

---

### Task 8: wire into `app.tsx` (state, poll, commands, PR nav)

**Files:**
- Modify: `src/app.tsx` (all snippets below; line numbers refer to the current file)

**Interfaces:**
- Consumes: everything produced by Tasks 1–7.
- Produces: the running feature. No new exports.

- [ ] **Step 1: Imports and types (top of file)**

Add imports:

```tsx
import {
	isAzureConnected,
	requestDeviceCode,
	pollDeviceToken,
	fetchActionablePrs,
} from './core/azure-client.ts';
import {loadAzureConfig, saveAzureConfig} from './core/azure-config.ts';
import {openBrowser} from './core/google-client.ts';
import type {PrItem} from './core/forge.ts';
import PrSection, {type AzState} from './components/molecules/pr-section.tsx';
```

Extend the mode union (line 54):

```tsx
type Mode = 'input' | 'nav' | 'reminder' | 'prnav';
```

- [ ] **Step 2: State + poll effect (after the debrief state block, ~line 111)**

```tsx
	// --- miroir PRs Azure DevOps (lecture seule, la forge est la vérité) ---
	const [azState, setAzState] = useState<AzState>(() =>
		isAzureConnected() && loadAzureConfig() ? 'connected' : 'off',
	);
	const [azCode, setAzCode] = useState<string | null>(null);
	const [azError, setAzError] = useState<string | null>(null);
	const [prs, setPrs] = useState<PrItem[]>([]);
	const [prSelected, setPrSelected] = useState(0);

	const refreshPrs = async () => {
		try {
			setPrs(await fetchActionablePrs());
			setAzError(null);
		} catch (error: unknown) {
			// on garde les dernières données valides ; statut discret dans la section
			setAzError(error instanceof Error ? error.message : String(error));
		}
	};

	// sondage : immédiat à la connexion, puis toutes les 5 min (même cadence que l'agenda)
	useEffect(() => {
		if (azState !== 'connected') return;
		void refreshPrs();
		const id = setInterval(() => {
			void refreshPrs();
		}, 5 * 60 * 1000);
		return () => {
			clearInterval(id);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [azState]);

	const runAzure = async (args: string[]) => {
		if (args.length >= 2) {
			saveAzureConfig({organization: args[0], project: args[1]});
		}

		if (!loadAzureConfig()) {
			setAzState('error');
			setAzError('usage : /azure <organisation> <projet>');
			return;
		}

		try {
			setAzError(null);
			const dc = await requestDeviceCode();
			setAzCode(`entre ${dc.userCode} sur ${dc.verificationUri}`);
			setAzState('code');
			await pollDeviceToken(dc);
			setAzCode(null);
			setAzState('connected'); // déclenche le sondage ci-dessus
		} catch (error: unknown) {
			setAzCode(null);
			setAzState('error');
			setAzError(error instanceof Error ? error.message : String(error));
		}
	};
```

- [ ] **Step 3: Command dispatch (line ~193, `runCommand`)**

```tsx
	// dispatch d'une commande de la barre (`/gauth`, `/debrief`, `/azure`, `/prs`)
	const runCommand = (name: string, args: string[]) => {
		if (name === 'gauth') void runConnect();
		if (name === 'debrief') runDebrief();
		if (name === 'azure') void runAzure(args);
		if (name === 'prs') void refreshPrs();
	};
```

Update both call sites (`submitInput` line ~458 and `submitNote` line ~483): `runCommand(cmd.name, cmd.args);`.

- [ ] **Step 4: Scroll-window budget (line ~278)**

The PR section eats body lines; shrink the task/note window accordingly:

```tsx
	// lignes occupées par la section PRs (statut ou lignes de PR)
	const prRows =
		azState === 'off'
			? 0
			: azState === 'connected'
				? prs.length + (azError ? 1 : 0)
				: 1;
	// ponytail: marge fixe de 11 lignes, ajuster si le chrome grossit
	const rows = Math.max(1, termRows - 11 - prRows);
```

- [ ] **Step 5: PR navigation (`prnav` mode)**

The entry point: in the tasks-world nav handler (line ~355, `mode === 'nav'` branch), up-arrow at the top enters PR nav when there are PRs:

```tsx
				if (key.upArrow) {
					if (clampedSel === 0 && prs.length > 0) {
						setPrSelected(prs.length - 1);
						setMode('prnav');
					} else {
						setSelected(Math.max(0, clampedSel - 1));
					}
				}
```

New gated `useInput` (add right after the tasks-world one, ~line 382) — one responsibility, per `standards/ink.md`:

```tsx
	// --- Navigation dans la section PRs (o/Entrée ouvre dans le navigateur) ---
	useInput(
		(input, key) => {
			const clamped = Math.min(prSelected, Math.max(0, prs.length - 1));
			if (key.escape || prs.length === 0) {
				setMode('input');
			} else if (key.downArrow) {
				if (clamped >= prs.length - 1) {
					setSelected(0);
					setMode('nav');
				} else {
					setPrSelected(clamped + 1);
				}
			} else if (key.upArrow) {
				setPrSelected(Math.max(0, clamped - 1));
			} else if (input === 'o' || key.return) {
				const target = prs[clamped];
				if (target?.url) openBrowser(target.url);
			}
		},
		{isActive: world === 'tasks' && mode === 'prnav' && !blocked},
	);
```

- [ ] **Step 6: Render the section**

In the `AppLayout` call (line ~604), compose the status slot:

```tsx
				status={
					<>
						<AgendaStatus
							state={connState}
							meetings={meetings}
							nowISO={nowISO()}
							error={connectError}
						/>
						<PrSection
							state={azState}
							code={azCode}
							error={azError}
							prs={prs}
							nowISO={nowISO()}
							active={mode === 'prnav'}
							selected={Math.min(prSelected, Math.max(0, prs.length - 1))}
						/>
					</>
				}
```

If `AppLayout` wraps `status` in a single-line `<Box>` (check `src/components/templates/app-layout.tsx`), loosen it to `flexDirection="column"` so the fragment stacks.

Also: `HintBar` receives `mode` — its prop type must accept `'prnav'` (it forwards to `hint()`, already extended in Task 6; widen the prop type in `src/components/molecules/hint-bar.tsx` if it declares its own union).

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: PASS (prettier + xo + all tests).

Manual smoke (real Azure org needed):

```bash
npm start
# 1. /azure <org> <projet> → la ligne « ⇄ azure : entre XXXX-XXXX sur … » apparaît
# 2. valider dans le navigateur → la section PRs se remplit (ou disparaît si vide)
# 3. /prs → refresh immédiat
# 4. mode nav, ↑ depuis le premier item → sélection PR, o → ouvre le navigateur
# 5. relancer brain → toujours connecté (token persisté)
```

- [ ] **Step 8: Commit**

```bash
git add src/app.tsx src/components/templates/app-layout.tsx src/components/molecules/hint-bar.tsx
git commit -m "feat: wire PR mirror into app (poll, /azure device-code, /prs, PR nav)"
```

---

### Task 9: final verification

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: prettier ✓, xo ✓, all `node:test` files PASS.

- [ ] **Step 2: End-to-end run**

Run `npm start` in a real terminal (kitty protocol needs a TTY). Walk the manual smoke list from Task 8 Step 7. Verify: unplugging the network mid-session keeps the last PR list and shows the dim error line; `brain` without azure config shows no PR section at all.

- [ ] **Step 3: Update CLAUDE.md module list**

Add `forge.ts`, `azure-auth.ts`, `azure-client.ts`, `azure-config.ts` to the *Modules* paragraph of `CLAUDE.md` (pure/tested vs I/O split, one sentence).

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md module list (forge PR mirror)"
```
