# Input Editing (vertical arrows + delete word/line) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give brain's capture field two missing editing capabilities: ↑/↓ move the cursor between lines (escaping to list-navigation only at the top), and Option/Ctrl+Backspace delete a word while Cmd+Backspace deletes to line start.

**Architecture:** All editing logic stays in the pure, unit-tested `src/core/multiline.ts` (`decodeKey` → action, `applyEdit` → new `(value, cursor)`), extended with a `delete` action and a `vertical` move plus `atFirstLine`/`atLastLine` boundary helpers. Only the ↑-boundary-escape wiring touches the Ink layer (`multiline-input.tsx` gains an `onExitUp` callback; `app.tsx` provides it and drops its old ↑-handling).

**Tech Stack:** Node ≥ 20 (ESM, no build), TypeScript via `tsx`, Ink 5, `node:test`. **Zero new dependencies.**

## Global Constraints

- ESM without a build step: explicit `.ts`/`.tsx` extensions in relative imports.
- `standards/ink.md`: business logic in pure tested modules; `.tsx` = display + keyboard only. One active `useInput` per responsibility.
- `npm test` (prettier + xo + `node:test`) must pass after each task; test output pristine. Pre-existing complexity warnings on `app.tsx`/`multiline.ts` are acceptable (do not add new ones you can avoid, but they don't block).
- Kebab-case filenames; PascalCase component names.
- Backward compatible: single-line entries and top-of-field ↑ must behave exactly as today (↑ leaves to the list).
- macOS/Ghostty target; the input enables the kitty keyboard protocol while focused.
- **Deletion is backward only** (word/line before the cursor); no forward-delete.
- **Delete keys** (user decision): word = Option+Backspace **and** Ctrl+Backspace; line = Cmd+Backspace. **No** Ctrl+W/Ctrl+U fallback.

## Known risk (carry into verification, not a blocker)

The exact byte sequences Ghostty/kitty sends for **Option/Ctrl/Cmd+Backspace** are not confirmed. This plan codes against the kitty convention (`[127;3u` Option, `[127;5u` Ctrl, `[127;9u` Cmd) **plus** Ink's `key.meta`/`key.ctrl` + `key.backspace` flag combos. The final verification step captures the real sequences and adjusts the constants if needed. If Cmd+Backspace turns out to be intercepted by the OS/terminal, delete-line won't fire until debugged — an accepted tradeoff (no Ctrl+U fallback was chosen).

## File Structure

- `src/core/multiline.ts` — pure model. Add `delete` action + `vertical` move; add `atFirstLine`/`atLastLine`; extend `decodeKey`/`applyEdit`/`KeyFlags`.
- `test/multiline.test.ts` — new tests for the above; update the one existing test that assumed ↑ = ignore.
- `src/components/atoms/multiline-input.tsx` — consume the new actions; add optional `onExitUp` prop; handle the ↑-at-top escape and ↓-at-bottom no-op.
- `src/components/molecules/input-bar.tsx` — pass `onExitUp` through.
- `src/app.tsx` — provide `onExitUp` per world; remove the old ↑-to-nav handling (tasks input branch + the notes-input `useInput`).

Tasks 1–2 are pure/TDD. Task 3 is Ink wiring (no unit test; manual + mount verification per `standards/ink.md`).

---

### Task 1: Delete word / line (pure model)

**Files:**
- Modify: `src/core/multiline.ts`
- Test: `test/multiline.test.ts`

**Interfaces:**
- Produces: `KeyAction` gains `{type: 'delete'; unit: 'word' | 'line'}`. `decodeKey` returns it for modified Backspace. `applyEdit` handles it (reuses existing `wordLeft`/`lineStart`).

- [ ] **Step 1: Write failing tests** (append to `test/multiline.test.ts`)

```ts
test('decodeKey : suppression mot (Option/Ctrl+Backspace) et ligne (Cmd+Backspace)', () => {
	assert.deepEqual(decodeKey('', {meta: true, backspace: true}), {
		type: 'delete',
		unit: 'word',
	});
	assert.deepEqual(decodeKey('', {ctrl: true, backspace: true}), {
		type: 'delete',
		unit: 'word',
	});
	assert.deepEqual(decodeKey('[127;3u', {}), {type: 'delete', unit: 'word'});
	assert.deepEqual(decodeKey('[127;9u', {}), {type: 'delete', unit: 'line'});
	assert.deepEqual(decodeKey('', {backspace: true}), {type: 'backspace'}); // simple inchangé
});

test('applyEdit : delete word / line (arrière)', () => {
	assert.deepEqual(applyEdit('foo bar baz', 11, {type: 'delete', unit: 'word'}), {
		value: 'foo bar ',
		cursor: 8,
	});
	assert.deepEqual(applyEdit('abc\ndef ghi', 11, {type: 'delete', unit: 'line'}), {
		value: 'abc\n',
		cursor: 4,
	});
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/multiline.test.ts` → FAIL (unknown action / arity).

- [ ] **Step 3: Implement** — in `src/core/multiline.ts`:

Add to the `KeyAction` union (after the `backspace` member):

```ts
	| {type: 'delete'; unit: 'word' | 'line'}
```

In `decodeKey`, insert the modified-Backspace detection **immediately before** the existing `if (back) return {type: 'backspace'};` line (order matters — a modified Backspace must not be caught by the plain-backspace rule first):

```ts
	// suppression par mot / ligne (Backspace modifié) — AVANT le backspace simple.
	// ⚠️ séquences kitty à confirmer par capture : Option=3, Ctrl=5, Cmd/Super=9.
	if (
		(meta && back) ||
		(ctrl && back) ||
		input === '[127;3u' ||
		input === '[127;5u'
	) {
		return {type: 'delete', unit: 'word'};
	}

	if (input === '[127;9u') return {type: 'delete', unit: 'line'};
```

In `applyEdit`, add a case to the `switch` (before `default`):

```ts
		case 'delete': {
			const from = action.unit === 'word' ? wordLeft(value, c) : lineStart(value, c);
			return {value: value.slice(0, from) + value.slice(c), cursor: from};
		}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS (existing multiline tests still green).

- [ ] **Step 5: Commit** — `git add src/core/multiline.ts test/multiline.test.ts && git commit -m "feat: delete word/line in input editing model"`

---

### Task 2: Vertical cursor movement (pure model)

**Files:**
- Modify: `src/core/multiline.ts`
- Test: `test/multiline.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `KeyFlags` gains `upArrow?`, `downArrow?`. `KeyAction` `move` gains `unit: 'vertical'` and `dir: 'up' | 'down'`. New exported pure helpers `atFirstLine(value, cursor): boolean` and `atLastLine(value, cursor): boolean` (the Ink layer uses them to decide the ↑ escape / ↓ no-op). `applyEdit` moves the cursor vertically, preserving column (clamped to the target line length).

- [ ] **Step 1: Write failing tests** (append to `test/multiline.test.ts`, and add `atFirstLine, atLastLine` to the existing `import {...} from '../src/core/multiline.ts'`)

```ts
test('decodeKey : flèches verticales', () => {
	assert.deepEqual(decodeKey('', {upArrow: true}), {
		type: 'move',
		unit: 'vertical',
		dir: 'up',
	});
	assert.deepEqual(decodeKey('', {downArrow: true}), {
		type: 'move',
		unit: 'vertical',
		dir: 'down',
	});
});

test('applyEdit : vertical préserve la colonne (clampée)', () => {
	const v = 'abcdef\ngh'; // ligne 0 = abcdef (0..6), \n@6, ligne 1 = gh (7..9)
	assert.equal(
		applyEdit(v, 3, {type: 'move', unit: 'vertical', dir: 'down'}).cursor,
		9,
	); // col 3 → 'gh' (len 2) clampé à la fin (9)
	assert.equal(
		applyEdit(v, 8, {type: 'move', unit: 'vertical', dir: 'up'}).cursor,
		1,
	); // col 1 → ligne 0 col 1
});

test('atFirstLine / atLastLine', () => {
	const v = 'abcdef\ngh';
	assert.equal(atFirstLine(v, 3), true);
	assert.equal(atFirstLine(v, 8), false);
	assert.equal(atLastLine(v, 8), true);
	assert.equal(atLastLine(v, 3), false);
});
```

Also update the existing test that assumed ↑ = ignore. Find this line in the `'séquences CSI résiduelles (flèches, etc.) et combos ignorés'` test:

```ts
	assert.deepEqual(decodeKey('', {upArrow: true} as never), {type: 'ignore'}); // flèche haut → parent
```

and replace it with:

```ts
	assert.deepEqual(decodeKey('', {downArrow: false, tab: true}), {type: 'ignore'}); // Tab reste ignoré
```

(The `upArrow` case now has its own dedicated test above; this keeps a residual-ignore assertion without the stale `as never`.)

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/multiline.test.ts` → FAIL (`atFirstLine` undefined / upArrow not decoded).

- [ ] **Step 3: Implement** — in `src/core/multiline.ts`:

Add to `KeyFlags`:

```ts
	upArrow?: boolean;
	downArrow?: boolean;
```

Change the `move` member of `KeyAction` to:

```ts
	| {type: 'move'; unit: 'char' | 'word' | 'line' | 'vertical'; dir: 'left' | 'right' | 'up' | 'down'}
```

In `decodeKey`, add to the flag-normalisation block (near `const left = ...`):

```ts
	const up = key.upArrow ?? false;
	const down = key.downArrow ?? false;
```

and add these two lines immediately **after** the existing `if (right) return {type: 'move', unit: 'char', dir: 'right'};` line (before the text/insert rule):

```ts
	if (up) return {type: 'move', unit: 'vertical', dir: 'up'};
	if (down) return {type: 'move', unit: 'vertical', dir: 'down'};
```

Add the boundary helpers and vertical movers (place them near `lineStart`/`lineEnd`):

```ts
export function atFirstLine(value: string, c: number): boolean {
	return value.lastIndexOf('\n', c - 1) === -1;
}

export function atLastLine(value: string, c: number): boolean {
	return value.indexOf('\n', c) === -1;
}

// monte d'une ligne en conservant la colonne (clampée à la longueur de la ligne cible)
function verticalUp(value: string, c: number): number {
	const ls = lineStart(value, c);
	if (ls === 0) return c; // pas de ligne au-dessus
	const col = c - ls;
	const prevStart = lineStart(value, ls - 1);
	const prevLen = ls - 1 - prevStart;
	return prevStart + Math.min(col, prevLen);
}

function verticalDown(value: string, c: number): number {
	const le = lineEnd(value, c);
	if (le === value.length) return c; // dernière ligne
	const col = c - lineStart(value, c);
	const nextStart = le + 1;
	const nextLen = lineEnd(value, nextStart) - nextStart;
	return nextStart + Math.min(col, nextLen);
}
```

Wire vertical into `moveCursor` — add at the top of its body (before the `char` branch):

```ts
	if (unit === 'vertical') {
		return dir === 'up' ? verticalUp(value, c) : verticalDown(value, c);
	}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add src/core/multiline.ts test/multiline.test.ts && git commit -m "feat: vertical cursor movement + line-boundary helpers"`

---

### Task 3: Wire into the Ink layer (arrows escape + delete)

**Files:**
- Modify: `src/components/atoms/multiline-input.tsx`
- Modify: `src/components/molecules/input-bar.tsx`
- Modify: `src/app.tsx`

**Interfaces:**
- Consumes: `decodeKey`, `applyEdit`, `atFirstLine`, `atLastLine` from `../../core/multiline.ts`.
- Produces: `MultilineInput` and `InputBar` gain an optional `onExitUp?: () => void` prop.

This is an Ink/UI task — no unit test (per `standards/ink.md`). Verified by lint/format, the existing test suite staying green, the app mounting, and manual checks.

- [ ] **Step 1: `multiline-input.tsx`** — import the boundary helpers and add the prop + handling.

Change the import to include the helpers:

```tsx
import {decodeKey, applyEdit, atFirstLine, atLastLine} from '../../core/multiline.ts';
```

Add `onExitUp?: () => void;` to the `Props` type, and add `onExitUp` to the destructured params.

In the `useInput` handler, after the existing `if (action.type === 'ignore') return;` line and **before** `const next = applyEdit(...)`, insert the vertical-boundary handling:

```tsx
			if (action.type === 'move' && action.unit === 'vertical') {
				if (action.dir === 'up' && atFirstLine(value, cursor)) {
					onExitUp?.();
					return;
				}

				if (action.dir === 'down' && atLastLine(value, cursor)) return;
			}
```

(Everything else in the handler — `applyEdit`, `setCursor`, `onChange` — is unchanged and now also covers `delete` and non-boundary `vertical` moves automatically.)

- [ ] **Step 2: `input-bar.tsx`** — thread the prop through. Add `onExitUp?: () => void;` to the props type, destructure it, and pass `onExitUp={onExitUp}` to the `<MultilineInput .../>` it renders.

- [ ] **Step 3: `app.tsx`** — provide `onExitUp` per world and remove the old ↑ handling.

Add two small helpers near the other handlers (e.g. after `cancelNote`):

```tsx
	const exitToTaskNav = () => {
		if (visible.length > 0) {
			setSelected(visible.length - 1);
			setMode('nav');
		}
	};

	const exitToNoteNav = () => {
		if (noteList.length > 0) {
			setNoteSelected(noteList.length - 1);
			setMode('nav');
		}
	};
```

In the **tasks** `useInput`, the input-mode branch currently reads:

```tsx
			if (mode === 'input') {
				// seule touche gérée ici en saisie : ↑ sort de la barre vers la nav (draft conservé)
				if (key.upArrow && visible.length > 0) {
					setSelected(visible.length - 1); // dernière ligne active
					setMode('nav');
				}

				return; // tout le reste de la frappe est géré par le MultilineInput focus
			}
```

Replace that whole block with:

```tsx
			if (mode === 'input') {
				return; // toute la frappe (dont ↑/↓) est gérée par le MultilineInput focus
			}
```

**Delete** the entire notes-input `useInput` block (the one gated `{isActive: world === 'notes' && mode === 'input' && !blocked}` that moved selection up on `key.upArrow`) — its job is now the `onExitUp` callback.

In the footer render, pass `onExitUp` to both `InputBar`s:
- the **tasks** `<InputBar world="tasks" ... />` gets `onExitUp={exitToTaskNav}`.
- the **notes** `<InputBar world="notes" ... />` gets `onExitUp={exitToNoteNav}`.

(The debrief field in `debrief-view.tsx` renders `MultilineInput` without `onExitUp` — intentional: ↑ at the top of a debrief answer simply does nothing. No change there.)

- [ ] **Step 4: Format + lint + tests** — run:

```bash
npx prettier --write src/components/atoms/multiline-input.tsx src/components/molecules/input-bar.tsx src/app.tsx
npx xo
npm test
```

Fix any xo errors (watch for unused vars from the deleted block). Expected: all tests green (the suite is unchanged by this UI task; Tasks 1–2 added the pure tests).

- [ ] **Step 5: Mount check** — confirm the app still mounts without crashing:

```bash
script -q /dev/null bash -c '(sleep 2; kill -INT 0) & exec npm start' 2>&1 | tail -6
```

Expected: the connect prompt or normal view renders, clean SIGINT exit, no React/JS error.

- [ ] **Step 6: Commit** — `git add src/components/atoms/multiline-input.tsx src/components/molecules/input-bar.tsx src/app.tsx && git commit -m "feat: arrows move between lines (escape at top), wire delete word/line"`

---

## Verification (end-to-end, manual — in Ghostty)

Run `npm start` and, in the notes world (`Tab`), type a multi-line note (`Shift+Entrée` for a newline), then:

1. **Vertical arrows:** ↑/↓ move the cursor between lines, keeping the column; on a shorter line the cursor clamps to its end.
2. **Boundary escape:** ↑ on the **top** line jumps to the list (nav); ↓ on the **bottom** line does nothing.
3. **Single-line unchanged:** in the tasks world with a one-line draft, ↑ jumps straight to the list as before.
4. **Delete word:** Option+Backspace (and Ctrl+Backspace) deletes the word before the cursor.
5. **Delete line:** Cmd+Backspace deletes back to the start of the current line.
6. **Confirm the sequences (the known risk):** if delete-word/line doesn't respond, temporarily add `console.error(JSON.stringify({input, key}))` at the top of `multiline-input.tsx`'s `useInput` handler, press each combo in Ghostty, read the real `input`/`key`, and adjust the `[127;Nu]` constants (or the flag combo) in `decodeKey` accordingly; then remove the log. Cmd+Backspace may be OS/terminal-intercepted — if it emits nothing, delete-line can't work without a different key.

`npm test` must remain green throughout.
