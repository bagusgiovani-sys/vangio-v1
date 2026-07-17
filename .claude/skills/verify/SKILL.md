---
name: verify
description: How to run and verify the VanGio TUI (opencode fork) from source — including animations and keyboard input, which need a ConPTY harness with specific gotchas
---

## Launch

- Full TUI from source: `bun dev` from repo root (= `bun run --cwd packages/opencode --conditions=browser src/index.ts`). First frame takes 10–20s (bun compiles TS on the fly) — be patient before declaring it hung.
- Static render check (ONE frame only): pipe it — `timeout 15 bun dev > out.log 2>&1` in Git Bash. opentui detects no TTY and suspends repainting after the first frame. Good for layout/text assertions, useless for animations or input.

## Animations / input (marquee, blink cursor, Tab cycling) — ConPTY harness

- Use the repo's own `@lydell/node-pty` (require the absolute path under `node_modules/.bun/@lydell+node-pty@<ver>/node_modules/@lydell/node-pty`).
- **Run the harness with NODE, not bun.** Bun as the host runtime breaks the ConPTY input pipe: every `proc.write()` throws async `ERR_SOCKET_CLOSED`, the TUI never receives input or query replies, and it exits early. Same script under `node` works.
- **Answer terminal capability queries** or the TUI never renders under a PTY (it queries ~5s in, waits, then dies): reply to XTVERSION (`ESC[>0q` → `ESC P>|xterm(388) ESC\`), DA1 (`ESC[c` → `ESC[?62;22c`), DSR (`ESC[6n` → `ESC[1;1R`), kitty keyboard (`ESC[?u` → `ESC[?0u`), DECRQM 2026 (→ `ESC[?2026;2$y`), XTWINOPS 14/16 (pixel/cell size).
- Harness pattern that works: `pty.spawn(bun, [dev args], { name: "xterm-256color", cols: 140, rows: 35, cwd: repo })`; timestamp every `onData` chunk; strip ANSI (OSC, DCS, CSI incl. `>`/`$` intermediates); assert on text windows appearing over time. To verify a scrolling/animated region, match 14-char probes of the expected text and track which offsets appear at which timestamps.
- ConPTY re-renders from its own screen buffer, so chunk ordering/timing is approximate — assert on trends (offsets advancing, text present), not exact frame sequences.
- Exit: send `\x03` (Ctrl+C) once or twice, then `proc.kill()`.

## Gotchas

- Agent Tab-cycle order is alphabetical: Build → Gryphon → Plan (config agents interleave with built-ins).
- The prompt status row (agent name · model · variant · description marquee) needs ~85+ cols or it wraps to a second line; use cols ≥ 120 in harnesses.
- Incremental repaints only rewrite changed cells — static text like the agent name only appears in the stream on full repaints (boot, resize, agent switch). Absence from a chunk does not mean absence from the screen.
