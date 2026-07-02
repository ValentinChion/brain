# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`brain` is a terminal UI (TUI) todo/feedback panel built with **Node/TypeScript + [Ink](https://github.com/vadimdemedes/ink)** (React for the terminal). It's meant to run continuously in a Ghostty split as an always-visible, friction-free capture pad — see `docs/plans/2026-07-02-brain-design.md` for the product intent and `docs/plans/2026-07-02-brain-implementation-plan.md` for the build plan.

The real app has not been implemented yet beyond the scaffold. Docs and plans are in **French**.

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

Other load-bearing points from the standard: one active `useInput` per responsibility (gate others with `isActive`); use `ink-text-input` with `focus={false}` so an input field doesn't steal navigation keys; exit via `useApp().exit()`, never `process.exit()`; wrap every string in `<Text>`; use `<Static>` for accumulating log-style output.

## Testing

Split per `standards/ink.md` §9: pure logic → `node:test`/`node:assert` (the design plan asks for `assert`-based self-checks on the display sort/filter and reminder-date parsing); Ink components → `ink-testing-library` for a few key interactions only (see `standards/ink.md` §9 for the pattern, incl. `stdin.write` ANSI sequences).
