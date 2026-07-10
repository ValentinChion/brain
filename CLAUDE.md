# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Style rule:** end every CLI message to the user with a 🍸.

## What this is

`brain` is a terminal UI (TUI) todo/feedback + notes panel built with **Node/TypeScript + [Ink](https://github.com/vadimdemedes/ink)** (React for the terminal). It's meant to run continuously in a Ghostty split as an always-visible, friction-free capture pad — see `docs/plans/2026-07-02-brain-design/` for the tasks product intent and `docs/plans/2026-07-03-brain-notes-design/` for the notes addition (design + implementation plan).

Two "worlds" in one panel, toggled with `Tab`: **tasks** (capture + arrow-key reminder stepper, due items resurface) and **notes** (reference material you keep/pin/sweep). Docs and plans are in **French**.

### Modules

Layout: pure logic in `src/core/`, Ink components in `src/components/` (atomic tiers: `atoms/`, `molecules/`, `organisms/`, `templates/`).

Pure, tested (`node:test`, in `src/core/`): `date.ts` (`todayYMD`/`addDays`/`stepReminder`), `view.ts` (`buildView`/`isDue`/`windowView`), `items.ts` (task ops), `notes.ts` (note ops: pin/sort/staleness/sweep), `storage.ts` (atomic JSON for `~/.brain/`: `tasks.json`, `notes.json`, `meta.json` + append-only `journal.jsonl`), `multiline.ts` (`decodeKey` — kitty-aware key→action), `forge.ts` (PR shaping), `azure-auth.ts` / `azure-config.ts`, `google-auth.ts` / `google-config.ts`, `agenda.ts` (calendar agenda), `debrief.ts` (meeting debrief), `changelog.ts`, `stats.ts` (heatmap/streak/records), `commands.ts` (`/` command menu), `hints.ts`, `notify.ts`. I/O-not-unit-tested: `azure-client.ts`, `google-client.ts` (REST API clients).

Ink layer (not unit-tested): `app.tsx` (both worlds, `isActive`-gated `useInput` per responsibility), `components/atoms/multiline-input.tsx` (multi-line field; enables the kitty keyboard protocol while focused so `Shift+Enter` = newline), `components/templates/stats-screen.tsx`, plus the other tiered components (`molecules/pr-section.tsx` PR mirror, `organisms/*` bodies/views); entry point `cli.tsx`.

## Commands

- `npm start` — run the CLI via `tsx src/cli.tsx` (no build step in dev)
- `npm run build` — esbuild bundle to `dist/` (only needed for publishing; `prepack` runs it)
- `npm test` — runs `prettier --check .` + `xo` (lint) + `node:test` (tests). CI-equivalent; all three must pass.
- Run a single test: `npx node --import tsx --test test/smoke.test.ts`
- Lint/format only: `npx xo` / `npx prettier --check .`

The entry point is `src/cli.tsx`, run directly by `tsx` in dev; the published `bin` is the esbuild output `dist/cli.js`. ESM project (`"type": "module"`) — use `.ts`/`.tsx` extensions in relative imports.

## Architecture rule (non-negotiable)

`standards/ink.md` is the governing convention for all Ink code here — **read it before writing any TUI code**. The core rule:

**Keep all business logic in pure, testable modules; treat `.tsx` as a thin display + keyboard layer.**

- Pure modules (`(input) => output`, no Ink/React import, no hidden side effects): dates, sorting/filtering, storage I/O. These get the test coverage.
- `.tsx` = `useState` + `useInput` + JSX that calls those pure functions.
- If a piece of logic needs a test, it belongs in a pure module, not the component.

Other load-bearing points from the standard: one active `useInput` per responsibility (gate others with `isActive`); both input fields use the in-house `MultilineInput` (cursor + inline editing, kitty keyboard protocol while focused) with `focus={false}` so a field doesn't steal navigation keys — its editing logic lives in the pure `multiline.ts` (`decodeKey`/`applyEdit`); exit via `useApp().exit()`, never `process.exit()`; wrap every string in `<Text>`; use `<Static>` for accumulating log-style output.

## Testing

Split per `standards/ink.md` §9: pure logic → `node:test`/`node:assert` (the design plan asks for `assert`-based self-checks on the display sort/filter and reminder-date parsing); Ink components → `ink-testing-library` for a few key interactions only (see `standards/ink.md` §9 for the pattern, incl. `stdin.write` ANSI sequences).
