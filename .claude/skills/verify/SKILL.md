---
name: verify
description: How to run and verify the VanGio TUI (opencode fork) from source — including animations and keyboard input, which need a ConPTY harness with specific gotchas
---

## Launch

- Full TUI from source: `bun dev` from repo root (= `bun run --cwd packages/opencode --conditions=browser src/index.ts`). **First frame takes 65–70s on this machine** — measured twice under ConPTY on 2026-08-18, not the 10–20s a warm cache suggests. Never sleep a fixed interval and start typing: poll for the first paint instead (allow 240s). A blank frame means "not booted yet", and `~/.local/share/vangio/log/opencode.log` tells you which phase it is in before you conclude anything is broken.
- Static render check (ONE frame only): pipe it — `timeout 15 bun dev > out.log 2>&1` in Git Bash. opentui detects no TTY and suspends repainting after the first frame. Good for layout/text assertions, useless for animations or input.

## Animations / input (marquee, blink cursor, Tab cycling) — ConPTY harness

- Use the repo's own `@lydell/node-pty` (require the absolute path under `node_modules/.bun/@lydell+node-pty@<ver>/node_modules/@lydell/node-pty`).
- **Run the harness with NODE, not bun.** Bun as the host runtime breaks the ConPTY input pipe: every `proc.write()` throws async `ERR_SOCKET_CLOSED`, the TUI never receives input or query replies, and it exits early. Same script under `node` works.
- **Answer terminal capability queries** or the TUI never renders under a PTY (it queries ~5s in, waits, then dies): reply to XTVERSION (`ESC[>0q` → `ESC P>|xterm(388) ESC\`), DA1 (`ESC[c` → `ESC[?62;22c`), DSR (`ESC[6n` → `ESC[1;1R`), kitty keyboard (`ESC[?u` → `ESC[?0u`), DECRQM 2026 (→ `ESC[?2026;2$y`), XTWINOPS 14/16 (pixel/cell size).
- Harness pattern that works: `pty.spawn(bun, [dev args], { name: "xterm-256color", cols: 140, rows: 35, cwd: repo })`; timestamp every `onData` chunk; strip ANSI (OSC, DCS, CSI incl. `>`/`$` intermediates); assert on text windows appearing over time. To verify a scrolling/animated region, match 14-char probes of the expected text and track which offsets appear at which timestamps.
- ConPTY re-renders from its own screen buffer, so chunk ordering/timing is approximate — assert on trends (offsets advancing, text present), not exact frame sequences.
- Exit: send `\x03` (Ctrl+C) once or twice, then `proc.kill()`.

## Gotchas

- Agent Tab-cycle order is alphabetical, and config agents interleave with built-ins. **Since the paradigm layer shipped (2026-08-06) the cycle is Build → Plan only** — Gryphon is no longer an agent; it is a paradigm applied *under* whichever mode is active, and its heads are subagents (`@warrior`, `@scout`) which never enter the cycle. If Gryphon reappears in the Tab cycle, the paradigm plugin failed to load (silently — see errors.md).
- `pty.spawn` on Windows needs an **absolute exe path** (`C:\Users\<you>\.bun\bin\bun.exe`); ConPTY does not do a PATH lookup, and a bare `"bun"` fails with a bare `Error: File not found`.
- The prompt status row (agent name · model · variant · description marquee) needs ~85+ cols or it wraps to a second line; use cols ≥ 120 in harnesses.
- Incremental repaints only rewrite changed cells — static text like the agent name only appears in the stream on full repaints (boot, resize, agent switch). Absence from a chunk does not mean absence from the screen.
- **Never conclude "not rendered" from grepping the stream.** Incremental repaints emit a word as separate positioned writes (`gryph` at one column, `on` at another, often different chunks), so a literal substring search returns 0 hits for text that is plainly on screen — this faked a broken feature twice on 2026-08-06. Judge the screen instead: read a full-repaint frame, which you can force with `proc.resize(cols, rows)`. For anything the renderer might fragment, a probe file written from the code itself beats any stream assertion.
- **For "which row/column is it on", read the cursor positions, not a reconstruction.** A hand-rolled grid rebuild is a convenience and it lies too — one placed the tail of a word a row below its head and produced a confident, wrong "the status row wraps" report. Extract the last `ESC[row;colH` before each write and compare rows directly (e.g. `gryph` at row 24 col 101 vs `Build` at row 24 col 37 = same row, no wrap).
- **Wait for each step the same way you waited for boot** — force a repaint, read that frame, retry a few times. Grepping the raw stream for the next dialog's title is the same trap as above wearing a different hat: on 2026-08-18 it reported "wizard never opened" while the wizard was open on screen.
- **Drive a wizard by the title on screen, not by an assumed step order.** Craft goes name → shape → **the king's model** → head 1 role → head 1 model; there is no role step before the king's model. A fixed Down/Enter script that assumes otherwise probes the wrong screen and still returns confident numbers.
- **Assert on text the search box cannot echo.** Typing `claude` into a model filter puts "claude" on screen no matter what is listed, so counting "claude" proves nothing. Count what only a row can carry — `Haiku`/`Opus`/`Sonnet` for the negative, `Kimi K2.5 Free` for the positive.
- Plugins under `~/.config/vangio/plugins/` are a **snapshot, not a link** — re-run `bun packages/paradigm/script/install.ts <active-paradigm>` after any change to `packages/paradigm/src`, or the TUI keeps running the old bundle and the verification is worthless.
