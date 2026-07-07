# 🧠 brain

> An always-on terminal panel for tasks and notes. Keep it open in a split, type, forget nothing.

`brain` is a TUI capture pad designed to sit in a terminal split all day. The input bar is always ready: type a thought, hit `Enter`, get back to work. Tasks with reminders resurface on the right day; notes wait quietly until you need them — or get swept when they go stale.

- **Zero-friction capture** — no app switch, no mouse, no save button.
- **Reminders without a date picker** — set a date with arrow keys in two seconds.
- **Two worlds, one panel** — `Tab` switches between tasks and notes.
- **Self-cleaning notes** — unpinned notes older than a week get flagged for a one-keystroke sweep at startup.
- **Your data is a JSON file** — everything lives in `~/.brain/`, editable by hand.
- **Zero runtime dependencies** — ships as a single self-contained bundle.

## Install

```bash
npm install -g brain-tui
brain
```

Requires Node.js ≥ 20.

## Usage

Run `brain` in a dedicated split (e.g. `Cmd-D` in Ghostty) and leave it open. The bottom bar captures immediately; press `↑` to enter navigation mode.

> Run only one instance at a time — two panels would overwrite the same file (last writer wins).

### Tasks

| Key            | Action                |
| -------------- | --------------------- |
| type + `Enter` | Capture a task        |
| `↑` / `↓`      | Navigate the list     |
| `Space`        | Mark done             |
| `r`            | Set a reminder        |
| `e` / `d`      | Edit / delete         |
| `Esc`          | Back to the input bar |

Setting a reminder (`r`) opens an arrow-key date stepper: `←` / `→` ±1 day, `↑` / `↓` ±1 week, `Backspace` clears, `Enter` confirms. The floor is today — no reminders in the past. Tasks due today are highlighted so they resurface on their own.

### Notes

Press `Tab` to switch worlds. Notes are for things you want to keep — a command, a link, an idea — not things you check off.

| Key            | Action                                        |
| -------------- | --------------------------------------------- |
| type + `Enter` | Capture a note                                |
| `Shift+Enter`  | Insert a newline (multi-line note)            |
| `p`            | Pin — moves to the top (📌) and never expires |
| `e` / `d`      | Edit / delete                                 |
| `Tab`          | Back to tasks                                 |

> `Shift+Enter` relies on the kitty keyboard protocol (Ghostty, kitty, WezTerm). Elsewhere it degrades to a plain `Enter` — single-line notes, nothing breaks.

**Stale-note sweep** — an unpinned note older than a week becomes a cleanup candidate. At startup, `brain` lists candidates and asks: `d` delete all · `k` keep all · `r` review one by one. Nothing to do day to day.

## Google Calendar (optional)

`brain` can show today's meetings in a status line. It reads your calendar — nothing more (`calendar.events.readonly`).

1. Create an OAuth "Desktop app" client in Google Cloud Console with the Calendar API enabled.
2. Put its credentials in `~/.brain/google-config.json`:

   ```json
   {"clientId": "…", "clientSecret": "…"}
   ```

   (or set `BRAIN_GOOGLE_CLIENT_ID` / `BRAIN_GOOGLE_CLIENT_SECRET`.)

3. On startup, press `o` to authorize in the browser. Re-run anytime by typing `/gauth` in the input bar.

The refresh token is stored in `~/.brain/google-token.json` (mode `600`). Only known `/` commands are intercepted — typing `/etc/hosts` still saves a normal note.

## Data

Plain JSON in `~/.brain/tasks.json` and `~/.brain/notes.json`. Completed tasks are hidden but kept; swept notes are gone for good.

## Development

```bash
git clone <repo> && cd brain
npm install
npm start   # run from source via tsx, no build step
npm test    # prettier + xo + node:test
```

## License

MIT
