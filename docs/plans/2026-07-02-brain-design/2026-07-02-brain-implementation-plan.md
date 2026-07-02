# `brain` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un panneau todo TUI (`brain`) qui reste ouvert en permanence dans un split Ghostty : capture sans friction via une barre de saisie toujours focus, rappel par présence permanente + surlignage de ce qui « ressort » aujourd'hui.

**Architecture:** Une app Ink (React pour le terminal). Toute la logique métier (dates, tri d'affichage, opérations sur les items, persistance) vit dans des modules purs et testés ; le composant Ink ne fait que l'affichage et le câblage clavier. Persistance dans un unique fichier JSON local avec écriture atomique.

**Tech Stack:** Node.js (≥ 20), TypeScript, Ink 5 (+ React 18), `ink-text-input` pour la barre de saisie, `tsx` pour exécuter TS sans build, `node:test` + `node:assert` pour les tests (pas de framework externe).

## Global Constraints

- Runtime cible : **macOS**, Node ≥ 20 (pour `crypto.randomUUID` et le test runner stable).
- Nom de la commande : **`brain`**.
- Stockage : **`~/.brain/tasks.json`** (surchargeable par la variable d'env `BRAIN_DIR` — utilisé par les tests). Aucun serveur, compte ou cloud.
- Modèle : une tâche et un feedback sont **le même objet** (une ligne, avec éventuellement une date de rappel). Pas deux listes.
- Les items faits **disparaissent de la vue** mais restent dans le fichier (`done` + `doneAt`) pour d'éventuelles stats.
- Écriture fichier **atomique** (temp + rename). Un fichier corrompu ne doit **jamais** être écrasé automatiquement.
- Dates de rappel stockées au format **`AAAA-MM-JJ`**. Raccourcis acceptés en v1 : `aujourd'hui`, `demain` (les noms de jours sont hors périmètre v1).
- Tests : self-checks sur la logique non triviale uniquement (dates, tri d'affichage, opérations items, persistance). La couche Ink n'est pas testée automatiquement.
- **Stack & gates** : code en `src/` (pas `source/`), exécuté par `tsx` (pas de build). `npm test` = `prettier --check .` **puis** `xo` **puis** `node --import tsx --test test/*.test.ts` — les trois doivent passer à chaque task. Ink 5 + `ink-text-input`.
- **Une seule instance** : `brain` n'est pas prévu pour tourner dans deux splits simultanés (last-writer-wins sur le fichier). Pas de lock — juste documenté dans le README.
- **Affichage dynamique** : la section « dus » est triée par date de rappel croissante (plus en retard en tête) ; la vue scrolle si elle dépasse la hauteur du terminal (barre de saisie toujours collée en bas). `today` est recalculé à chaque render (donc à chaque frappe) — pas de timer de rafraîchissement (le panneau est touché en continu).
- Hors périmètre v1 : notif macOS, commande quick-add séparée, projets/tags/priorités, sync, Slack.

---

## File Structure

- `package.json` — deps, scripts (`start`, `test`).
- `tsconfig.json` — config TS pour tsx/Ink (JSX react).
- `src/types.ts` — le type `Item`.
- `src/date.ts` — `todayYMD`, `addDays`, `parseReminder` (logique de dates, pure).
- `src/view.ts` — `isDue`, `buildView` (tri/filtrage d'affichage, pur).
- `src/items.ts` — `addItem`, `editText`, `setDone`, `setReminder`, `removeItem` (opérations pures sur `Item[]`).
- `src/storage.ts` — `brainDir`, `load`, `save` (persistance atomique).
- `src/app.tsx` — le composant Ink (affichage + clavier + câblage vers les modules purs).
- `src/cli.tsx` — point d'entrée : monte `<App/>` dans Ink.
- `test/date.test.ts`, `test/view.test.ts`, `test/items.test.ts`, `test/storage.test.ts`.

Découpage par responsabilité : chaque module pur a une seule raison de changer et se teste sans Ink. `app.tsx` est le seul fichier non testé unitairement.

---

## Task 1: Scaffold du projet

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/types.ts`
- Create: `test/smoke.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: le type `Item` et une chaîne de build/test fonctionnelle (`npm test`, `npm start`).

```ts
// src/types.ts
export type Item = {
  id: string;              // crypto.randomUUID()
  text: string;
  createdAt: string;       // ISO 8601
  remindOn: string | null; // "AAAA-MM-JJ" ou null
  done: boolean;
  doneAt: string | null;   // ISO 8601, quand cochée
};
```

- [ ] **Step 1: Créer `package.json`**

> Décision d'exécution : le repo contient déjà un scaffold `create-ink-app` (Ink 4, `source/`, `ava`/`xo`/`prettier`, build `tsc`). On adopte la stack du plan (tsx + `node:test` + `src/` + Ink 5) **mais on conserve `prettier` + `xo`** comme garde-fous format/lint dans `npm test`. `npm test` doit donc passer les trois : prettier, xo, puis les tests node.

```json
{
  "name": "brain",
  "version": "0.1.0",
  "license": "MIT",
  "type": "module",
  "bin": { "brain": "src/cli.tsx" },
  "engines": { "node": ">=20" },
  "scripts": {
    "start": "tsx src/cli.tsx",
    "test": "prettier --check . && xo && node --import tsx --test test/*.test.ts"
  },
  "dependencies": {
    "ink": "^5.0.1",
    "ink-text-input": "^6.0.0",
    "react": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@vdemedes/prettier-config": "^2.0.1",
    "eslint-config-xo-react": "^0.27.0",
    "eslint-plugin-react": "^7.32.2",
    "eslint-plugin-react-hooks": "^4.6.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "xo": "^0.53.1"
  },
  "xo": {
    "extends": "xo-react",
    "prettier": true,
    "rules": {
      "react/prop-types": "off"
    }
  },
  "prettier": "@vdemedes/prettier-config"
}
```

> `xo` reprend la config `xo-react` du scaffold existant (réutilise le lockfile). Si `xo` bloque un pattern légitime du plan (ex. import avec extension `.ts`, nommage de `catch`), **relâcher la règle précise dans le bloc `xo.rules`** plutôt que tordre le code — le noter dans le rapport. Ne pas ajouter de règles préventivement.

- [ ] **Step 2: Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Créer `src/types.ts`** avec le contenu du bloc `Item` ci-dessus.

- [ ] **Step 4: Écrire un smoke test** pour vérifier la chaîne de test

```ts
// test/smoke.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Item } from "../src/types.ts";

test("le type Item se compile et un objet valide est bien formé", () => {
  const item: Item = {
    id: "x", text: "hello", createdAt: "2026-07-02T00:00:00.000Z",
    remindOn: null, done: false, doneAt: null,
  };
  assert.equal(item.text, "hello");
});
```

- [ ] **Step 5: Nettoyer l'ancien scaffold create-ink-app**

Le repo part d'un scaffold hello-world jamais utilisé, incompatible avec la nouvelle stack. Supprimer :
- `source/` (ancien `app.tsx`/`cli.tsx` hello-world), `test.tsx`, `dist/`, `package-lock.json` (regénéré à l'install).
- Ne pas toucher : `docs/`, `standards/`, `.editorconfig`, `.prettierignore`, `.gitattributes`, `readme.md` (sera remplacé en Task 7).

Puis **mettre à jour `CLAUDE.md`** pour refléter la stack réelle : commandes (`npm start` via tsx, `npm test` = prettier + xo + node:test, plus de `npm run build`), dossier `src/` (et non `source/`), point d'entrée `src/cli.tsx`. Garder les sections « architecture rule » et le renvoi à `standards/ink.md` telles quelles.

- [ ] **Step 6: Installer et lancer les tests**

Run: `npm install && npm test`
Expected: prettier + xo passent, 1 test node passe (`smoke`).

- [ ] **Step 7: Commit**

```bash
git rm -r source test.tsx dist 2>/dev/null; git add -A
git commit -m "chore: scaffold brain (ink 5 + tsx + node:test, keep xo/prettier)"
```

---

## Task 2: Logique de dates (`src/date.ts`)

**Files:**
- Create: `src/date.ts`
- Test: `test/date.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces:
  - `todayYMD(d: Date): string` → `"AAAA-MM-JJ"` (date locale).
  - `addDays(ymd: string, n: number): string` → `"AAAA-MM-JJ"`.
  - `parseReminder(input: string, todayYmd: string): { ok: true; value: string | null } | { ok: false; error: string }`.

- [ ] **Step 1: Écrire les tests**

```ts
// test/date.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { todayYMD, addDays, parseReminder } from "../src/date.ts";

test("todayYMD formate une date locale en AAAA-MM-JJ", () => {
  assert.equal(todayYMD(new Date(2026, 6, 2)), "2026-07-02"); // mois 6 = juillet
  assert.equal(todayYMD(new Date(2026, 0, 5)), "2026-01-05");
});

test("addDays gère le passage de mois", () => {
  assert.equal(addDays("2026-07-02", 1), "2026-07-03");
  assert.equal(addDays("2026-07-31", 1), "2026-08-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("parseReminder accepte une date absolue valide", () => {
  assert.deepEqual(parseReminder("2026-08-15", "2026-07-02"), { ok: true, value: "2026-08-15" });
});

test("parseReminder: vide ou espaces = effacer le rappel (value null)", () => {
  assert.deepEqual(parseReminder("", "2026-07-02"), { ok: true, value: null });
  assert.deepEqual(parseReminder("   ", "2026-07-02"), { ok: true, value: null });
});

test("parseReminder gère les raccourcis aujourd'hui / demain", () => {
  assert.deepEqual(parseReminder("aujourd'hui", "2026-07-02"), { ok: true, value: "2026-07-02" });
  assert.deepEqual(parseReminder("demain", "2026-07-02"), { ok: true, value: "2026-07-03" });
});

test("parseReminder rejette un format inconnu ou une date impossible", () => {
  assert.equal(parseReminder("vendredi", "2026-07-02").ok, false);
  assert.equal(parseReminder("2026-13-01", "2026-07-02").ok, false);
  assert.equal(parseReminder("2026-02-30", "2026-07-02").ok, false);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/date.ts'`).

- [ ] **Step 3: Implémenter `src/date.ts`**

```ts
// src/date.ts
const two = (n: number) => String(n).padStart(2, "0");

export function todayYMD(d: Date): string {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayYMD(dt);
}

function isRealDate(ymd: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number);
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export function parseReminder(
  input: string,
  todayYmd: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const s = input.trim().toLowerCase();
  if (s === "") return { ok: true, value: null };
  if (s === "aujourd'hui" || s === "aujourdhui") return { ok: true, value: todayYmd };
  if (s === "demain") return { ok: true, value: addDays(todayYmd, 1) };
  if (isRealDate(s)) return { ok: true, value: s };
  return { ok: false, error: "Format attendu : AAAA-MM-JJ, « aujourd'hui » ou « demain »." };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS (tous les tests date).

- [ ] **Step 5: Commit**

```bash
git add src/date.ts test/date.test.ts
git commit -m "feat: date parsing and helpers"
```

---

## Task 3: Tri/filtrage d'affichage (`src/view.ts`)

**Files:**
- Create: `src/view.ts`
- Test: `test/view.test.ts`

**Interfaces:**
- Consumes: `Item` (Task 1).
- Produces:
  - `isDue(item: Item, todayYmd: string): boolean`.
  - `buildView(items: Item[], todayYmd: string): { due: Item[]; active: Item[] }` — exclut les items `done`. `due` = non fait ET rappel `≤ today`, **trié par `remindOn` croissant (plus en retard en tête)**. `active` = non fait ET pas dû, **en ordre fichier**.
  - `windowView(count: number, selected: number, height: number): { start: number; end: number }` — maths d'index pures pour le scroll : renvoie la tranche `[start, end)` de la liste visible qui tient dans `height` lignes et contient `selected`. Le composant fait `visible.slice(start, end)` et déduit `▲` (`start > 0`) / `▼` (`end < count`).

- [ ] **Step 1: Écrire les tests**

```ts
// test/view.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Item } from "../src/types.ts";
import { isDue, buildView, windowView } from "../src/view.ts";

const mk = (over: Partial<Item>): Item => ({
  id: over.id ?? "id", text: over.text ?? "t", createdAt: "2026-01-01T00:00:00.000Z",
  remindOn: over.remindOn ?? null, done: over.done ?? false, doneAt: over.doneAt ?? null,
});

test("isDue : rappel aujourd'hui ou passé = dû, futur ou null = non dû", () => {
  assert.equal(isDue(mk({ remindOn: "2026-07-02" }), "2026-07-02"), true);
  assert.equal(isDue(mk({ remindOn: "2026-07-01" }), "2026-07-02"), true);
  assert.equal(isDue(mk({ remindOn: "2026-07-03" }), "2026-07-02"), false);
  assert.equal(isDue(mk({ remindOn: null }), "2026-07-02"), false);
});

test("buildView exclut les faits ; dus triés plus-en-retard-en-tête ; actifs en ordre fichier", () => {
  const items = [
    mk({ id: "a", remindOn: null }),
    mk({ id: "b", remindOn: "2026-07-01" }),
    mk({ id: "c", done: true }),
    mk({ id: "d", remindOn: "2026-07-02" }),
    mk({ id: "e", remindOn: "2026-08-01" }),
    mk({ id: "f", remindOn: "2026-06-01" }), // le plus en retard, mais créé en dernier
  ];
  const v = buildView(items, "2026-07-02");
  assert.deepEqual(v.due.map((i) => i.id), ["f", "b", "d"]); // tri par date croissante, pas ordre fichier
  assert.deepEqual(v.active.map((i) => i.id), ["a", "e"]);   // actifs : ordre fichier
});

test("windowView : tout rentre → fenêtre pleine, pas de scroll", () => {
  assert.deepEqual(windowView(3, 0, 5), { start: 0, end: 3 });
  assert.deepEqual(windowView(5, 4, 5), { start: 0, end: 5 });
});

test("windowView : la fenêtre suit la sélection et reste bornée", () => {
  assert.deepEqual(windowView(10, 0, 5), { start: 0, end: 5 });  // haut de liste
  assert.deepEqual(windowView(10, 3, 5), { start: 0, end: 5 });  // sélection encore visible sans scroller
  assert.deepEqual(windowView(10, 7, 5), { start: 3, end: 8 });  // scroll : sélection en bas de fenêtre
  assert.deepEqual(windowView(10, 9, 5), { start: 5, end: 10 }); // fin de liste, fenêtre remplie
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/view.ts'`).

- [ ] **Step 3: Implémenter `src/view.ts`**

```ts
// src/view.ts
import type { Item } from "./types.ts";

export function isDue(item: Item, todayYmd: string): boolean {
  return item.remindOn !== null && item.remindOn <= todayYmd;
}

export function buildView(
  items: Item[],
  todayYmd: string,
): { due: Item[]; active: Item[] } {
  const pending = items.filter((i) => !i.done);
  return {
    // dus : remindOn non-null (isDue l'exige). Format AAAA-MM-JJ → tri lexical = chronologique ;
    // sort() stable garde l'ordre fichier à date égale. String() évite le non-null assertion (xo).
    due: pending
      .filter((i) => isDue(i, todayYmd))
      .sort((a, b) => String(a.remindOn).localeCompare(String(b.remindOn))),
    active: pending.filter((i) => !isDue(i, todayYmd)),
  };
}

// ponytail: fenêtre dérivée uniquement de `selected` (pas d'offset en state) — la sélection se cale en bas de
// fenêtre quand elle scrolle. Si un scroll plus "stable" gêne à l'usage, mémoriser start dans app.tsx.
export function windowView(
  count: number,
  selected: number,
  height: number,
): { start: number; end: number } {
  if (height <= 0 || count <= height) return { start: 0, end: count };
  const start = Math.max(0, Math.min(selected - height + 1, count - height));
  return { start, end: start + height };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/view.ts test/view.test.ts
git commit -m "feat: display sorting/filtering (due first, hide done)"
```

---

## Task 4: Opérations sur les items (`src/items.ts`)

**Files:**
- Create: `src/items.ts`
- Test: `test/items.test.ts`

**Interfaces:**
- Consumes: `Item` (Task 1).
- Produces (toutes pures, renvoient un **nouveau** tableau, sans muter l'entrée) :
  - `addItem(items: Item[], text: string, nowISO: string): Item[]`
  - `editText(items: Item[], id: string, text: string): Item[]`
  - `setDone(items: Item[], id: string, done: boolean, nowISO: string): Item[]`
  - `setReminder(items: Item[], id: string, remindOn: string | null): Item[]`
  - `removeItem(items: Item[], id: string): Item[]`

- [ ] **Step 1: Écrire les tests**

```ts
// test/items.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Item } from "../src/types.ts";
import { addItem, editText, setDone, setReminder, removeItem } from "../src/items.ts";

const NOW = "2026-07-02T10:00:00.000Z";
const base: Item = {
  id: "a", text: "vieux", createdAt: "2026-01-01T00:00:00.000Z",
  remindOn: null, done: false, doneAt: null,
};

test("addItem ajoute en fin, avec id/createdAt renseignés, sans muter l'entrée", () => {
  const before = [base];
  const after = addItem(before, "nouvelle tâche", NOW);
  assert.equal(after.length, 2);
  assert.equal(before.length, 1); // pas de mutation
  const added = after[1];
  assert.equal(added.text, "nouvelle tâche");
  assert.equal(added.createdAt, NOW);
  assert.equal(added.done, false);
  assert.equal(added.remindOn, null);
  assert.ok(added.id && added.id !== "a");
});

test("editText change le texte de la bonne ligne", () => {
  const after = editText([base], "a", "corrigé");
  assert.equal(after[0].text, "corrigé");
});

test("setDone(true) marque fait + doneAt ; setDone(false) réinitialise", () => {
  const done = setDone([base], "a", true, NOW);
  assert.equal(done[0].done, true);
  assert.equal(done[0].doneAt, NOW);
  const undone = setDone(done, "a", false, NOW);
  assert.equal(undone[0].done, false);
  assert.equal(undone[0].doneAt, null);
});

test("setReminder pose ou efface la date", () => {
  assert.equal(setReminder([base], "a", "2026-08-01")[0].remindOn, "2026-08-01");
  assert.equal(setReminder([base], "a", null)[0].remindOn, null);
});

test("removeItem retire la bonne ligne", () => {
  const two = addItem([base], "seconde", NOW);
  const after = removeItem(two, "a");
  assert.equal(after.length, 1);
  assert.equal(after[0].text, "seconde");
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/items.ts'`).

- [ ] **Step 3: Implémenter `src/items.ts`**

```ts
// src/items.ts
import { randomUUID } from "node:crypto";
import type { Item } from "./types.ts";

export function addItem(items: Item[], text: string, nowISO: string): Item[] {
  const item: Item = {
    id: randomUUID(), text, createdAt: nowISO,
    remindOn: null, done: false, doneAt: null,
  };
  return [...items, item];
}

const patch = (items: Item[], id: string, fn: (i: Item) => Item): Item[] =>
  items.map((i) => (i.id === id ? fn(i) : i));

export function editText(items: Item[], id: string, text: string): Item[] {
  return patch(items, id, (i) => ({ ...i, text }));
}

export function setDone(items: Item[], id: string, done: boolean, nowISO: string): Item[] {
  return patch(items, id, (i) => ({ ...i, done, doneAt: done ? nowISO : null }));
}

export function setReminder(items: Item[], id: string, remindOn: string | null): Item[] {
  return patch(items, id, (i) => ({ ...i, remindOn }));
}

export function removeItem(items: Item[], id: string): Item[] {
  return items.filter((i) => i.id !== id);
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/items.ts test/items.test.ts
git commit -m "feat: pure item operations"
```

---

## Task 5: Persistance (`src/storage.ts`)

**Files:**
- Create: `src/storage.ts`
- Test: `test/storage.test.ts`

**Interfaces:**
- Consumes: `Item` (Task 1).
- Produces:
  - `brainDir(): string` — `process.env.BRAIN_DIR ?? <homedir>/.brain`.
  - `load(): { items: Item[]; error: string | null }` — fichier absent → `{ items: [], error: null }` ; JSON corrompu → `{ items: [], error: "..." }` **sans écrire** ; sinon les items.
  - `save(items: Item[]): void` — crée le dossier si besoin, écriture **atomique** (fichier temp + rename).

- [ ] **Step 1: Écrire les tests**

```ts
// test/storage.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Item } from "../src/types.ts";

const withDir = (fn: (dir: string) => void) => {
  const dir = mkdtempSync(join(tmpdir(), "brain-"));
  process.env.BRAIN_DIR = dir;
  try { fn(dir); } finally { delete process.env.BRAIN_DIR; }
};

const item: Item = {
  id: "a", text: "t", createdAt: "2026-01-01T00:00:00.000Z",
  remindOn: null, done: false, doneAt: null,
};

test("load renvoie [] quand le fichier n'existe pas", () => {
  withDir(async () => {
    const { load } = await import("../src/storage.ts?" + Math.random());
    assert.deepEqual(load(), { items: [], error: null });
  });
});

test("save puis load fait un aller-retour fidèle et crée le dossier", () => {
  withDir(async (dir) => {
    const { save, load } = await import("../src/storage.ts?" + Math.random());
    save([item]);
    assert.ok(existsSync(join(dir, "tasks.json")));
    assert.deepEqual(load().items, [item]);
  });
});

test("un JSON corrompu ne plante pas et n'est PAS écrasé", () => {
  withDir(async (dir) => {
    const { load } = await import("../src/storage.ts?" + Math.random());
    const path = join(dir, "tasks.json");
    writeFileSync(path, "{ pas du json");
    const res = load();
    assert.equal(res.items.length, 0);
    assert.ok(res.error);
    assert.equal(readFileSync(path, "utf8"), "{ pas du json"); // intact
  });
});
```

> Note : `brainDir()` lit `process.env.BRAIN_DIR` à chaque appel (pas de constante mise en cache au chargement du module), pour que les tests puissent le changer.

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test`
Expected: FAIL (`Cannot find module '../src/storage.ts'`).

- [ ] **Step 3: Implémenter `src/storage.ts`**

```ts
// src/storage.ts
import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import type { Item } from "./types.ts";

export function brainDir(): string {
  return process.env.BRAIN_DIR ?? join(homedir(), ".brain");
}

function filePath(): string {
  return join(brainDir(), "tasks.json");
}

export function load(): { items: Item[]; error: string | null } {
  const path = filePath();
  if (!existsSync(path)) return { items: [], error: null };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(parsed)) throw new Error("racine non-tableau");
    return { items: parsed as Item[], error: null };
  } catch (e) {
    // ponytail: on ne réécrit pas par-dessus un fichier corrompu, on repart vide en mémoire
    return { items: [], error: `Fichier illisible (${(e as Error).message}) — non modifié.` };
  }
}

export function save(items: Item[]): void {
  const dir = brainDir();
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `tasks.json.tmp-${process.pid}`);
  writeFileSync(tmp, JSON.stringify(items, null, 2));
  renameSync(tmp, filePath()); // atomique sur le même volume
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts test/storage.test.ts
git commit -m "feat: atomic local JSON persistence"
```

---

## Task 6: Composant TUI Ink (`src/app.tsx`) + entrée (`src/cli.tsx`)

**Files:**
- Create: `src/app.tsx`
- Create: `src/cli.tsx`

**Interfaces:**
- Consumes: `Item` (T1), `todayYMD` + `parseReminder` (T2), `buildView` (T3), `addItem`/`editText`/`setDone`/`setReminder`/`removeItem` (T4), `load`/`save` (T5).
- Produces: l'exécutable `brain` (via `npm start`).

Cette tâche est la seule non couverte par des tests unitaires (couche UI) : elle se valide **manuellement** au Step 3. Toute la logique testable est déjà dans les modules purs ; ce composant ne fait que l'état d'affichage et le clavier.

**Comportement clavier (rappel de la spec) :**
- Mode `input` (par défaut) : barre focus en bas. Taper + `Entrée` = ajoute (ou valide une édition si on édite). `↑` = passe en mode `nav`.
- Mode `nav` : `↑`/`↓` déplacent la sélection sur la liste visible (dus puis actifs). `Espace` coche/décoche. `r` = mode `reminder`. `e` = édite (repasse en `input`, barre pré-remplie). `d` = supprime. `Échap` = retour `input`.
- Mode `reminder` : barre focus pour saisir la date ; `Entrée` valide via `parseReminder` (erreur affichée si invalide, on reste en saisie), `Échap` annule.

- [ ] **Step 1: Implémenter `src/app.tsx`**

```tsx
// src/app.tsx
import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { Item } from "./types.ts";
import { todayYMD, parseReminder } from "./date.ts";
import { buildView, isDue, windowView } from "./view.ts";
import { addItem, editText, setDone, setReminder, removeItem } from "./items.ts";
import { load, save } from "./storage.ts";

type Mode = "input" | "nav" | "reminder";

const nowISO = () => new Date().toISOString();

export default function App() {
  const initial = load();
  const [items, setItems] = useState<Item[]>(initial.items);
  const [loadError] = useState<string | null>(initial.error);
  const [mode, setMode] = useState<Mode>("input");
  const [draft, setDraft] = useState("");
  const [reminderDraft, setReminderDraft] = useState("");
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const { stdout } = useStdout();

  const today = todayYMD(new Date()); // recalculé à chaque render (donc à chaque frappe)
  const view = buildView(items, today);
  const visible = [...view.due, ...view.active]; // ordre affiché = ordre navigable
  const clampedSel = Math.min(selected, Math.max(0, visible.length - 1));

  // fenêtre de scroll : hauteur du terminal moins le chrome (titre, barre, hints)
  // ponytail: marge fixe de 8 lignes, ajuster si le chrome grossit
  const rows = Math.max(1, (stdout?.rows ?? 24) - 8);
  const { start, end } = windowView(visible.length, clampedSel, rows);
  const shown = visible.slice(start, end);

  // persiste à chaque changement
  const commit = (next: Item[]) => {
    setItems(next);
    save(next);
  };

  useInput((input, key) => {
    if (mode === "input") {
      // seule touche gérée ici en saisie : ↑ sort de la barre vers la nav (draft conservé)
      if (key.upArrow && visible.length > 0) {
        setSelected(visible.length - 1); // dernière ligne active
        setMode("nav");
      }
      return; // tout le reste de la frappe est géré par le TextInput focus
    }
    if (mode === "reminder") {
      if (key.escape) { setReminderDraft(""); setReminderError(null); setMode("nav"); }
      return; // la saisie de date est gérée par le TextInput focus
    }
    if (mode === "nav") {
      if (key.downArrow) {
        if (clampedSel >= visible.length - 1) setMode("input");
        else setSelected(clampedSel + 1);
      } else if (key.upArrow) {
        setSelected(Math.max(0, clampedSel - 1));
      } else if (key.escape) {
        setMode("input");
      } else if (visible.length > 0) {
        const target = visible[clampedSel];
        if (input === " ") {
          commit(setDone(items, target.id, !target.done, nowISO()));
        } else if (input === "d") {
          commit(removeItem(items, target.id));
        } else if (input === "e") {
          setDraft(target.text);
          setEditingId(target.id);
          setMode("input");
        } else if (input === "r") {
          setReminderDraft(target.remindOn ?? "");
          setReminderError(null);
          setMode("reminder");
        }
      }
    }
  });

  const submitInput = (value: string) => {
    const text = value.trim();
    if (text === "") { // rien à ajouter, on quitte juste l'édition éventuelle
      setEditingId(null);
      return;
    }
    if (editingId) {
      commit(editText(items, editingId, text));
      setEditingId(null);
    } else {
      commit(addItem(items, text, nowISO()));
    }
    setDraft("");
  };

  const submitReminder = (value: string) => {
    const target = visible[clampedSel];
    if (!target) { setMode("nav"); return; }
    const res = parseReminder(value, today);
    if (!res.ok) { setReminderError(res.error); return; }
    commit(setReminder(items, target.id, res.value));
    setReminderDraft("");
    setReminderError(null);
    setMode("nav");
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>🧠 brain</Text>
      {loadError && <Text color="red">{loadError}</Text>}

      {visible.length === 0 && <Text dimColor>Rien pour l'instant. Écris ci-dessous pour capturer.</Text>}

      {start > 0 && <Text dimColor>▲ {start} de plus</Text>}
      {view.due.length > 0 && start === 0 && <Text color="yellow">— Ressort aujourd'hui —</Text>}
      {shown.map((it) => (
        <Row key={it.id} item={it} today={today}
          selected={mode !== "input" && visible[clampedSel]?.id === it.id} />
      ))}
      {end < visible.length && <Text dimColor>▼ {visible.length - end} de plus</Text>}

      <Box marginTop={1}>
        {mode === "reminder" ? (
          <Box flexDirection="column">
            <Box>
              <Text color="cyan">Rappel (AAAA-MM-JJ / demain, vide = effacer) : </Text>
              <TextInput value={reminderDraft} onChange={setReminderDraft}
                onSubmit={submitReminder} focus />
            </Box>
            {reminderError && <Text color="red">{reminderError}</Text>}
            <Text dimColor>Échap pour annuler</Text>
          </Box>
        ) : (
          <Box>
            <Text color="green">{editingId ? "✎ " : "› "}</Text>
            <TextInput value={draft} onChange={setDraft}
              onSubmit={submitInput} focus={mode === "input"}
              placeholder="capturer une tâche / un feedback…" />
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {mode === "input"
            ? "Entrée: ajouter · ↑: naviguer"
            : mode === "nav"
            ? "↑/↓: naviguer · Espace: fait · r: rappel · e: éditer · d: suppr · Échap: saisie"
            : ""}
        </Text>
      </Box>
    </Box>
  );
}

function Row({ item, today, selected }: { item: Item; today: string; selected: boolean }) {
  const due = isDue(item, today);
  return (
    <Text color={due ? "yellow" : undefined} inverse={selected}>
      {selected ? "❯ " : "  "}
      {item.text}
      {item.remindOn ? `  (⏰ ${item.remindOn})` : ""}
    </Text>
  );
}
```

> `ink-text-input` sur `onSubmit` renvoie la valeur courante ; `focus={false}` empêche la barre de capter les touches quand on est en mode `nav` (le `useInput` prend alors le relais).

- [ ] **Step 2: Implémenter `src/cli.tsx`**

```tsx
// src/cli.tsx
#!/usr/bin/env -S npx tsx
import React from "react";
import { render } from "ink";
import App from "./app.tsx";

render(<App />);
```

- [ ] **Step 3: Test manuel**

Run: `npm start`

Vérifier, dans l'ordre :
1. La barre de saisie est active : taper `acheter du café` + `Entrée` → la ligne apparaît, la barre se vide.
2. Ajouter `revoir archi paiement` puis `↑` → on passe en navigation, la dernière ligne est surlignée.
3. `r` → saisir `demain` + `Entrée` → la ligne affiche `⏰ <date de demain>`, retour en navigation.
4. `r` sur une ligne → saisir `pasunedate` → message d'erreur rouge, on reste en saisie ; `Échap` annule.
5. `Espace` sur une ligne → elle disparaît (marquée faite).
6. `Échap` → retour à la barre de saisie.
7. Quitter (`Ctrl-C`), relancer `npm start` → les lignes non faites sont toujours là (persistance).
8. Régler l'horloge mentale : mettre un rappel à `aujourd'hui` sur une ligne → elle remonte sous « Ressort aujourd'hui » en jaune. Mettre un rappel plus ancien sur une autre → elle passe **au-dessus** (plus en retard en tête).
9. Taper un début de texte puis `↑` (sans `Entrée`) → on passe en nav, et en revenant (`Échap`) le brouillon est toujours dans la barre.
10. Rétrécir le split (ou ajouter assez de lignes) jusqu'à dépasser la hauteur → la liste **scrolle**, `▲/▼` indiquent le contenu masqué, la barre de saisie reste collée en bas.

- [ ] **Step 4: Commit**

```bash
git add src/app.tsx src/cli.tsx
git commit -m "feat: ink TUI panel (always-on input bar + nav mode)"
```

---

## Task 7: README + usage Ghostty

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: tout le reste.
- Produces: doc de lancement + install de la commande `brain`.

- [ ] **Step 1: Écrire `README.md`**

````markdown
# 🧠 brain

Panneau todo TUI qui reste ouvert dans un split, pour ne plus rien oublier.
Capture sans friction (barre de saisie toujours prête) ; rappel par présence
permanente + surlignage de ce qui « ressort » aujourd'hui.

## Lancer

```bash
npm install
npm start
```

## Installer la commande `brain` (globale)

```bash
npm link      # rend `brain` disponible dans le PATH
brain
```

## Usage dans Ghostty

Ouvrir un split dédié et y lancer `brain` — le laisser ouvert toute la journée :

- **Cmd-D** (split vertical) ou **Cmd-Shift-D** (horizontal) dans Ghostty
- dans le nouveau pane : `brain`

> Un seul panneau à la fois : ne lance pas `brain` dans deux splits en même temps, ils
> écraseraient le même fichier (last-writer-wins).

## Raccourcis

- Barre du bas (par défaut) : taper + `Entrée` pour capturer. `↑` pour naviguer.
- En navigation : `↑/↓` bouger · `Espace` fait · `r` rappel · `e` éditer · `d` supprimer · `Échap` retour saisie.
- Rappel : `AAAA-MM-JJ`, `demain`, `aujourd'hui`, ou vide pour effacer.

## Données

Fichier local `~/.brain/tasks.json` (éditable à la main). Les tâches faites
sont masquées mais conservées (pour d'éventuelles stats).
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README + Ghostty usage"
```

---

## Self-Review

**Couverture de la spec :**
- Capture barre-toujours-focus → Task 6 (mode `input`). ✅
- Navigation / cocher / rappel / éditer / supprimer → Task 6 (mode `nav`) + Task 4 (ops). ✅
- Surlignage « ressort aujourd'hui » → Task 3 (`buildView`/`isDue`) + Task 6 (`Row` jaune). ✅
- Dus triés plus-en-retard-en-tête → Task 3 (`buildView` sort). ✅
- Scroll quand la liste déborde (barre toujours en bas) → Task 3 (`windowView` pur) + Task 6 (slice + `▲/▼`). ✅
- `↑` input→nav (draft conservé) + `Échap` reminder→nav → Task 6 (`useInput`). ✅
- Une seule instance (pas de lock, documenté) → Task 7 (README). ✅
- Faits masqués mais conservés → Task 3 (filtre) + Task 4 (`setDone` garde l'item). ✅
- Rappel `AAAA-MM-JJ` + `demain`/`aujourd'hui` → Task 2. ✅
- Stockage `~/.brain/tasks.json`, atomique, corrompu non écrasé → Task 5. ✅
- Modèle unique tâche/feedback → type `Item` (T1), une seule liste partout. ✅
- Tests sur logique non triviale, Ink non testé → Tasks 2–5 testées, Task 6 test manuel. ✅
- Hors périmètre (notif, quick-add, tags, sync, Slack) → absent du plan. ✅

**Cohérence des types/signatures :** `Item`, `buildView`, `isDue`, `windowView`, `parseReminder`, `addItem/editText/setDone/setReminder/removeItem`, `load/save/brainDir` — noms et signatures identiques entre définition (Tasks 1–5) et usage (Task 6). ✅

**Placeholders :** aucun TBD/TODO ; chaque step de code contient le code réel. ✅
