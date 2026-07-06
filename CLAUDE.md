# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`brain` is a terminal UI (TUI) todo/feedback + notes panel built with **Node/TypeScript + [Ink](https://github.com/vadimdemedes/ink)** (React for the terminal). It's meant to run continuously in a Ghostty split as an always-visible, friction-free capture pad — see `docs/plans/2026-07-02-brain-design/` for the tasks product intent and `docs/plans/2026-07-03-brain-notes-design/` for the notes addition (design + implementation plan).

Two "worlds" in one panel, toggled with `Tab`: **tasks** (capture + arrow-key reminder stepper, due items resurface) and **notes** (reference material you keep/pin/sweep). Docs and plans are in **French**.

### Modules

Pure, tested (`node:test`): `date.ts` (`todayYMD`/`addDays`/`stepReminder`), `view.ts` (`buildView`/`isDue`/`windowView`), `items.ts` (task ops), `notes.ts` (note ops: pin/sort/staleness/sweep), `storage.ts` (atomic JSON for `tasks.json` + `notes.json`), `multiline.ts` (`decodeKey` — kitty-aware key→action). Ink layer (not unit-tested): `app.tsx` (both worlds, `isActive`-gated `useInput` per responsibility), `multiline-input.tsx` (multi-line note field; enables the kitty keyboard protocol while focused so `Shift+Enter` = newline), `cli.tsx`.

## Commands

- `npm start` — run the CLI via `tsx src/cli.tsx` (no build step)
- `npm test` — runs `prettier --check .` + `xo` (lint) + `node:test` (tests). CI-equivalent; all three must pass.
- Run a single test: `npx node --import tsx --test test/smoke.test.ts`
- Lint/format only: `npx xo` / `npx prettier --check .`

The entry point is `src/cli.tsx` (`bin` in package.json), run directly by `tsx` — no build/compile step. ESM project (`"type": "module"`) — use `.ts`/`.tsx` extensions in relative imports since there's no compiled output.

## Architecture rule (non-negotiable)

`standards/ink.md` is the governing convention for all Ink code here — **read it before writing any TUI code**. The core rule:

**Keep all business logic in pure, testable modules; treat `.tsx` as a thin display + keyboard layer.**

- Pure modules (`(input) => output`, no Ink/React import, no hidden side effects): dates, sorting/filtering, storage I/O. These get the test coverage.
- `.tsx` = `useState` + `useInput` + JSX that calls those pure functions.
- If a piece of logic needs a test, it belongs in a pure module, not the component.

Other load-bearing points from the standard: one active `useInput` per responsibility (gate others with `isActive`); both input fields use the in-house `MultilineInput` (cursor + inline editing, kitty keyboard protocol while focused) with `focus={false}` so a field doesn't steal navigation keys — its editing logic lives in the pure `multiline.ts` (`decodeKey`/`applyEdit`); exit via `useApp().exit()`, never `process.exit()`; wrap every string in `<Text>`; use `<Static>` for accumulating log-style output.

## Testing

Split per `standards/ink.md` §9: pure logic → `node:test`/`node:assert` (the design plan asks for `assert`-based self-checks on the display sort/filter and reminder-date parsing); Ink components → `ink-testing-library` for a few key interactions only (see `standards/ink.md` §9 for the pattern, incl. `stdin.write` ANSI sequences).
