# Menu de commandes sur `/` — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** quand la saisie commence par `/`, afficher sous la barre un menu navigable des commandes enregistrées — ↑/↓ déplace la sélection, Entrée exécute, Tab complète dans la saisie, Échap vide le brouillon.

**Architecture :** toute la logique (registre + filtre préfixe) vit dans `src/core/commands.ts` (pur, testé `node:test`). La couche Ink n'ajoute qu'une molécule d'affichage (`command-menu.tsx`) et du routage clavier dans `app.tsx` via les callbacks existants de `MultilineInput` (`onSubmit`/`onExitUp`/`onCancel`) plus un nouveau `onExitDown`. Le menu est compté dans le budget de lignes `chrome` pour ne pas faire déborder le terminal.

**Stack :** Node/TypeScript + Ink 7, `tsx` (pas de build), `node:test` + `node:assert`, xo + prettier.

## Contraintes globales

- `standards/ink.md` gouverne tout le code Ink : logique en modules purs, `.tsx` = affichage + clavier, un seul `useInput` actif par responsabilité (`isActive`).
- ESM sans build : extensions `.ts`/`.tsx` obligatoires dans les imports relatifs.
- `npm test` = `prettier --check .` + `xo` + `node:test` — les trois doivent passer à chaque commit.
- Textes UI et commentaires en français.

## Décisions actées (interview design)

- Menu **navigable** : ↑/↓ déplacent la sélection (clampée, pas de wrap ; reset en haut à chaque frappe qui modifie le texte).
- **Entrée exécute** la commande sélectionnée immédiatement (sans args) ; **Tab complète** le nom dans la saisie (`/azure `) pour taper des args ; Tab ne bascule PAS de monde tant que le menu est ouvert.
- Menu ouvert **seulement pendant la frappe du nom** : brouillon commençant par `/`, sans espace/retour-ligne, ≥1 commande en préfixe. `/etc` → menu fermé, texte normal (protection existante conservée) ; `/azure ` (espace) → menu fermé, saisie des args ; `parseCommand` à la soumission reste le chemin des commandes avec args.
- **Échap vide le brouillon** (ferme le menu). En notes, il ne passe en nav QUE si le menu est fermé.
- Identique dans les deux mondes (tâches/notes), y compris pendant l'édition d'un élément existant (même chemin de soumission).
- Placement : sous la barre de saisie, au-dessus des hints ; lignes ajoutées au décompte `chrome` (`app.tsx`).
- Pas de test `ink-testing-library` : la logique testable est dans `matchCommands`/`hint` (standards §9 : tests UI rares) ; vérification manuelle en fin de plan.

---

### Task 1 : `matchCommands` — registre descriptif + filtre préfixe (pur)

**Files:**
- Modify: `src/core/commands.ts`
- Test: `test/commands.test.ts`

**Interfaces:**
- Consumes: rien (module feuille).
- Produces: `export type CommandInfo = {name: string; description: string}` ; `export const COMMANDS: CommandInfo[]` ; `export function matchCommands(draft: string): CommandInfo[]`. `parseCommand` inchangé.

- [ ] **Step 1 : écrire les tests qui échouent**

Ajouter à la fin de `test/commands.test.ts` :

```ts
import {parseCommand, matchCommands} from '../src/core/commands.ts';
```

(remplacer l'import existant de `parseCommand`), puis :

```ts
test('matchCommands : préfixe → commandes filtrées, insensible à la casse', () => {
	assert.equal(matchCommands('/').length, 4); // toutes
	assert.deepEqual(
		matchCommands('/ga').map(c => c.name),
		['gauth'],
	);
	assert.deepEqual(
		matchCommands('/GA').map(c => c.name),
		['gauth'],
	);
	assert.ok(matchCommands('/prs')[0]?.description); // chaque commande est décrite
});

test('matchCommands : fermé hors frappe du nom de commande', () => {
	assert.deepEqual(matchCommands(''), []);
	assert.deepEqual(matchCommands('acheter du pain'), []);
	assert.deepEqual(matchCommands('/etc'), []); // aucun préfixe → contenu normal
	assert.deepEqual(matchCommands('/azure '), []); // espace → saisie des args
	assert.deepEqual(matchCommands('/g\nx'), []); // retour-ligne = fermé aussi
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx node --import tsx --test test/commands.test.ts`
Attendu : FAIL — `matchCommands` n'est pas exporté.

- [ ] **Step 3 : implémenter**

Remplacer le contenu de `src/core/commands.ts` par :

```ts
// Commandes de la barre de saisie : un texte est une commande seulement s'il
// commence par `/` ET que le premier mot est enregistré. Sinon → null (contenu
// normal), ce qui protège la capture de notes commençant par `/` (ex. /etc/hosts).

export type Command = {name: string; args: string[]};
export type CommandInfo = {name: string; description: string};

// Source de vérité unique : le menu (matchCommands) et le parseur (parseCommand)
// lisent la même liste.
export const COMMANDS: CommandInfo[] = [
	{name: 'gauth', description: "connecter l'agenda Google"},
	{name: 'debrief', description: 'debrief de la dernière réunion'},
	{name: 'azure', description: 'configurer Azure DevOps (org projet)'},
	{name: 'prs', description: 'rafraîchir les PRs'},
];

const REGISTRY = new Set(COMMANDS.map(c => c.name));

export function parseCommand(text: string): Command | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith('/')) return null;
	const parts = trimmed.slice(1).split(/\s+/);
	const name = (parts[0] ?? '').toLowerCase();
	if (!REGISTRY.has(name)) return null;
	return {name, args: parts.slice(1)};
}

// Menu : visible seulement pendant la frappe du nom (`/` en premier caractère,
// pas encore d'espace) et s'il reste au moins un préfixe qui matche.
// `/etc` → [] (le texte redevient du contenu normal), `/azure ` → [] (args).
export function matchCommands(draft: string): CommandInfo[] {
	if (!draft.startsWith('/')) return [];
	const q = draft.slice(1);
	if (/\s/.test(q)) return [];
	const lower = q.toLowerCase();
	return COMMANDS.filter(c => c.name.startsWith(lower));
}
```

- [ ] **Step 4 : vérifier le passage**

Run : `npx node --import tsx --test test/commands.test.ts`
Attendu : PASS (tests existants `parseCommand` inclus — le registre dérivé de `COMMANDS` doit rester identique).

- [ ] **Step 5 : commit**

```bash
git add src/core/commands.ts test/commands.test.ts
git commit -m "feat: matchCommands — registre décrit + filtre préfixe du menu"
```

---

### Task 2 : hint contextuel quand le menu est ouvert (pur)

**Files:**
- Modify: `src/core/hints.ts`
- Modify: `src/components/molecules/hint-bar.tsx`
- Test: `test/hints.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `hint(world, mode, menuOpen?: boolean): string` (3e paramètre optionnel, défaut `false`) ; `HintBar` accepte la prop optionnelle `menuOpen?: boolean`.

- [ ] **Step 1 : écrire le test qui échoue**

Ajouter à `test/hints.test.ts` :

```ts
test('hint : menu de commandes ouvert → aide du menu, quel que soit le monde', () => {
	const expected = '↑/↓ choisir · Entrée: exécuter · Tab: compléter · Échap: annuler';
	assert.equal(hint('tasks', 'input', true), expected);
	assert.equal(hint('notes', 'input', true), expected);
});
```

- [ ] **Step 2 : vérifier l'échec**

Run : `npx node --import tsx --test test/hints.test.ts`
Attendu : FAIL (le 3e argument est ignoré, la valeur retournée est le hint input habituel).

- [ ] **Step 3 : implémenter**

Dans `src/core/hints.ts`, modifier la signature et ajouter le cas en tête :

```ts
export function hint(world: World, mode: Mode, menuOpen = false): string {
	if (menuOpen) {
		return '↑/↓ choisir · Entrée: exécuter · Tab: compléter · Échap: annuler';
	}

	if (mode === 'prnav') return '↑/↓ · o/Entrée: ouvrir · Échap: saisie';
	// … reste inchangé
}
```

Dans `src/components/molecules/hint-bar.tsx` :

```tsx
export default function HintBar({
	world,
	mode,
	menuOpen = false,
}: {
	world: 'tasks' | 'notes';
	mode: 'input' | 'nav' | 'reminder' | 'prnav';
	menuOpen?: boolean;
}) {
	return <Text dimColor>{hint(world, mode, menuOpen)}</Text>;
}
```

- [ ] **Step 4 : vérifier le passage**

Run : `npx node --import tsx --test test/hints.test.ts`
Attendu : PASS.

- [ ] **Step 5 : commit**

```bash
git add src/core/hints.ts src/components/molecules/hint-bar.tsx test/hints.test.ts
git commit -m "feat: hint contextuel du menu de commandes"
```

---

### Task 3 : `onExitDown` sur MultilineInput + InputBar (couche Ink, pas de test unitaire)

`↓` sur la dernière ligne est aujourd'hui avalé (`multiline-input.tsx:66`) : il faut le remonter à l'app, symétrique de `onExitUp`, pour déplacer la sélection du menu. `decodeKey`/`applyEdit` (purs) ne changent pas.

**Files:**
- Modify: `src/components/atoms/multiline-input.tsx`
- Modify: `src/components/molecules/input-bar.tsx`

**Interfaces:**
- Consumes: rien de nouveau.
- Produces: prop optionnelle `onExitDown?: () => void` sur `MultilineInput` ET sur `InputBar` (simple passe-plat). Appelée quand ↓ est pressé avec le curseur sur la dernière ligne ; comportement inchangé si absente.

- [ ] **Step 1 : MultilineInput**

Dans `src/components/atoms/multiline-input.tsx` — ajouter au type `Props` :

```ts
	onExitDown?: () => void;
```

l'ajouter à la destructuration des props (`onExitDown,` après `onExitUp,`), puis remplacer la ligne :

```ts
				if (action.dir === 'down' && atLastLine(value, cursor)) return;
```

par :

```ts
				if (action.dir === 'down' && atLastLine(value, cursor)) {
					onExitDown?.();
					return;
				}
```

- [ ] **Step 2 : InputBar**

Dans `src/components/molecules/input-bar.tsx` — ajouter `onExitDown?: () => void;` au type des props (après `onExitUp`), le destructurer, et le passer à `<MultilineInput … onExitDown={onExitDown} />`.

- [ ] **Step 3 : vérifier lint + tests**

Run : `npm test`
Attendu : PASS (aucun comportement existant ne change — la prop est optionnelle).

- [ ] **Step 4 : commit**

```bash
git add src/components/atoms/multiline-input.tsx src/components/molecules/input-bar.tsx
git commit -m "feat: onExitDown — ↓ en fin de saisie remonté à l'app"
```

---

### Task 4 : molécule `CommandMenu` (affichage pur, aucun clavier)

**Files:**
- Create: `src/components/molecules/command-menu.tsx`

**Interfaces:**
- Consumes: `CommandInfo` de `../../core/commands.ts`, `glyph` de `../../core/theme.ts`.
- Produces: `export default function CommandMenu({matches, selected, accent}: {matches: CommandInfo[]; selected: number; accent: string})`. Ne se rend jamais avec `matches` vide (le parent garde cette garde).

- [ ] **Step 1 : créer le composant**

```tsx
import React from 'react';
import {Box, Text} from 'ink';
import {glyph} from '../../core/theme.ts';
import type {CommandInfo} from '../../core/commands.ts';

// Menu des commandes sous la barre de saisie : affichage pur — la sélection et
// le clavier (↑/↓/Entrée/Tab/Échap) vivent dans app.tsx. Une ligne par commande,
// caret en gouttière sur la sélection, description en dim.
export default function CommandMenu({
	matches,
	selected,
	accent,
}: {
	matches: CommandInfo[];
	selected: number;
	accent: string;
}) {
	const width = Math.max(...matches.map(m => m.name.length));
	return (
		<Box flexDirection="column" marginLeft={2}>
			{matches.map((m, i) => (
				<Box key={m.name}>
					<Text
						bold={i === selected}
						color={i === selected ? accent : undefined}
					>
						{i === selected ? glyph.caret : ' '} /{m.name.padEnd(width)}
					</Text>
					<Text dimColor> {m.description}</Text>
				</Box>
			))}
		</Box>
	);
}
```

- [ ] **Step 2 : vérifier lint + tests**

Run : `npm test`
Attendu : PASS.

- [ ] **Step 3 : commit**

```bash
git add src/components/molecules/command-menu.tsx
git commit -m "feat: molécule CommandMenu (liste + sélection, affichage seul)"
```

---

### Task 5 : câblage dans `app.tsx` — état, routage clavier, budget de lignes

**Files:**
- Modify: `src/app.tsx` (imports ~l.38/62 ; état dérivé avant le calcul `chrome` ~l.384 ; bascule Tab l.435-443 ; `submitInput` l.608 ; `submitNote` l.633 ; `footer` JSX l.733-759 ; `HintBar` l.789)

**Interfaces:**
- Consumes: `matchCommands`/`COMMANDS` (Task 1), `hint`/`HintBar menuOpen` (Task 2), `onExitDown` (Task 3), `CommandMenu` (Task 4), `runCommand(name, args)` existant (l.266).
- Produces: rien (feuille).

- [ ] **Step 1 : imports**

```ts
import {parseCommand, matchCommands} from './core/commands.ts';
import CommandMenu from './components/molecules/command-menu.tsx';
```

- [ ] **Step 2 : état + dérivations du menu**

Près des états de saisie, ajouter :

```ts
const [menuIndex, setMenuIndex] = useState(0);
```

Juste avant le calcul de `footerRows` (~l.384), dériver (l'ordre compte : `chrome` en dépend) :

```ts
// menu de commandes : ouvert seulement en mode saisie, pendant la frappe du nom
const menuMatches =
	mode === 'input' ? matchCommands(world === 'tasks' ? draft : noteDraft) : [];
const menuOpen = menuMatches.length > 0;
const menuSel = Math.min(menuIndex, Math.max(0, menuMatches.length - 1));
```

et compter le menu dans le budget :

```ts
const footerRows =
	mode === 'reminder'
		? 3
		: (world === 'tasks' ? draft : noteDraft).split('\n').length +
		  menuMatches.length;
```

- [ ] **Step 3 : handlers du menu**

Après `runCommand` (ou près des autres handlers), ajouter :

```ts
// la sélection revient en tête à chaque frappe qui modifie le texte
const changeDraft = (v: string) => {
	setDraft(v);
	setMenuIndex(0);
};

const changeNoteDraft = (v: string) => {
	setNoteDraft(v);
	setMenuIndex(0);
};

const menuUp = () => setMenuIndex(Math.max(0, menuSel - 1));
const menuDown = () =>
	setMenuIndex(Math.min(menuMatches.length - 1, menuSel + 1));

// Tab : complète le nom sélectionné dans la saisie (espace final → place aux args)
const completeCommand = () => {
	const sel = menuMatches[menuSel];
	if (!sel) return;
	const next = '/' + sel.name + ' ';
	if (world === 'tasks') setDraft(next);
	else setNoteDraft(next);
};

// Échap : vide le brouillon, ce qui ferme le menu
const clearMenuDraft = () => {
	if (world === 'tasks') setDraft('');
	else setNoteDraft('');
};
```

- [ ] **Step 4 : Tab complète au lieu de basculer de monde**

Modifier la bascule Tab (l.435-443) :

```ts
useInput(
	(input, key) => {
		if (key.tab || input === '[9u') {
			if (menuOpen) {
				completeCommand();
				return;
			}

			setWorld(w => (w === 'tasks' ? 'notes' : 'tasks'));
			setMode('input');
		}
	},
	{isActive: !blocked && mode !== 'reminder'},
);
```

- [ ] **Step 5 : Entrée exécute la sélection**

En tête de `submitInput` (l.608) ET de `submitNote` (l.633), avant l'appel à `parseCommand` (qui reste : c'est le chemin des commandes soumises avec args, ex. `/azure org proj`) :

```ts
	if (menuOpen) {
		runCommand(menuMatches[menuSel]!.name, []);
		setDraft(''); // setNoteDraft('') dans submitNote
		return;
	}
```

- [ ] **Step 6 : footer + hints**

Remplacer les deux `<InputBar …>` du `footer` (l.733-759) par une colonne InputBar + menu :

```tsx
const menuNode = menuOpen ? (
	<CommandMenu
		matches={menuMatches}
		selected={menuSel}
		accent={worldColor(world)}
	/>
) : null;

const footer =
	world === 'tasks' && mode === 'reminder' ? (
		<ReminderStepper reminderValue={reminderValue} today={today} />
	) : world === 'tasks' ? (
		<Box flexDirection="column">
			<InputBar
				world="tasks"
				editing={Boolean(editingId)}
				value={draft}
				focus={mode === 'input'}
				placeholder="capturer une tâche / un feedback…"
				onChange={changeDraft}
				onSubmit={submitInput}
				onCancel={menuOpen ? clearMenuDraft : undefined}
				onExitUp={menuOpen ? menuUp : exitToTaskNav}
				onExitDown={menuOpen ? menuDown : undefined}
			/>
			{menuNode}
		</Box>
	) : (
		<Box flexDirection="column">
			<InputBar
				world="notes"
				editing={Boolean(editingNoteId)}
				value={noteDraft}
				focus={mode === 'input'}
				placeholder="capturer une note…"
				onChange={changeNoteDraft}
				onSubmit={submitNote}
				onCancel={menuOpen ? clearMenuDraft : cancelNote}
				onExitUp={menuOpen ? menuUp : exitToNoteNav}
				onExitDown={menuOpen ? menuDown : undefined}
			/>
			{menuNode}
		</Box>
	);
```

(`Box` est déjà importé d'ink dans `app.tsx` — vérifier, sinon l'ajouter.)

Et la barre de hints (l.789) :

```tsx
hints={<HintBar world={world} mode={mode} menuOpen={menuOpen} />}
```

- [ ] **Step 7 : vérifier lint + tests**

Run : `npm test`
Attendu : PASS (prettier + xo + node:test).

- [ ] **Step 8 : commit**

```bash
git add src/app.tsx
git commit -m "feat: menu de commandes navigable sur / en début de saisie"
```

---

### Task 6 : vérification manuelle de bout en bout

Pas de test `ink-testing-library` (standards §9) : la logique est couverte par les tests purs ; on vérifie le câblage à la main.

- [ ] **Step 1 : dérouler le scénario dans un vrai terminal**

Run : `npm start`

Vérifier, monde tâches puis monde notes (Tab pour basculer AVANT de taper `/`) :

1. Taper `/` → menu de 4 commandes sous la barre, `gauth` sélectionné, hint `↑/↓ choisir · Entrée: exécuter · Tab: compléter · Échap: annuler`.
2. `↓` `↓` → sélection sur `azure` ; `↓` répété → clampé sur `prs` (pas de wrap) ; `↑` → remonte.
3. Taper `g` (draft `/g`) → menu filtré à `gauth`, sélection revenue en tête.
4. Échap → saisie vidée, menu fermé, hints habituels.
5. Taper `/az` puis Tab → draft devient `/azure ` (menu fermé, curseur en fin), taper des args et Entrée → la config Azure se lance avec les args (chemin `parseCommand` intact).
6. Taper `/prs` puis Entrée → exécution immédiate, saisie vidée.
7. Taper `/etc/hosts` → aucun menu à partir de `/e`… vérifier surtout qu'Entrée l'ajoute comme contenu normal, que `↑` sort vers la nav et que Tab bascule de monde.
8. Terminal réduit (< ~15 lignes) avec plusieurs tâches : ouvrir le menu → la liste au-dessus se réduit, rien ne déborde/scrolle.

- [ ] **Step 2 : suite complète**

Run : `npm test`
Attendu : PASS.

- [ ] **Step 3 : commit final éventuel**

Si des retouches sont sorties de la vérification manuelle, les committer en `fix:` dédiés.
