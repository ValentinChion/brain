# `brain` — Plan d'implémentation : notes rapides

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec :** [`2026-07-03-brain-notes-design.md`](./2026-07-03-brain-notes-design.md). À lire d'abord.

**Goal :** Ajouter un « monde » **notes** au panneau `brain` v1, sans toucher au comportement tâches. `Tab` bascule tâches ⇄ notes (liste + barre). Les notes se gardent (épingle), se périment (non épinglée + >7j) et se nettoient via un unique balayage groupé au démarrage.

**Architecture :** On respecte la règle d'or de `standards/ink.md` : toute la logique (opérations notes, tri, péremption, persistance) vit dans des modules **purs et testés** (`src/notes.ts`, `src/storage.ts`) ; `app.tsx` ne fait qu'afficher et câbler le clavier. **Deux types / deux fichiers** : `Note` ≠ `Item`, `notes.json` ≠ `tasks.json`. Aucun code tâche existant n'est modifié dans sa logique.

**Tech Stack :** identique à la v1 (Node ≥ 20, TS, Ink 5, `ink-text-input`, `tsx`, `node:test`). Pas de nouvelle dépendance.

## Global Constraints

- **Ne rien casser de la v1.** Les tests existants (`date`, `view`, `items`, `storage`, `smoke`) doivent rester verts à chaque task. Le monde tâches est inchangé fonctionnellement.
- **Deux types, deux fichiers** : `Note` (id, text, createdAt, pinned) dans `notes.json`. Pas de champ `kind` sur `Item`.
- **`storage.ts` généralisé** : la logique atomique (temp + rename) et anti-corruption est factorisée pour servir `tasks.json` **et** `notes.json`. Les fonctions tâches `load()`/`save()` gardent leur signature v1 (app.tsx ne change pas d'import pour les tâches).
- **Péremption dérivée**, jamais stockée : `isStale = !pinned && date(createdAt) < today − 7j`. Épinglée = jamais périmée.
- **Suppression réelle** au balayage (retrait du fichier). Pas d'archive/undo (YAGNI). Le prompt de démarrage est le filet.
- **Multi-ligne = amélioration dépendante du terminal**, isolée dans une task-spike (Task 3) qui **vérifie avant de construire**. Repli mono-ligne si le protocole kitty n'arrive pas. Ne bloque pas les notes mono-ligne (Tasks 1–2, 4).
- **Gates inchangées** : `npm test` = `prettier --check .` **puis** `xo` **puis** `node --import tsx --test test/*.test.ts`. Les trois passent à chaque task. Si `xo` bloque un pattern légitime, relâcher la règle précise dans `package.json` plutôt que tordre le code — le noter.
- **Une seule instance** (inchangé) : last-writer-wins sur les deux fichiers.

---

## File Structure

Ajouts / modifications par rapport à la v1 :

- `src/types.ts` — **+** le type `Note` (à côté de `Item`).
- `src/storage.ts` — **refactor** : cœur atomique générique + `load`/`save` (tâches, inchangés côté appelant) + `loadNotes`/`saveNotes`.
- `src/notes.ts` — **nouveau, pur** : `addNote`, `editNote`, `removeNote`, `togglePin`, `sortNotes`, `isStale`, `staleNotes`, `sweepStale`.
- `src/MultilineInput.tsx` — **nouveau (conditionnel à Task 3)** : petit champ multi-ligne (`Shift+Entrée`/`Alt+Entrée` = saut de ligne, `Entrée` = valider). Absent si le spike conclut « mono-ligne only ».
- `src/app.tsx` — **modif** : axe `world`, bascule `Tab`, rendu monde NOTES, nav notes (`p`/`e`/`d`), overlay de balayage au démarrage.
- `test/storage.test.ts` — **+** aller-retour `notes.json` + corrompu-non-écrasé.
- `test/notes.test.ts` — **nouveau** : couvre `src/notes.ts`.

`app.tsx` et `MultilineInput.tsx` restent les seuls fichiers non testés unitairement (couche UI) — validés au parcours manuel.

---

## Task 1 : Type `Note` + `storage.ts` généralisé

**Files:**
- Modify: `src/types.ts`
- Modify: `src/storage.ts`
- Modify: `test/storage.test.ts`

**Interfaces:**
- Produces :
  - `Note` = `{ id: string; text: string; createdAt: string; pinned: boolean }`.
  - `loadNotes(): { notes: Note[]; error: string | null }` — mêmes garanties que `load()` (absent → vide ; corrompu → vide + error, **sans écraser**).
  - `saveNotes(notes: Note[]): void` — écriture atomique dans `notes.json`.
  - `load()` / `save()` (tâches) : **signature inchangée**.

- [ ] **Step 1 : Ajouter `Note` à `src/types.ts`**

```ts
export type Note = {
  id: string; // crypto.randomUUID()
  text: string; // peut contenir des "\n"
  createdAt: string; // ISO 8601 — base de la péremption
  pinned: boolean;
};
```

- [ ] **Step 2 : Étendre les tests `test/storage.test.ts`** (avant le refactor)

Ajouter, dans le même style que les tests tâches existants (helper `withDir`, import dynamique avec suffixe aléatoire) :

```ts
import type {Note} from '../src/types.ts';

const note: Note = {
  id: 'n', text: 'kubectl restart', createdAt: '2026-07-01T00:00:00.000Z', pinned: false,
};

test('saveNotes puis loadNotes : aller-retour fidèle, dossier créé', () => {
  withDir(async (dir) => {
    const {saveNotes, loadNotes} = await import('../src/storage.ts?' + Math.random());
    saveNotes([note]);
    assert.ok(existsSync(join(dir, 'notes.json')));
    assert.deepEqual(loadNotes().notes, [note]);
  });
});

test('notes.json corrompu : pas de crash, pas écrasé', () => {
  withDir(async (dir) => {
    const {loadNotes} = await import('../src/storage.ts?' + Math.random());
    const path = join(dir, 'notes.json');
    writeFileSync(path, '{ pas du json');
    const res = loadNotes();
    assert.equal(res.notes.length, 0);
    assert.ok(res.error);
    assert.equal(readFileSync(path, 'utf8'), '{ pas du json');
  });
});
```

- [ ] **Step 3 : Refactor `src/storage.ts`** — factoriser le cœur atomique, garder `load`/`save` tâches, ajouter les notes

```ts
import {homedir} from 'node:os';
import {join} from 'node:path';
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, renameSync,
} from 'node:fs';
import type {Item, Note} from './types.ts';

export function brainDir(): string {
  return process.env.BRAIN_DIR ?? join(homedir(), '.brain');
}

// ponytail: cœur générique — même logique atomique + anti-corruption pour tasks.json et notes.json
function loadArray<T>(file: string): {data: T[]; error: string | null} {
  const path = join(brainDir(), file);
  if (!existsSync(path)) return {data: [], error: null};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('racine non-tableau');
    return {data: parsed as T[], error: null};
  } catch (e) {
    // on ne réécrit pas par-dessus un fichier corrompu, on repart vide en mémoire
    return {data: [], error: `Fichier illisible (${(e as Error).message}) — non modifié.`};
  }
}

function saveArray<T>(file: string, data: T[]): void {
  const dir = brainDir();
  mkdirSync(dir, {recursive: true});
  const tmp = join(dir, `${file}.tmp-${process.pid}`);
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, join(dir, file)); // atomique sur le même volume
}

// tâches — signatures v1 inchangées (app.tsx ne bouge pas pour les tâches)
export function load(): {items: Item[]; error: string | null} {
  const {data, error} = loadArray<Item>('tasks.json');
  return {items: data, error};
}
export function save(items: Item[]): void {
  saveArray('tasks.json', items);
}

// notes
export function loadNotes(): {notes: Note[]; error: string | null} {
  const {data, error} = loadArray<Note>('notes.json');
  return {notes: data, error};
}
export function saveNotes(notes: Note[]): void {
  saveArray('notes.json', notes);
}
```

- [ ] **Step 4 : Lancer les tests** — `npm test`. Attendu : PASS (tâches existants **et** nouveaux notes).

- [ ] **Step 5 : Commit**

```bash
git add src/types.ts src/storage.ts test/storage.test.ts
git commit -m "feat: Note type + generalized atomic storage (notes.json)"
```

---

## Task 2 : Logique pure des notes (`src/notes.ts`)

**Files:**
- Create: `src/notes.ts`
- Test: `test/notes.test.ts`

**Interfaces (toutes pures, renvoient un nouveau tableau, sans muter) :**
- `addNote(notes, text, nowISO): Note[]` — ajoute (non épinglée) en fin.
- `editNote(notes, id, text): Note[]`.
- `removeNote(notes, id): Note[]`.
- `togglePin(notes, id): Note[]`.
- `sortNotes(notes): Note[]` — **épinglées d'abord**, puis **anti-chronologique** (`createdAt` desc) dans chaque groupe.
- `isStale(note, todayYmd): boolean` — `!pinned && date locale de createdAt < today − 7j`.
- `staleNotes(notes, todayYmd): Note[]` — les candidates au balayage (dans l'ordre d'affichage).
- `sweepStale(notes, todayYmd): Note[]` — renvoie les **survivantes** (= supprime les périmées).

- [ ] **Step 1 : Écrire les tests** `test/notes.test.ts`

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Note} from '../src/types.ts';
import {
  addNote, editNote, removeNote, togglePin, sortNotes, isStale, staleNotes, sweepStale,
} from '../src/notes.ts';

const NOW = '2026-07-03T10:00:00.000Z';
const mk = (over: Partial<Note>): Note => ({
  id: over.id ?? 'id', text: over.text ?? 't',
  createdAt: over.createdAt ?? '2026-07-01T00:00:00.000Z', pinned: over.pinned ?? false,
});

test('addNote ajoute en fin, non épinglée, id/createdAt renseignés, sans muter', () => {
  const before = [mk({id: 'a'})];
  const after = addNote(before, 'note', NOW);
  assert.equal(after.length, 2);
  assert.equal(before.length, 1);
  assert.equal(after[1].text, 'note');
  assert.equal(after[1].createdAt, NOW);
  assert.equal(after[1].pinned, false);
  assert.ok(after[1].id && after[1].id !== 'a');
});

test('editNote / removeNote / togglePin ciblent la bonne note', () => {
  const base = [mk({id: 'a', text: 'vieux'})];
  assert.equal(editNote(base, 'a', 'neuf')[0].text, 'neuf');
  assert.equal(removeNote(base, 'a').length, 0);
  assert.equal(togglePin(base, 'a')[0].pinned, true);
  assert.equal(togglePin(togglePin(base, 'a'), 'a')[0].pinned, false);
});

test('sortNotes : épinglées d’abord, puis la plus récente en haut', () => {
  const notes = [
    mk({id: 'a', createdAt: '2026-07-01T00:00:00.000Z'}),
    mk({id: 'b', createdAt: '2026-07-03T00:00:00.000Z'}),
    mk({id: 'c', createdAt: '2026-06-01T00:00:00.000Z', pinned: true}),
    mk({id: 'd', createdAt: '2026-07-02T00:00:00.000Z', pinned: true}),
  ];
  assert.deepEqual(sortNotes(notes).map((n) => n.id), ['d', 'c', 'b', 'a']);
});

test('isStale : non épinglée + >7j = périmée ; épinglée jamais ; récente non', () => {
  // today = 2026-07-15
  assert.equal(isStale(mk({createdAt: '2026-07-06T12:00:00.000Z'}), '2026-07-15'), true);  // 9j
  assert.equal(isStale(mk({createdAt: '2026-07-08T12:00:00.000Z'}), '2026-07-15'), false); // 7j exact → pas encore
  assert.equal(isStale(mk({createdAt: '2026-07-14T12:00:00.000Z'}), '2026-07-15'), false); // récente
  assert.equal(isStale(mk({createdAt: '2026-01-01T12:00:00.000Z', pinned: true}), '2026-07-15'), false); // épinglée
});

test('staleNotes / sweepStale sont cohérents (candidats vs survivants)', () => {
  const notes = [
    mk({id: 'old', createdAt: '2026-06-01T00:00:00.000Z'}),
    mk({id: 'oldPinned', createdAt: '2026-06-01T00:00:00.000Z', pinned: true}),
    mk({id: 'fresh', createdAt: '2026-07-14T00:00:00.000Z'}),
  ];
  assert.deepEqual(staleNotes(notes, '2026-07-15').map((n) => n.id), ['old']);
  assert.deepEqual(sweepStale(notes, '2026-07-15').map((n) => n.id), ['oldPinned', 'fresh']);
});
```

- [ ] **Step 2 : Lancer les tests, vérifier l’échec** — `npm test` → FAIL (`Cannot find module '../src/notes.ts'`).

- [ ] **Step 3 : Implémenter `src/notes.ts`**

```ts
import {randomUUID} from 'node:crypto';
import type {Note} from './types.ts';
import {todayYMD, addDays} from './date.ts';

export function addNote(notes: Note[], text: string, nowISO: string): Note[] {
  return [...notes, {id: randomUUID(), text, createdAt: nowISO, pinned: false}];
}

const patch = (notes: Note[], id: string, fn: (n: Note) => Note): Note[] =>
  notes.map((n) => (n.id === id ? fn(n) : n));

export function editNote(notes: Note[], id: string, text: string): Note[] {
  return patch(notes, id, (n) => ({...n, text}));
}
export function removeNote(notes: Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id);
}
export function togglePin(notes: Note[], id: string): Note[] {
  return patch(notes, id, (n) => ({...n, pinned: !n.pinned}));
}

// épinglées d'abord ; dans chaque groupe, createdAt décroissant (plus récente en haut)
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

// date LOCALE de createdAt (cohérent avec todayYMD v1), strictement avant today − 7j
export function isStale(note: Note, todayYmd: string): boolean {
  if (note.pinned) return false;
  const created = todayYMD(new Date(note.createdAt));
  return created < addDays(todayYmd, -7);
}

export function staleNotes(notes: Note[], todayYmd: string): Note[] {
  return sortNotes(notes).filter((n) => isStale(n, todayYmd));
}
export function sweepStale(notes: Note[], todayYmd: string): Note[] {
  return notes.filter((n) => !isStale(n, todayYmd));
}
```

- [ ] **Step 4 : Lancer les tests** — `npm test` → PASS.

- [ ] **Step 5 : Commit**

```bash
git add src/notes.ts test/notes.test.ts
git commit -m "feat: pure note operations (pin, sort, staleness, sweep)"
```

---

## Task 3 : Spike multi-ligne (Ink 5 + protocole kitty dans Ghostty)

> **Task d'investigation — pas de code produit tant que la question n'est pas tranchée.** Objectif : savoir si `Shift+Entrée` arrive comme une touche **distincte** de `Entrée` dans `useInput`, dans **Ghostty**, et ce qu'il faut faire pour. Cf. le bloc ⚠️ de la spec : 3 pièces, une seule gratuite (Ghostty sait encoder ; le protocole kitty est **opt-in** ; il faut décoder + un buffer multi-ligne — `ink-text-input` est mono-ligne).

- [ ] **Step 1 : Sonde `useInput`** — petit script jetable (hors `src/`, ex. `scratch/probe.tsx`) qui `render` un composant loggant `JSON.stringify({input, key})` à chaque touche. Lancer dans **Ghostty**, presser `Entrée`, `Shift+Entrée`, `Alt+Entrée`. Noter ce qui arrive pour chacun.

- [ ] **Step 2 : Trancher, selon l'observation**
  - **Cas A — `Shift+Entrée` distinct out-of-the-box** (Ink active/décode kitty seul) : la pièce #2 est faite. → touche primaire = `Shift+Entrée`.
  - **Cas B — indistinct par défaut, mais activable** : émettre la séquence d'activation kitty au montage (et la désactiver au démontage). Revérifier. Si OK → `Shift+Entrée`.
  - **Cas C — trop pénible / fragile** : **`Alt+Entrée`** comme mécanisme primaire (arrive comme `ESC`+`CR`, distinct **sans** protocole — l'approche Claude Code), `Shift+Entrée` en bonus si dispo.
  - **Cas D — rien de propre** : **mono-ligne only** pour la v1 notes. Documenter l'échappatoire (éditer `notes.json` / `$EDITOR` plus tard). Task 4 construit alors un champ mono-ligne (réutilise `ink-text-input`), et on s'arrête là.

- [ ] **Step 3 : Consigner la décision** dans la spec (section multi-ligne) : cas retenu, touche primaire, faut-il activer le protocole, repli. Une ou deux phrases — c'est ce qui pilote Task 4.

- [ ] **Step 4 : Nettoyer** le script de sonde (ne pas le committer, ou le mettre sous `scratch/` déjà `prettier-ignore`).

> Pas de commit de code ici (investigation). Le livrable est **la décision écrite** + éventuellement le geste d'activation du protocole validé pour Task 4.

---

## Task 4 : Champ multi-ligne (`src/MultilineInput.tsx`)

> **Conditionnelle au résultat de Task 3.** Si Task 3 = **Cas D (mono-ligne only)** : sauter la création du composant, utiliser `ink-text-input` tel quel dans Task 5, et cocher cette task comme « sans objet — mono-ligne ». Sinon, construire le petit champ ci-dessous.

**Files:**
- Create: `src/MultilineInput.tsx`

**Interfaces:**
- `<MultilineInput value onChange onSubmit focus placeholder />` — API compatible avec l'usage de `ink-text-input` dans `app.tsx`, mais : la touche « saut de ligne » retenue en Task 3 insère un `\n` dans `value` ; `Entrée` appelle `onSubmit`.

- [ ] **Step 1 : Implémenter** un champ minimal : un `useInput` (actif via `focus`) qui gère caractères imprimables, `backspace`, la touche saut-de-ligne (→ insère `\n`), `Entrée` (→ `onSubmit`). Rendu = `value` avec ses `\n` (Ink `<Text>` gère le retour à la ligne). Curseur simple en fin de ligne acceptable pour la v1 (pas de navigation multi-ligne au curseur — YAGNI, `// ponytail:` si besoin).

- [ ] **Step 2 : Vérif manuelle isolée** (mini `render`) : taper 2 lignes avec la touche de Task 3, `Entrée` → `onSubmit` reçoit le texte avec `\n`. Repli : dans un terminal non-kitty, `Shift+Entrée`/`Alt+Entrée` non distinct = simple validation, pas de crash.

- [ ] **Step 3 : Commit**

```bash
git add src/MultilineInput.tsx
git commit -m "feat: minimal multi-line input for notes (Task 3 decision)"
```

---

## Task 5 : Intégration Ink — monde NOTES + bascule `Tab` + balayage démarrage

**Files:**
- Modify: `src/app.tsx`

**Interfaces:**
- Consumes : `Note` (T1), `loadNotes`/`saveNotes` (T1), `addNote`/`editNote`/`removeNote`/`togglePin`/`sortNotes`/`staleNotes`/`sweepStale` (T2), `MultilineInput` **ou** `ink-text-input` selon T3/T4, `windowView` (v1, réutilisé pour le scroll notes).
- Produces : le monde NOTES navigable + la bascule `Tab` + l'overlay de balayage au démarrage. **Seule task non testée unitairement** (UI) — validée manuellement au Step 4.

**État à ajouter** (au-dessus de l'existant) :
- `world: 'tasks' | 'notes'` (défaut `'tasks'`).
- `notes: Note[]` + `notesError` (via `loadNotes()`), `commitNotes` (setState + `saveNotes`).
- `noteSelected`, `noteDraft`, `editingNoteId` (miroir des équivalents tâches, pour le monde notes).
- `sweeping: boolean` + `sweepMode: 'bulk' | 'review'` — overlay de démarrage, activé si `staleNotes(...)` non vide au montage.
- `mode` (`'input' | 'nav' | 'reminder'`) reste **par monde** ; `reminder` n'existe qu'en monde tâches.

- [ ] **Step 1 : Bascule `Tab` + rendu par monde**
  - Dans le `useInput`, tout en haut (avant le dispatch de mode) : `if (key.tab) { setWorld(w => w === 'tasks' ? 'notes' : 'tasks'); return; }`. `Tab` **collant** (l'état `world` persiste). Vérifier que `ink-text-input`/`MultilineInput` ne capture pas `Tab` (sinon gérer via `useInput` prioritaire).
  - Le rendu choisit la liste selon `world` : tâches (v1, inchangé) **ou** notes (`sortNotes(notes)` → `windowView` → slice, mêmes `▲/▼`).
  - La barre du bas affiche le type courant : `[TÂCHE]` / `[NOTE]`, et sa hint clavier suit le monde.

- [ ] **Step 2 : Monde NOTES — capture + nav**
  - **Capture** (`mode === 'input'`, `world === 'notes'`) : `Entrée` → `addNote(notes, text, nowISO())` (ou `editNote` si `editingNoteId`). `↑` → nav (draft conservé), comme la v1.
  - **Nav notes** (`mode === 'nav'`, `world === 'notes'`) : `↑`/`↓` déplacent ; `p` → `togglePin` ; `e` → pré-remplit la barre + `mode='input'` (multi-ligne si Task 4) ; `d` → `removeNote` ; `Échap`/`↓` en bas → retour barre. **Pas** de `Espace`, **pas** de `r`.
  - **Affichage d'une note** : sélectionnée → **corps complet** (avec ses `\n`) ; sinon **première ligne** + `↵ +N` si plusieurs lignes. Épinglée → préfixe `📌`.

- [ ] **Step 3 : Overlay de balayage au démarrage**
  - Au montage : `const stale = staleNotes(notes, today)`. Si non vide → `sweeping = true`.
  - Rendu overlay (prioritaire sur tout le reste) : liste des `stale` + `[d] tout supprimer  [k] tout garder  [r] passer en revue`.
  - `useInput` dédié (`isActive: sweeping`) : `d` → `commitNotes(sweepStale(notes, today))` puis `sweeping=false` ; `k` → `sweeping=false` (rien) ; `r` → `sweepMode='review'` : parcours une-par-une (`k` garder / `d` supprimer / `p` épingler → passe à la suivante ; fin → `sweeping=false`).
  - Après fermeture de l'overlay → monde tâches, mode input (démarrage normal v1).

- [ ] **Step 4 : Test manuel** — `npm start`, dans **Ghostty** :
  1. Défaut `[TÂCHE]` : capture d'une tâche marche comme avant (non-régression).
  2. `Tab` → `[NOTE]`, la liste bascule sur les notes. Taper `kubectl restart` + `Entrée` → note ajoutée. Enchaîner une 2ᵉ note (Tab collant : on reste en NOTE).
  3. `↑` → nav notes ; `p` sur une note → `📌` + remonte en tête ; `e` → édition pré-remplie ; `d` → supprime ; `Échap` → barre.
  4. (Si Task 4) note multi-ligne via la touche de Task 3 → le corps s'affiche entier quand sélectionnée, 1ʳᵉ ligne + `↵ +N` sinon.
  5. `Tab` → retour `[TÂCHE]`, les tâches sont intactes.
  6. Fabriquer une note périmée (éditer `~/.brain/notes.json` : `createdAt` il y a >7j, `pinned:false`), relancer → overlay de balayage ; tester `d`, `k`, `r`.
  7. Épingler une vieille note → elle **ne** réapparaît **pas** au balayage suivant.

- [ ] **Step 5 : Commit**

```bash
git add src/app.tsx
git commit -m "feat: notes world (Tab switch, pin/edit/delete, startup sweep)"
```

---

## Task 6 : Docs — README + CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1 : README** — ajouter une section « Notes » : `Tab` bascule tâches ⇄ notes ; capture identique ; nav notes `p`/`e`/`d` ; multi-ligne (selon décision Task 3) ; cycle de vie (épingle = garde, >1 semaine non épinglée = candidate, balayage groupé au démarrage) ; fichier `~/.brain/notes.json` éditable à la main.

- [ ] **Step 2 : CLAUDE.md** — mettre à jour « What this is » (panneau tâches **+ notes**) et la liste des modules (`notes.ts`, `MultilineInput.tsx` si créé, `storage.ts` généralisé). Garder la règle d'architecture et le renvoi à `standards/ink.md`.

- [ ] **Step 3 : Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: notes world in README + CLAUDE.md"
```

---

## Self-Review

**Couverture de la spec :**
- Deux mondes, un panneau, `Tab` bascule liste + barre → Task 5 (Step 1). ✅
- Capture notes (mono-ligne mini) + nav `p`/`e`/`d` → Task 5 (Step 2) + Task 2 (ops). ✅
- Multi-ligne `Shift+Entrée` (dépendant terminal, vérifié avant construit) → Task 3 (spike) + Task 4 (champ). ✅
- Épingle (jamais périmée, remonte en tête) → Task 2 (`togglePin`, `sortNotes`, `isStale`). ✅
- Péremption dérivée >7j non épinglée → Task 2 (`isStale`/`staleNotes`). ✅
- Balayage au démarrage, groupé `[d]/[k]/[r]`, suppression réelle → Task 5 (Step 3) + Task 2 (`sweepStale`). ✅
- Affichage : épinglées en tête, anti-chrono ; sélectionnée = corps complet, sinon 1ʳᵉ ligne + `↵ +N` → Task 5 (Step 2). ✅
- Deux types / deux fichiers, storage atomique généralisé, corrompu non écrasé → Task 1. ✅
- Non-régression tâches (logique inchangée, tests v1 verts) → contrainte globale + Task 5 Step 4.1. ✅
- Réunions hors périmètre → absent du plan. ✅

**Cohérence des types/signatures :** `Note`, `loadNotes`/`saveNotes`, `addNote`/`editNote`/`removeNote`/`togglePin`/`sortNotes`/`isStale`/`staleNotes`/`sweepStale` — noms/signatures identiques entre définition (Tasks 1–2) et usage (Task 5). Réutilise `windowView`, `todayYMD`, `addDays` de la v1 sans les modifier. ✅

**Risque isolé :** tout le flou (kitty/Ghostty/Ink) est confiné à Task 3, qui **décide avant de construire** et dégrade proprement en mono-ligne. Les notes (Tasks 1–2, 5 hors multi-ligne) n'en dépendent pas. ✅

**Points décidés en votre absence (cf. spec) :** deux fichiers vs `kind`, suppression réelle, tri, affichage sélection, touches notes, `Tab` collant — listés dans la spec, à valider. Le plan les suppose ; les vetoer = ajuster Task 1 (modèle) ou Task 5 (UI), pas les autres.
