# Meeting-Debrief (v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À la fin de chaque vraie réunion, `brain` sollicite l'utilisateur (notification + modal 2 questions) et transforme ses réponses en tâches/notes étiquetées de la réunion.

**Architecture:** Logique pure dans `src/core/` (détection des débriefs en attente, filtre « vraie réunion », découpe des réponses), testée avec `node:test`. Effets isolés (poll agenda, notification `osascript`, persistance des ids traités). Couche Ink = un organism modal + câblage dans `app.tsx`, non testé unitairement.

**Tech Stack:** Node ≥ 20 (ESM), TypeScript via `tsx` (pas de build), Ink 5, `node:test`. **Zéro nouvelle dépendance.**

## Global Constraints

- ESM sans build : imports avec extensions `.ts`/`.tsx` explicites.
- `standards/ink.md` : logique métier en modules purs testés ; `.tsx` = affichage + clavier.
- Un seul `useInput` actif par responsabilité (gate via `isActive`) ; sortie via `useApp().exit()`.
- Filenames en kebab-case (xo `unicorn/filename-case`) ; noms de composants en PascalCase.
- `npm test` (prettier + xo + `node:test`) doit passer après chaque tâche.
- Données dans `<repo>/.brain/` (gitignoré). macOS/Ghostty cible.

---

## File Structure

- `src/core/types.ts` — ajoute `source?: string` à `Item` et `Note`.
- `src/core/items.ts` / `src/core/notes.ts` — `addItem` / `addNote` acceptent un `source?`.
- `src/core/agenda.ts` — `RawEvent`/`Meeting` étendus ; `shapeEvents` calcule `debriefable`.
- `src/core/debrief.ts` — **nouveau**, pur : `pendingDebriefs`, `linesToItems`, `pruneHandled`.
- `src/core/storage.ts` — `loadHandled` / `saveHandled` (`.brain/debriefed.json`).
- `src/core/notify.ts` — **nouveau** : `notifyScript` (pur) + `notifyMeetingEnded` (spawn `osascript`).
- `src/core/commands.ts` — enregistre `debrief`.
- `src/components/atoms/row.tsx` / `note-row.tsx` — affichent `source`.
- `src/components/organisms/debrief-view.tsx` — **nouveau**, le stepper 2 questions.
- `src/app.tsx` — état de file de débrief, effet de poll + rattrapage, `/debrief`, gating du rendu.
- Tests : `test/{agenda,debrief,items,notes,commands,storage,notify}.test.ts`.

---

### Task 1: `source` field on Item/Note + addItem/addNote

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/items.ts`, `src/core/notes.ts`
- Test: `test/items.test.ts`, `test/notes.test.ts`

**Interfaces:**
- Produces: `addItem(items, text, nowISO, source?)`, `addNote(notes, text, nowISO, source?)` ; `Item.source?: string`, `Note.source?: string`.

- [ ] **Step 1: Write failing tests** (append to `test/items.test.ts` and `test/notes.test.ts`)

```ts
// test/items.test.ts — append
import {addItem} from '../src/core/items.ts';
test('addItem pose source quand fourni, l’omet sinon', () => {
	const withSrc = addItem([], 'a', '2026-07-06T10:00:00Z', 'Sprint review');
	assert.equal(withSrc[0].source, 'Sprint review');
	const without = addItem([], 'a', '2026-07-06T10:00:00Z');
	assert.equal('source' in without[0], false);
});
```

```ts
// test/notes.test.ts — append (addNote déjà importé dans ce fichier)
test('addNote pose source quand fourni, l’omet sinon', () => {
	const withSrc = addNote([], 'n', '2026-07-06T10:00:00Z', 'Sprint review');
	assert.equal(withSrc[0].source, 'Sprint review');
	const without = addNote([], 'n', '2026-07-06T10:00:00Z');
	assert.equal('source' in without[0], false);
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/items.test.ts test/notes.test.ts` → FAIL (source undefined / arity).

- [ ] **Step 3: Implement**

`src/core/types.ts` — add `source?: string;` as the last field of both `Item` and `Note`.

`src/core/items.ts` — replace `addItem`:

```ts
export function addItem(
	items: Item[],
	text: string,
	nowISO: string,
	source?: string,
): Item[] {
	const item: Item = {
		id: randomUUID(),
		text,
		createdAt: nowISO,
		remindOn: null,
		done: false,
		doneAt: null,
		...(source ? {source} : {}),
	};
	return [...items, item];
}
```

`src/core/notes.ts` — replace `addNote`:

```ts
export function addNote(
	notes: Note[],
	text: string,
	nowISO: string,
	source?: string,
): Note[] {
	return [
		...notes,
		{id: randomUUID(), text, createdAt: nowISO, pinned: false, ...(source ? {source} : {})},
	];
}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add src/core/types.ts src/core/items.ts src/core/notes.ts test/items.test.ts test/notes.test.ts && git commit -m "feat: optional source field on items/notes"`

---

### Task 2: `debriefable` on agenda events

**Files:**
- Modify: `src/core/agenda.ts`
- Test: `test/agenda.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Meeting` gains `debriefable: boolean`. `RawEvent` gains `eventType?`, `attendees?`.

- [ ] **Step 1: Write failing tests** (append to `test/agenda.test.ts`)

```ts
test('shapeEvents : debriefable = réunion avec autrui, non déclinée, type default', () => {
	const real = shapeEvents([
		{
			id: 'r',
			summary: 'Sprint',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			end: {dateTime: '2026-07-06T09:30:00Z'},
			eventType: 'default',
			attendees: [{self: true, responseStatus: 'accepted'}, {responseStatus: 'accepted'}],
		},
	]);
	assert.equal(real[0].debriefable, true);

	const solo = shapeEvents([
		{id: 's', start: {dateTime: '2026-07-06T09:00:00Z'}, attendees: [{self: true}]},
	]);
	assert.equal(solo[0].debriefable, false); // pas d'autre participant

	const declined = shapeEvents([
		{
			id: 'd',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			attendees: [{self: true, responseStatus: 'declined'}, {responseStatus: 'accepted'}],
		},
	]);
	assert.equal(declined[0].debriefable, false); // décliné

	const focus = shapeEvents([
		{
			id: 'f',
			start: {dateTime: '2026-07-06T09:00:00Z'},
			eventType: 'focusTime',
			attendees: [{self: true}, {responseStatus: 'accepted'}],
		},
	]);
	assert.equal(focus[0].debriefable, false); // bloc focus
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/agenda.test.ts` → FAIL (`debriefable` undefined).

- [ ] **Step 3: Implement** — in `src/core/agenda.ts`:

Extend `RawEvent`:

```ts
export type RawEvent = {
	id?: string;
	summary?: string;
	start?: {dateTime?: string; date?: string};
	end?: {dateTime?: string; date?: string};
	eventType?: string;
	attendees?: Array<{self?: boolean; responseStatus?: string}>;
};
```

Add to `Meeting` in `src/core/types.ts`: `debriefable: boolean;`.

Add the pure predicate + wire it into `shapeEvents`:

```ts
function isDebriefable(e: TimedEvent): boolean {
	if ((e.eventType ?? 'default') !== 'default') return false; // focus / OOO / etc.
	const attendees = e.attendees ?? [];
	const others = attendees.filter(a => !a.self).length;
	if (others < 1) return false; // besoin d'au moins un autre participant
	const me = attendees.find(a => a.self);
	return me?.responseStatus !== 'declined';
}
```

In the `.map(...)` of `shapeEvents`, add `debriefable: isDebriefable(e),` to the returned object.

- [ ] **Step 4: Run, verify pass** — same command → PASS (existing agenda tests still green).

- [ ] **Step 5: Commit** — `git add src/core/agenda.ts src/core/types.ts test/agenda.test.ts && git commit -m "feat: mark debriefable meetings in shapeEvents"`

---

### Task 3: `debrief.ts` pure logic

**Files:**
- Create: `src/core/debrief.ts`
- Test: `test/debrief.test.ts`

**Interfaces:**
- Consumes: `Meeting` (with `debriefable`, `id`, `end`).
- Produces: `pendingDebriefs(meetings, nowISO, handled) → Meeting[]`, `linesToItems(text) → string[]`, `pruneHandled(handled, todaysIds) → string[]`.

- [ ] **Step 1: Write failing tests** — `test/debrief.test.ts`:

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingDebriefs, linesToItems, pruneHandled} from '../src/core/debrief.ts';

const m = (id, end, debriefable = true) => ({
	id,
	title: id,
	start: end,
	end,
	debriefable,
});

test('pendingDebriefs : debriefable + fini + non traité, trié par fin', () => {
	const meetings = [
		m('b', '2026-07-06T14:00:00Z'),
		m('a', '2026-07-06T09:00:00Z'),
		m('future', '2026-07-06T23:00:00Z'),
		m('nondeb', '2026-07-06T08:00:00Z', false),
	];
	const out = pendingDebriefs(meetings, '2026-07-06T15:00:00Z', ['a']);
	assert.deepEqual(out.map(x => x.id), ['b']); // a traité, future pas fini, nondeb exclu
});

test('linesToItems : trim, ignore lignes vides', () => {
	assert.deepEqual(linesToItems('  faire X \n\n  relancer Y\n'), ['faire X', 'relancer Y']);
	assert.deepEqual(linesToItems('   '), []);
});

test('pruneHandled : ne garde que les ids du jour', () => {
	assert.deepEqual(pruneHandled(['a', 'old'], ['a', 'b']), ['a']);
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/debrief.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/core/debrief.ts`:

```ts
// Détection des débriefs en attente + utilitaires. Pur et testé.
import type {Meeting} from './types.ts';

export function pendingDebriefs(
	meetings: readonly Meeting[],
	nowISO: string,
	handled: readonly string[],
): Meeting[] {
	const now = new Date(nowISO).getTime();
	const done = new Set(handled);
	return meetings
		.filter(
			m => m.debriefable && !done.has(m.id) && new Date(m.end).getTime() <= now,
		)
		.sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime());
}

export function linesToItems(text: string): string[] {
	return text
		.split('\n')
		.map(l => l.trim())
		.filter(l => l.length > 0);
}

export function pruneHandled(
	handled: readonly string[],
	todaysIds: readonly string[],
): string[] {
	const today = new Set(todaysIds);
	return handled.filter(id => today.has(id));
}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add src/core/debrief.ts test/debrief.test.ts && git commit -m "feat: pure debrief detection (pending/lines/prune)"`

---

### Task 4: persist handled meeting ids

**Files:**
- Modify: `src/core/storage.ts`
- Test: `test/storage.test.ts`

**Interfaces:**
- Produces: `loadHandled() → string[]`, `saveHandled(ids: string[]) → void`. Fichier `debriefed.json` dans `brainDir()`.

- [ ] **Step 1: Write failing test** (append to `test/storage.test.ts`, reuse `withDir`)

```ts
test('saveHandled puis loadHandled : aller-retour', async () => {
	await withDir(async () => {
		const {saveHandled, loadHandled} = await import(
			`../src/core/storage.ts?${Math.random()}`
		);
		saveHandled(['a', 'b']);
		assert.deepEqual(loadHandled(), ['a', 'b']);
	});
});

test('loadHandled : [] si absent ou corrompu', async () => {
	await withDir(async dir => {
		const {loadHandled} = await import(`../src/core/storage.ts?${Math.random()}`);
		assert.deepEqual(loadHandled(), []);
		writeFileSync(join(dir, 'debriefed.json'), '{ pas du json');
		assert.deepEqual(loadHandled(), []);
	});
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/storage.test.ts` → FAIL.

- [ ] **Step 3: Implement** — append to `src/core/storage.ts` (reuse existing `loadArray`/`saveArray`):

```ts
// ids des réunions déjà débriefées/skippées (anti re-déclenchement)
export function loadHandled(): string[] {
	return loadArray<string>('debriefed.json').data;
}

export function saveHandled(ids: string[]): void {
	saveArray('debriefed.json', ids);
}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add src/core/storage.ts test/storage.test.ts && git commit -m "feat: persist handled debrief ids"`

---

### Task 5: macOS notification

**Files:**
- Create: `src/core/notify.ts`
- Test: `test/notify.test.ts`

**Interfaces:**
- Produces: `notifyScript(title) → string` (pur, AppleScript échappé), `notifyMeetingEnded(title) → void` (spawn, best-effort).

- [ ] **Step 1: Write failing test** — `test/notify.test.ts`:

```ts
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {notifyScript} from '../src/core/notify.ts';

test('notifyScript : échappe les guillemets et inclut le titre', () => {
	const s = notifyScript('Point "urgent"');
	assert.match(s, /^display notification "/);
	assert.match(s, /Point \\"urgent\\"/); // guillemets échappés pour AppleScript
	assert.match(s, /with title "brain 🧠"/);
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/notify.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/core/notify.ts`:

```ts
// Notification macOS (best-effort, zéro dépendance).
import {spawn} from 'node:child_process';

const escapeAppleScript = (s: string): string =>
	s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

export function notifyScript(title: string): string {
	const msg = escapeAppleScript(`${title} terminée — débrief ?`);
	return `display notification "${msg}" with title "brain 🧠"`;
}

export function notifyMeetingEnded(title: string): void {
	const child = spawn('osascript', ['-e', notifyScript(title)], {
		stdio: 'ignore',
		detached: true,
	});
	child.on('error', () => undefined); // osascript absent → on ignore
	child.unref();
}
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add src/core/notify.ts test/notify.test.ts && git commit -m "feat: macOS meeting-ended notification"`

---

### Task 6: register `/debrief` command

**Files:**
- Modify: `src/core/commands.ts`
- Test: `test/commands.test.ts`

**Interfaces:**
- Produces: `parseCommand('/debrief') → {name:'debrief', args:[]}`.

- [ ] **Step 1: Write failing test** (append to `test/commands.test.ts`)

```ts
test('parseCommand : /debrief reconnu', () => {
	assert.deepEqual(parseCommand('/debrief'), {name: 'debrief', args: []});
});
```

- [ ] **Step 2: Run, verify fail** — `npx node --import tsx --test test/commands.test.ts` → FAIL (returns null).

- [ ] **Step 3: Implement** — in `src/core/commands.ts`, change the registry line to:

```ts
const REGISTRY = new Set(['gauth', 'debrief']);
```

- [ ] **Step 4: Run, verify pass** — same command → PASS.

- [ ] **Step 5: Commit** — `git add src/core/commands.ts test/commands.test.ts && git commit -m "feat: register /debrief command"`

---

### Task 7: show `source` on rows (UI)

**Files:**
- Modify: `src/components/atoms/row.tsx`, `src/components/atoms/note-row.tsx`

**Interfaces:**
- Consumes: `Item.source?`, `Note.source?`.

- [ ] **Step 1: Implement** — in `src/components/atoms/row.tsx`, after the `remindOn` block and before the closing `</Text>`, add:

```tsx
{item.source && (
	<Text dimColor>
		{'  '}
		{glyph.bullet} {item.source}
	</Text>
)}
```

In `src/components/atoms/note-row.tsx`, inside the outer `<Text>`, after the body, add:

```tsx
{note.source && (
	<Text dimColor>
		{'  '}
		{glyph.bullet} {note.source}
	</Text>
)}
```

- [ ] **Step 2: Verify format+lint** — `npx prettier --write src/components/atoms/row.tsx src/components/atoms/note-row.tsx && npx xo` → no errors.

- [ ] **Step 3: Commit** — `git add src/components/atoms/row.tsx src/components/atoms/note-row.tsx && git commit -m "feat: display source tag on tasks/notes"`

---

### Task 8: DebriefView organism (UI)

**Files:**
- Create: `src/components/organisms/debrief-view.tsx`

**Interfaces:**
- Consumes: `Meeting`, `MultilineInput`, theme.
- Produces: `<DebriefView meeting phase remaining draft onChange onSubmit onSkip />` where `phase: 'actions' | 'infos'`.

- [ ] **Step 1: Implement** — `src/components/organisms/debrief-view.tsx`:

```tsx
import React from 'react';
import {Box, Text} from 'ink';
import type {Meeting} from '../../core/types.ts';
import {color, glyph} from '../../core/theme.ts';
import Masthead from '../molecules/masthead.tsx';
import MultilineInput from '../atoms/multiline-input.tsx';

export default function DebriefView({
	meeting,
	phase,
	remaining,
	draft,
	onChange,
	onSubmit,
	onSkip,
}: {
	meeting: Meeting;
	phase: 'actions' | 'infos';
	remaining: number;
	draft: string;
	onChange: (value: string) => void;
	onSubmit: (value: string) => void;
	onSkip: () => void;
}) {
	const accent = phase === 'actions' ? color.task : color.note;
	const question =
		phase === 'actions' ? '✅ Actions à faire ?' : '📝 Infos à garder ?';
	return (
		<Box flexDirection="column">
			<Masthead accent={accent} label="DEBRIEF" />
			<Box flexDirection="column" paddingX={1} paddingBottom={1}>
				<Text color={accent}>
					{meeting.title}
					{remaining > 1 ? `  (${remaining - 1} autre(s) après)` : ''}
				</Text>
				<Box marginTop={1}>
					<Text color={accent}>{question}</Text>
				</Box>
				<Box>
					<Text color={accent}>{glyph.prompt} </Text>
					<MultilineInput
						value={draft}
						onChange={onChange}
						onSubmit={onSubmit}
						onCancel={onSkip}
						focus
						placeholder="une par ligne…"
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Entrée: valider · Shift+Entrée: ligne · Échap: passer la réunion
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
```

- [ ] **Step 2: Verify format+lint** — `npx prettier --write src/components/organisms/debrief-view.tsx && npx xo` → no errors.

- [ ] **Step 3: Commit** — `git add src/components/organisms/debrief-view.tsx && git commit -m "feat: debrief-view two-question stepper"`

---

### Task 9: wire debrief into app.tsx

**Files:**
- Modify: `src/app.tsx`

**Interfaces:**
- Consumes: `pendingDebriefs`, `linesToItems`, `pruneHandled` (`debrief.ts`); `loadHandled`, `saveHandled` (`storage.ts`); `notifyMeetingEnded` (`notify.ts`); `addItem`/`addNote` with source; `DebriefView`.

- [ ] **Step 1: Add imports** — in `src/app.tsx`, alongside existing imports:

```tsx
import {useRef} from 'react'; // fusionner avec l'import React existant
import {loadHandled, saveHandled} from './core/storage.ts';
import {pendingDebriefs, linesToItems, pruneHandled} from './core/debrief.ts';
import {notifyMeetingEnded} from './core/notify.ts';
import DebriefView from './components/organisms/debrief-view.tsx';
```

(`load, save, loadNotes, saveNotes` sont déjà importés depuis `./core/storage.ts` — ajouter `loadHandled, saveHandled` à cette ligne plutôt que dupliquer. `useRef` : l'ajouter à `import React, {useState, useEffect} from 'react'`.)

- [ ] **Step 2: Add state + refs** — after the existing `connectPromptOpen` state block:

```tsx
const [handled, setHandled] = useState<string[]>(() => loadHandled());
const [debriefQueue, setDebriefQueue] = useState<Meeting[]>([]);
const [debriefPhase, setDebriefPhase] = useState<'actions' | 'infos'>('actions');
const [debriefDraft, setDebriefDraft] = useState('');

const handledRef = useRef(handled);
handledRef.current = handled;
const queueRef = useRef(debriefQueue);
queueRef.current = debriefQueue;

const markHandled = (id: string) => {
	setHandled(prev => {
		if (prev.includes(id)) return prev;
		const next = [...prev, id];
		saveHandled(next);
		return next;
	});
};
```

- [ ] **Step 3: Startup catch-up** — replace the existing `useEffect(... [connState])` that calls `fetchTodaysEvents` with this version (adds prune + queue seeding):

```tsx
useEffect(() => {
	if (connState !== 'connected') return;
	let alive = true;
	fetchTodaysEvents().then(
		m => {
			if (!alive) return;
			setMeetings(m);
			const todaysIds = m.map(x => x.id);
			const pruned = pruneHandled(handledRef.current, todaysIds);
			if (pruned.length !== handledRef.current.length) {
				setHandled(pruned);
				saveHandled(pruned);
			}

			setDebriefQueue(pendingDebriefs(m, nowISO(), pruned)); // rattrapage, pas de notif
		},
		(error: unknown) => {
			if (!alive) return;
			setConnState('error');
			setConnectError(error instanceof Error ? error.message : String(error));
		},
	);
	return () => {
		alive = false;
	};
}, [connState]);
```

- [ ] **Step 4: Poll effect** — add after the catch-up effect:

```tsx
useEffect(() => {
	if (connState !== 'connected') return;
	const tick = async () => {
		try {
			const m = await fetchTodaysEvents();
			setMeetings(m);
			const pending = pendingDebriefs(m, nowISO(), handledRef.current);
			const known = new Set(queueRef.current.map(x => x.id));
			const fresh = pending.filter(p => !known.has(p.id));
			if (fresh.length > 0) {
				for (const f of fresh) notifyMeetingEnded(f.title); // ping live
				setDebriefQueue(prev => [...prev, ...fresh]);
			}
		} catch {
			// réseau : silencieux, retry au prochain tick
		}
	};

	const id = setInterval(tick, 5 * 60 * 1000);
	return () => {
		clearInterval(id);
	};
}, [connState]);
```

- [ ] **Step 5: Debrief handlers + `/debrief`** — add near the other handlers (after `runCommand`):

```tsx
const head = debriefQueue[0];

const advanceDebrief = () => {
	setDebriefPhase('actions');
	setDebriefDraft('');
	setDebriefQueue(prev => prev.slice(1));
};

const submitDebrief = (value: string) => {
	if (!head) return;
	const lines = linesToItems(value);
	if (debriefPhase === 'actions') {
		if (lines.length > 0) {
			let next = items;
			for (const l of lines) next = addItem(next, l, nowISO(), head.title);
			commit(next);
		}

		setDebriefPhase('infos');
		setDebriefDraft('');
		return;
	}

	if (lines.length > 0) {
		let next = notes;
		for (const l of lines) next = addNote(next, l, nowISO(), head.title);
		commitNotes(next);
	}

	markHandled(head.id);
	advanceDebrief();
};

const skipDebrief = () => {
	if (head) markHandled(head.id);
	advanceDebrief();
};

const runDebrief = () => {
	const now = new Date(nowISO()).getTime();
	const last = meetings
		.filter(m => m.debriefable && new Date(m.end).getTime() <= now)
		.sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];
	if (!last) return;
	setDebriefPhase('actions');
	setDebriefDraft('');
	setDebriefQueue(prev => [last, ...prev.filter(m => m.id !== last.id)]);
};
```

Then extend `runCommand`:

```tsx
const runCommand = (name: string) => {
	if (name === 'gauth') void runConnect();
	if (name === 'debrief') runDebrief();
};
```

- [ ] **Step 6: Gate input + render** — update `blocked` and add the render branch.

Change:

```tsx
const blocked = sweeping || connectPromptOpen;
```

to:

```tsx
const blocked = sweeping || connectPromptOpen || debriefQueue.length > 0;
```

After the `if (connectPromptOpen) { return <ConnectPrompt ... />; }` block, add:

```tsx
if (head) {
	return (
		<DebriefView
			meeting={head}
			phase={debriefPhase}
			remaining={debriefQueue.length}
			draft={debriefDraft}
			onChange={setDebriefDraft}
			onSubmit={submitDebrief}
			onSkip={skipDebrief}
		/>
	);
}
```

- [ ] **Step 7: Format + lint + tests** — `npm test`. Expected: all green (existing 50+ tests + Tasks 1-6 tests). Fix any prettier/xo (e.g. `import` ordering) inline.

- [ ] **Step 8: Manual verification** — see the Verification section below.

- [ ] **Step 9: Commit** — `git add src/app.tsx && git commit -m "feat: meeting-end debrief flow (poll, catch-up, /debrief)"`

---

## Verification (end-to-end, manual)

Run in **Ghostty** with the agenda connected (`/gauth` done in v1).

1. **Startup catch-up:** ensure a real meeting (≥1 other attendee, accepted) already ended today. `npm start` → after the agenda loads, the **DebriefView** opens on that meeting. Type an action line + Enter → "📝 Infos" phase → type a note + Enter → returns to normal view; the **task and note appear tagged `· <meeting>`**.
2. **Skip:** trigger a debrief, press **Échap** → meeting is marked handled, next (or normal view); relaunch → it does **not** re-appear.
3. **`/debrief`:** type `/debrief` in the capture bar → the last ended real meeting's debrief re-opens.
4. **Filter:** confirm a focus-time block / solo event does **not** trigger a debrief.
5. **Persistence:** check `<repo>/.brain/debriefed.json` holds the handled ids.
6. **Live notification** (optional): temporarily lower the poll interval (e.g. `5 * 1000`) and let a real meeting's end-time pass while brain runs → a macOS banner *"… terminée — débrief ?"* fires and the meeting is queued. Restore the interval afterward.

`npm test` must remain green throughout.

## Suite

- **v3** — import du compte-rendu Gemini (Drive) : proposer les actions déjà
  extraites en plus des questions manuelles (scope `drive.readonly`).
