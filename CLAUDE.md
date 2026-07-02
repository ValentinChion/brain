# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`brain` is a terminal UI (TUI) todo/feedback panel built with **Node/TypeScript + [Ink](https://github.com/vadimdemedes/ink)** (React for the terminal). It's meant to run continuously in a Ghostty split as an always-visible, friction-free capture pad — see `docs/plans/2026-07-02-brain-design.md` for the product intent and `docs/plans/2026-07-02-brain-implementation-plan.md` for the build plan.

Current `source/` is still the `create-ink-app` hello-world scaffold; the real app has not been implemented yet. Docs and plans are in **French**.

## Commands

- `npm run build` — compile `source/` → `dist/` via `tsc`
- `npm run dev` — `tsc --watch`
- `npm test` — runs `prettier --check .` + `xo` (lint) + `ava` (tests). CI-equivalent; all three must pass.
- Run a single test: `npx ava test.tsx -m "greet unknown user"` (`-m` matches the test title)
- Lint/format only: `npx xo` / `npx prettier --check .`

The published binary is `dist/cli.js` (`bin` in package.json), so `build` must run before the CLI works. ESM project (`"type": "module"`) — use `.js` extensions in relative imports even from `.tsx` source.

## Architecture rule (non-negotiable)

`standards/ink.md` is the governing convention for all Ink code here — **read it before writing any TUI code**. The core rule:

**Keep all business logic in pure, testable modules; treat `.tsx` as a thin display + keyboard layer.**

- Pure modules (`(input) => output`, no Ink/React import, no hidden side effects): dates, sorting/filtering, storage I/O. These get the test coverage.
- `.tsx` = `useState` + `useInput` + JSX that calls those pure functions.
- If a piece of logic needs a test, it belongs in a pure module, not the component.

Other load-bearing points from the standard: one active `useInput` per responsibility (gate others with `isActive`); use `ink-text-input` with `focus={false}` so an input field doesn't steal navigation keys; exit via `useApp().exit()`, never `process.exit()`; wrap every string in `<Text>`; use `<Static>` for accumulating log-style output.

## Testing

Split per `standards/ink.md` §9: pure logic → `node:test`/`node:assert` (the design plan asks for `assert`-based self-checks on the display sort/filter and reminder-date parsing); Ink components → `ink-testing-library` for a few key interactions only (see `test.tsx` for the pattern, incl. `stdin.write` ANSI sequences).
