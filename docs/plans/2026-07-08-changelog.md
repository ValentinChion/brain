# Changelog in-app — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** afficher les nouveautés de brain après une mise à jour (takeover plein écran, dernière version seulement) et l'historique complet à la demande via la commande `/changelog`.

**Architecture :** source de vérité = module pur `src/core/changelog.ts` (tableau typé, bundlé par esbuild — pas de CHANGELOG.md à embarquer). Dernière version vue persistée dans `meta.json` via `storage.ts`. Un seul composant plein écran `ChangelogView` sert les deux surfaces ; `app.tsx` ne fait que l'état + le clavier, conformément à `standards/ink.md`.

**Tech stack :** Ink 7 + React 19, `node:test`/`node:assert`, tsx (pas de build en dev).

## Contraintes globales

- Toute logique testable vit dans un module pur (`standards/ink.md` §1) ; `app.tsx` et les composants ne sont pas testés unitairement.
- Imports relatifs avec extension `.ts`/`.tsx` (ESM, pas de sortie compilée).
- Un seul `useInput` actif par responsabilité, gaté par `isActive`.
- `npm test` = prettier + xo + node:test — les trois doivent passer à chaque commit.
- Docs/commentaires en français, style des fichiers voisins.

## Décisions produit (issues du design du 2026-07-08)

- Lancement sur une version ≠ `lastSeenVersion` → takeover plein écran, **dernière version seulement**, fermé par Entrée/Échap (touche délibérée : pas d'any-key qui avalerait une frappe de capture).
- `/changelog` dans la barre de saisie (idiome `commands.ts` existant) → même vue, **historique complet**, ↑/↓ pour défiler, Échap/Entrée pour fermer.
- Première installation (pas de `meta.json`) : pas de takeover, on enregistre juste la version courante.
- Fermer la vue (quel que soit le mode) écrit `lastSeenVersion = version courante`.
- Version courante = `CHANGELOG[0].version` (pas d'import de package.json à l'exécution) ; un test garde-fou vérifie l'égalité avec `package.json`.

---

### Task 1 : module pur `changelog.ts`

**Files :**
- Create : `src/core/changelog.ts`
- Test : `test/changelog.test.ts`

**Interfaces :**
- Produces : `type ChangelogEntry = {version: string; date: string; entries: string[]}` ; `CHANGELOG: ChangelogEntry[]` (trié du plus récent au plus ancien) ; `changelogLines(log: ChangelogEntry[]): string[]` (lignes prêtes à afficher, en-tête `vX.Y.Z — date` + puces, ligne vide entre versions).

- [ ] **Step 1 : écrire les tests qui échouent**

`test/changelog.test.ts` :

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHANGELOG, changelogLines} from '../src/core/changelog.ts';

test('changelogLines : en-tête version + puces, ligne vide entre versions', () => {
	const lines = changelogLines([
		{version: '0.2.0', date: '2026-07-10', entries: ['a', 'b']},
		{version: '0.1.0', date: '2026-07-08', entries: ['c']},
	]);
	assert.deepEqual(lines, [
		'v0.2.0 — 2026-07-10',
		'  · a',
		'  · b',
		'',
		'v0.1.0 — 2026-07-08',
		'  · c',
	]);
});

test('garde-fou : CHANGELOG[0].version === version du package', () => {
	const pkg = JSON.parse(
		readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
	) as {version: string};
	assert.equal(CHANGELOG[0].version, pkg.version);
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx node --import tsx --test test/changelog.test.ts`
Attendu : FAIL (`Cannot find module '../src/core/changelog.ts'`).

- [ ] **Step 3 : implémentation minimale**

`src/core/changelog.ts` :

```ts
// Nouveautés de brain — source de vérité du changelog (bundlée par esbuild,
// pas de CHANGELOG.md à résoudre à l'exécution). Plus récent en premier ;
// la « version courante » de l'app est CHANGELOG[0].version (un test garde-fou
// vérifie l'égalité avec package.json).

export type ChangelogEntry = {
	version: string;
	date: string; // YYYY-MM-DD
	entries: string[];
};

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.0',
		date: '2026-07-08',
		entries: [
			'Capture de tâches/feedbacks avec rappels (stepper aux flèches)',
			'Notes épinglables + ménage hebdomadaire des notes périmées',
			'Agenda Google : réunions du jour + débrief de fin de réunion',
			'Miroir des PRs Azure DevOps (lecture seule)',
			'Commandes : /gauth /debrief /azure /prs /changelog',
		],
	},
];

// Lignes prêtes à afficher (la vue ne fait que les rendre + fenêtrer).
export function changelogLines(log: ChangelogEntry[]): string[] {
	return log.flatMap((entry, i) => [
		...(i > 0 ? [''] : []),
		`v${entry.version} — ${entry.date}`,
		...entry.entries.map(text => `  · ${text}`),
	]);
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npx node --import tsx --test test/changelog.test.ts`
Attendu : PASS (2 tests).

- [ ] **Step 5 : commit**

```bash
git add src/core/changelog.ts test/changelog.test.ts
git commit -m "feat: module pur changelog (entrées + lignes d'affichage)"
```

---

### Task 2 : `meta.json` dans `storage.ts`

**Files :**
- Modify : `src/core/storage.ts` (ajout en fin de fichier)
- Test : `test/storage.test.ts` (ajout en fin de fichier)

**Interfaces :**
- Produces : `type Meta = {lastSeenVersion?: string}` ; `loadMeta(): Meta` (`{}` si absent/corrompu) ; `saveMeta(meta: Meta): void` (écriture atomique, même motif que les autres fichiers).

- [ ] **Step 1 : écrire le test qui échoue**

À la fin de `test/storage.test.ts` (réutilise le helper `withDir` existant) :

```ts
test('saveMeta puis loadMeta : aller-retour ; {} si absent ou corrompu', async () => {
	await withDir(async dir => {
		const {loadMeta, saveMeta} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		assert.deepEqual(loadMeta(), {});
		saveMeta({lastSeenVersion: '0.1.0'});
		assert.deepEqual(loadMeta(), {lastSeenVersion: '0.1.0'});
		writeFileSync(join(dir, 'meta.json'), '{ pas du json');
		assert.deepEqual(loadMeta(), {});
	});
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx node --import tsx --test test/storage.test.ts`
Attendu : FAIL sur le nouveau test (`loadMeta is not a function`), les autres PASS.

- [ ] **Step 3 : implémentation minimale**

À la fin de `src/core/storage.ts` :

```ts
// état applicatif hors données (ex. dernière version vue par l'utilisateur)
export type Meta = {lastSeenVersion?: string};

export function loadMeta(): Meta {
	const path = join(brainDir(), 'meta.json');
	if (!existsSync(path)) return {};
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
			return {};
		return parsed as Meta;
	} catch {
		// illisible → comme absent (on le réécrira proprement à la prochaine sauvegarde)
		return {};
	}
}

export function saveMeta(meta: Meta): void {
	const dir = brainDir();
	mkdirSync(dir, {recursive: true});
	const tmp = join(dir, `meta.json.tmp-${process.pid}`);
	writeFileSync(tmp, JSON.stringify(meta, null, 2));
	renameSync(tmp, join(dir, 'meta.json')); // atomique sur le même volume
}
```

- [ ] **Step 4 : vérifier le succès**

Run : `npx node --import tsx --test test/storage.test.ts`
Attendu : PASS (tous).

- [ ] **Step 5 : commit**

```bash
git add src/core/storage.ts test/storage.test.ts
git commit -m "feat: meta.json (lastSeenVersion) via storage atomique"
```

---

### Task 3 : commande `/changelog`

**Files :**
- Modify : `src/core/commands.ts:7` (REGISTRY)
- Test : `test/commands.test.ts` (ajout en fin de fichier)

**Interfaces :**
- Produces : `parseCommand('/changelog')` → `{name: 'changelog', args: []}` (consommé par `runCommand` en Task 4).

- [ ] **Step 1 : écrire le test qui échoue**

À la fin de `test/commands.test.ts` :

```ts
test('/changelog est une commande', () => {
	assert.deepEqual(parseCommand('/changelog'), {name: 'changelog', args: []});
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx node --import tsx --test test/commands.test.ts`
Attendu : FAIL (`parseCommand('/changelog')` renvoie `null`).

- [ ] **Step 3 : implémentation minimale**

Dans `src/core/commands.ts` :

```ts
const REGISTRY = new Set(['gauth', 'debrief', 'azure', 'prs', 'changelog']);
```

- [ ] **Step 4 : vérifier le succès**

Run : `npx node --import tsx --test test/commands.test.ts`
Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/commands.ts test/commands.test.ts
git commit -m "feat: commande /changelog enregistrée"
```

---

### Task 4 : `ChangelogView` + câblage `app.tsx`

**Files :**
- Create : `src/components/organisms/changelog-view.tsx`
- Modify : `src/app.tsx` (imports, état, `useInput`, `runCommand`, early return)

**Interfaces :**
- Consumes : `CHANGELOG`, `changelogLines` (Task 1) ; `loadMeta`, `saveMeta` (Task 2) ; `/changelog` (Task 3) ; `listRows` de `view.ts` (existant).
- Produces : rien (feuille de l'arbre).

Couche Ink : pas de test unitaire (convention repo) ; vérification = suite verte + passage manuel.

- [ ] **Step 1 : composant plein écran**

`src/components/organisms/changelog-view.tsx` (même gabarit que `sweep-view.tsx`) :

```tsx
import React from 'react';
import {Box, Text} from 'ink';
import {color, glyph} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';

// Vue plein écran des nouveautés : lignes pré-formatées par changelogLines(),
// fenêtrées par app.tsx (offset + rows) — le composant ne fait que rendre.
export default function ChangelogView({
	lines,
	offset,
	rows,
	loadError,
}: {
	lines: string[];
	offset: number;
	rows: number;
	loadError: string | null;
}) {
	const end = Math.min(lines.length, offset + rows);
	return (
		<Box flexDirection="column">
			<Masthead accent={color.task} label="NOUVEAUTÉS" />
			<Box flexDirection="column" paddingX={1} paddingBottom={1}>
				{loadError && <Text color={color.danger}>{loadError}</Text>}
				{offset > 0 && (
					<Text dimColor>
						{glyph.moreUp} {offset} au-dessus
					</Text>
				)}
				{lines.slice(offset, end).map((line, i) => (
					<Text
						key={offset + i}
						color={line.startsWith('v') ? color.task : undefined}
						bold={line.startsWith('v')}
					>
						{line || ' '}
					</Text>
				))}
				{end < lines.length && (
					<Text dimColor>
						{glyph.moreDown} {lines.length - end} de plus
					</Text>
				)}
				<Box marginTop={1}>
					<Text dimColor>↑↓ défiler · [Entrée/Échap] fermer</Text>
				</Box>
			</Box>
		</Box>
	);
}
```

Note : `{line || ' '}` — un `<Text></Text>` vide ne rend pas de ligne, l'espace préserve la ligne vide entre versions.

- [ ] **Step 2 : câbler `app.tsx`**

Imports (avec les autres imports core/composants) :

```tsx
import {CHANGELOG, changelogLines} from './core/changelog.ts';
// compléter l'import storage existant :
import {load, save, loadNotes, saveNotes, loadHandled, saveHandled, loadMeta, saveMeta} from './core/storage.ts';
import ChangelogView from './components/organisms/changelog-view.tsx';
```

État (près des autres `useState`, init paresseuse = une lecture disque au montage, comme `load`/`loadNotes`) :

```tsx
// --- changelog : takeover post-mise-à-jour + vue /changelog ---
const [initialMeta] = useState(loadMeta);
const [changelogOpen, setChangelogOpen] = useState<'update' | 'manual' | null>(
	initialMeta.lastSeenVersion &&
		initialMeta.lastSeenVersion !== CHANGELOG[0].version
		? 'update'
		: null,
);
const [clOffset, setClOffset] = useState(0);

// première installation : rien à annoncer, on enregistre juste la version courante
useEffect(() => {
	if (!initialMeta.lastSeenVersion)
		saveMeta({...initialMeta, lastSeenVersion: CHANGELOG[0].version});
}, [initialMeta]);

const closeChangelog = () => {
	saveMeta({...loadMeta(), lastSeenVersion: CHANGELOG[0].version});
	setChangelogOpen(null);
	setClOffset(0);
};
```

Dérivés + clavier (après `useWindowSize`, avec les autres `useInput` ; `listRows` est déjà importé) :

```tsx
// takeover = dernière version seulement ; /changelog = historique complet
const clLines =
	changelogOpen === 'manual'
		? changelogLines(CHANGELOG)
		: changelogLines([CHANGELOG[0]]);
// chrome de ChangelogView : masthead (5) + hints+marge (2) + padding (1) + indicateurs ▲/▼ via listRows
const clRows = listRows(termRows, 8, clLines.length);

useInput(
	(input, key) => {
		if (key.escape || key.return) {
			closeChangelog();
		} else if (key.downArrow) {
			setClOffset(o => Math.min(o + 1, Math.max(0, clLines.length - clRows)));
		} else if (key.upArrow) {
			setClOffset(o => Math.max(0, o - 1));
		}
	},
	{isActive: changelogOpen !== null && !sweeping && !connectPromptOpen && !head},
);
```

`blocked` (ligne ~422) — le changelog bloque les autres claviers :

```tsx
const blocked =
	sweeping ||
	connectPromptOpen ||
	debriefQueue.length > 0 ||
	changelogOpen !== null;
```

`runCommand` (ligne ~266, mettre à jour aussi le commentaire au-dessus) :

```tsx
// dispatch d'une commande de la barre (`/gauth`, `/debrief`, `/azure`, `/prs`, `/changelog`)
const runCommand = (name: string, args: string[]) => {
	if (name === 'gauth') void runConnect();
	if (name === 'debrief') runDebrief();
	if (name === 'azure') void runAzure(args);
	if (name === 'prs') void refreshPrs();
	if (name === 'changelog') setChangelogOpen('manual');
};
```

Early return, après le bloc `if (head)` (le ménage, le prompt agenda et le débrief gardent la priorité au démarrage) :

```tsx
if (changelogOpen) {
	return (
		<ChangelogView
			lines={clLines}
			offset={clOffset}
			rows={clRows}
			loadError={loadError}
		/>
	);
}
```

- [ ] **Step 3 : suite complète verte**

Run : `npm test`
Attendu : prettier + xo + node:test tous PASS. Si prettier râle, `npx prettier --write .` puis relancer.

- [ ] **Step 4 : vérification manuelle**

```bash
# vue manuelle : taper /changelog puis Entrée → historique ; ↑↓ défile ; Échap ferme
BRAIN_DIR=$(mktemp -d) npm start
# takeover : simuler une version vue antérieure puis relancer
DIR=$(mktemp -d); echo '{"lastSeenVersion":"0.0.1"}' > "$DIR/meta.json"
BRAIN_DIR=$DIR npm start   # → takeover NOUVEAUTÉS ; Entrée ferme ; relancer → plus de takeover
```

Attendu : les trois comportements (frais → rien, ancien → takeover une fois, `/changelog` → historique).

- [ ] **Step 5 : commit**

```bash
git add src/components/organisms/changelog-view.tsx src/app.tsx
git commit -m "feat: vue changelog (takeover post-update + /changelog)"
```

---

## Maintenance (hors code)

À chaque release : bump `package.json` **et** ajout d'une entrée en tête de `CHANGELOG` dans `src/core/changelog.ts` — le test garde-fou de Task 1 casse si l'un des deux est oublié.
