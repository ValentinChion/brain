# Plan — Saisie de rappel par « stepper »

> **Contexte :** la v1 saisit la date de rappel dans un champ texte (`AAAA-MM-JJ`,
> `demain`, `aujourd'hui`). Taper une date est pénible. On remplace ce champ par un
> **stepper** : `r` ouvre un curseur de date qu'on déplace aux flèches, sans jamais
> taper. Décidé en session `design-with-me` (2026-07-03).

**But :** rendre la pose d'un rappel instantanée et sans frappe, pour un usage
« futur proche » où l'on raisonne en décalages (demain, dans 3 j, la semaine pro).

## Design retenu

```
⏰ rappel
   ◀ 2026-07-05 ▶
   ←/→ ±1 j · ↑/↓ ±1 sem · ⌫ retirer · ↵ ok · esc annuler
```

| Décision | Résolution |
|----------|-----------|
| Interaction | Stepper — que des flèches, aucune saisie |
| Affichage | **Date seule** (`AAAA-MM-JJ`) — pas d'offset ni de jour de semaine (aucun formateur requis) |
| Clavier | `←/→` ±1 jour · `↑/↓` ±1 semaine (`↑` = plus tard) · rien d'autre |
| Plancher | **Aujourd'hui** — impossible de descendre dans le passé (ni `←` ni `↓`) |
| Effacer | `⌫` (retour arrière) retire le rappel |
| Valider / annuler | `↵` valide · `esc` annule |
| Amorçage | `r` démarre sur le `remindOn` existant de la ligne, sinon aujourd'hui |

**Conséquence :** plus personne ne tape de date → `parseReminder` (et ses raccourcis
texte) devient **du code mort**. On le supprime. `todayYMD` / `addDays` restent (le
stepper s'en sert).

---

## Task 1 : Logique pure du pas (`src/date.ts`)

**Files:**
- Edit: `src/date.ts` (ajouter `stepReminder`, retirer `parseReminder`)
- Edit: `test/date.test.ts` (ajouter les tests de `stepReminder`, retirer ceux de `parseReminder`)

**Interfaces:**
- Produit : `stepReminder(current: string | null, unit: 'day' | 'week', dir: -1 | 1, todayYmd: string): string`
  — renvoie la date après un pas, **bornée à `todayYmd`** (jamais dans le passé).
  `current` null (ligne sans rappel) démarre à `todayYmd`.

- [ ] **Step 1 : Écrire les tests (et retirer ceux de `parseReminder`)**

Dans `test/date.test.ts` : supprimer les deux `test(...)` qui portent sur
`parseReminder` (raccourcis + rejet de format) et son import. Ajouter :

```ts
import {todayYMD, addDays, stepReminder} from '../src/date.ts';

test('stepReminder avance/recule d\'un jour et d\'une semaine', () => {
	assert.equal(stepReminder('2026-07-05', 'day', 1, '2026-07-01'), '2026-07-06');
	assert.equal(stepReminder('2026-07-05', 'day', -1, '2026-07-01'), '2026-07-04');
	assert.equal(stepReminder('2026-07-05', 'week', 1, '2026-07-01'), '2026-07-12');
	assert.equal(stepReminder('2026-07-12', 'week', -1, '2026-07-01'), '2026-07-05');
});

test('stepReminder ne descend jamais sous aujourd\'hui (plancher)', () => {
	assert.equal(stepReminder('2026-07-02', 'day', -1, '2026-07-02'), '2026-07-02');
	assert.equal(stepReminder('2026-07-04', 'week', -1, '2026-07-02'), '2026-07-02');
});

test('stepReminder démarre à aujourd\'hui quand current est null', () => {
	assert.equal(stepReminder(null, 'day', 1, '2026-07-02'), '2026-07-03');
	assert.equal(stepReminder(null, 'day', -1, '2026-07-02'), '2026-07-02'); // planché
});
```

- [ ] **Step 2 : Lancer les tests → échec attendu** (`stepReminder` absent).

Run: `npm test`

- [ ] **Step 3 : Implémenter dans `src/date.ts`**

Supprimer entièrement `parseReminder` **et** son helper privé `isRealDate`
(plus aucun appelant). Ajouter :

```ts
export function stepReminder(
	current: string | null,
	unit: 'day' | 'week',
	dir: -1 | 1,
	todayYmd: string,
): string {
	const base = current ?? todayYmd;
	const next = addDays(base, (unit === 'week' ? 7 : 1) * dir);
	// plancher : un rappel dans le passé n'a pas de sens (il serait « dû » tout de suite)
	return next < todayYmd ? todayYmd : next;
}
```

- [ ] **Step 4 : `npm test` → vert.** (Formater d'abord : `npx prettier --write src/date.ts test/date.test.ts`.)

- [ ] **Step 5 : Commit**

```bash
git add src/date.ts test/date.test.ts
git commit -m "feat: stepReminder (date step w/ today floor), drop text parseReminder"
```

---

## Task 2 : Mode `reminder` = stepper dans `src/app.tsx`

**Files:**
- Edit: `src/app.tsx`

Pas de test unitaire (couche Ink, cf. `standards/ink.md` §9) — validé manuellement
au Step 4. Toute la logique du pas est déjà testée en Task 1.

- [ ] **Step 1 : États & imports**

Dans les imports, remplacer `parseReminder` par `stepReminder` :

```ts
import {todayYMD} from './date.ts';
import {buildView, isDue, windowView} from './view.ts';
import {stepReminder} from './date.ts';
```

(ou regrouper : `import {todayYMD, stepReminder} from './date.ts';`)

Remplacer les états de saisie de rappel :

```ts
// retirer : reminderDraft, reminderError
const [reminderValue, setReminderValue] = useState<string | null>(null);
```

- [ ] **Step 2 : Ouverture du mode + gestion clavier**

Dans le handler `nav`, la branche `r` amorce le stepper sur la date existante :

```ts
} else if (input === 'r') {
	setReminderValue(target.remindOn ?? today);
	setMode('reminder');
}
```

Remplacer **toute** la branche `if (mode === 'reminder')` du `useInput` par un
stepper (plus de `TextInput`, donc `useInput` reçoit toutes les touches) :

```ts
if (mode === 'reminder') {
	const target = visible[clampedSel];
	if (!target || key.escape) {
		setMode('nav');
		return;
	}

	if (key.return) {
		commit(setReminder(items, target.id, reminderValue));
		setMode('nav');
	} else if (key.backspace || key.delete) {
		commit(setReminder(items, target.id, null)); // ⌫ = retirer le rappel
		setMode('nav');
	} else if (key.rightArrow) {
		setReminderValue((v) => stepReminder(v, 'day', 1, today));
	} else if (key.leftArrow) {
		setReminderValue((v) => stepReminder(v, 'day', -1, today));
	} else if (key.upArrow) {
		setReminderValue((v) => stepReminder(v, 'week', 1, today));
	} else if (key.downArrow) {
		setReminderValue((v) => stepReminder(v, 'week', -1, today));
	}

	return;
}
```

- [ ] **Step 3 : Rendu du mode `reminder`**

Remplacer le bloc JSX `mode === 'reminder' ? (…)` (le champ texte + erreur) par
l'affichage du stepper. Supprimer aussi `submitReminder` (plus appelé) :

```tsx
{mode === 'reminder' ? (
	<Box flexDirection="column">
		<Text color="cyan">⏰ rappel</Text>
		<Text>
			◀ {reminderValue ?? today} ▶
		</Text>
		<Text dimColor>←/→ ±1 j · ↑/↓ ±1 sem · ⌫ retirer · ↵ ok · esc annuler</Text>
	</Box>
) : (
	// …barre de saisie inchangée…
)}
```

> Le `TextInput` principal garde `focus={mode === 'input'}` : en mode `reminder`
> il ne capte donc rien, et le `useInput` du stepper a la main sur toutes les flèches.

- [ ] **Step 4 : Test manuel** — `npm start`, puis :
  1. `↑` pour naviguer, sélectionner une ligne, `r` → le stepper s'ouvre sur
     `remindOn` (ou aujourd'hui).
  2. `→` ×3 → la date avance de 3 jours ; `↑` → +1 semaine.
  3. `←`/`↓` jusqu'au plancher → la date **ne descend pas** sous aujourd'hui.
  4. `↵` → la ligne affiche `⏰ <date>` et remonte sous « Ressort aujourd'hui » si
     due ; retour en `nav`.
  5. `r` de nouveau puis `⌫` → le rappel disparaît de la ligne.
  6. `r` puis `esc` → aucun changement, retour en `nav`.

- [ ] **Step 5 : `npm test` (prettier + xo + node) vert, puis commit**

```bash
git add src/app.tsx
git commit -m "feat: reminder date stepper (arrow-driven, today floor, no typing)"
```

---

## Task 3 : Mettre à jour la doc

**Files:**
- Edit: `readme.md`
- Edit: `docs/plans/2026-07-02-brain-design/2026-07-02-brain-design.md` (§ saisie du rappel)

- [ ] **Step 1 : `readme.md`** — remplacer la ligne « Rappel : `AAAA-MM-JJ`, `demain`… »
  par la description du stepper :

  > - Rappel (`r`) : `←/→` ±1 jour · `↑/↓` ±1 semaine · `⌫` retirer · `↵` valider · `esc` annuler. Plancher : aujourd'hui.

- [ ] **Step 2 : design doc** — noter que la saisie texte de la date est remplacée
  par un stepper flèches (renvoyer à ce plan). Ne pas réécrire l'historique du reste.

- [ ] **Step 3 : Commit**

```bash
git add readme.md docs/
git commit -m "docs: reminder stepper keys"
```

---

## Self-Review

- Saisie sans frappe (futur proche, décalages) → Task 2 (stepper flèches). ✅
- Affichage date seule, pas de formateur → Task 2 (`{reminderValue}`). ✅
- Plancher aujourd'hui (ni `←` ni `↓` dans le passé) → Task 1 (`stepReminder`). ✅
- `⌫` efface le rappel → Task 2 (`setReminder(..., null)`). ✅
- Amorçage sur le `remindOn` existant → Task 2 (branche `r`). ✅
- `parseReminder` devient mort → supprimé (Task 1), plus d'import (Task 2). ✅
- Logique testée / Ink non testé → Task 1 (`node:test`), Task 2 (manuel). ✅
- Pas de nouvelle dépendance ; `addDays`/`todayYMD` réutilisés. ✅
