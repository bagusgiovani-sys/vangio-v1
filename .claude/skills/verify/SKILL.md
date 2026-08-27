---
name: verify
description: How to run and verify the VanGio TUI (opencode fork) from source — including animations and keyboard input, which need a ConPTY harness with specific gotchas
---

## Launch

- Full TUI from source: `bun dev` from repo root (= `bun run --cwd packages/opencode --conditions=browser src/index.ts`). **First frame takes 16–70s on this machine, and the spread is the point** — 65–70s measured twice under ConPTY on 2026-08-18 cold, then 16s the same night on a cache left warm by a full typecheck. Never sleep a fixed interval and start typing: poll for the first paint instead (allow 240s). A fixed wait tuned to either number is wrong at the other. A blank frame means "not booted yet", and `~/.local/share/vangio/log/opencode.log` tells you which phase it is in before you conclude anything is broken.
- Static render check (ONE frame only): pipe it — `timeout 15 bun dev > out.log 2>&1` in Git Bash. opentui detects no TTY and suspends repainting after the first frame. Good for layout/text assertions, useless for animations or input.

## Animations / input (marquee, blink cursor, Tab cycling) — ConPTY harness

- Use the repo's own `@lydell/node-pty` (require the absolute path under `node_modules/.bun/@lydell+node-pty@<ver>/node_modules/@lydell/node-pty`).
- **Run the harness with NODE, not bun.** Bun as the host runtime breaks the ConPTY input pipe: every `proc.write()` throws async `ERR_SOCKET_CLOSED`, the TUI never receives input or query replies, and it exits early. Same script under `node` works.
- **Answer terminal capability queries** or the TUI never renders under a PTY (it queries ~5s in, waits, then dies): reply to XTVERSION (`ESC[>0q` → `ESC P>|xterm(388) ESC\`), DA1 (`ESC[c` → `ESC[?62;22c`), DSR (`ESC[6n` → `ESC[1;1R`), kitty keyboard (`ESC[?u` → `ESC[?0u`), DECRQM 2026 (→ `ESC[?2026;2$y`), XTWINOPS 14/16 (pixel/cell size).
- Harness pattern that works: `pty.spawn(bun, [dev args], { name: "xterm-256color", cols: 140, rows: 35, cwd: repo })`; timestamp every `onData` chunk; strip ANSI (OSC, DCS, CSI incl. `>`/`$` intermediates); assert on text windows appearing over time. To verify a scrolling/animated region, match 14-char probes of the expected text and track which offsets appear at which timestamps.
- ConPTY re-renders from its own screen buffer, so chunk ordering/timing is approximate — assert on trends (offsets advancing, text present), not exact frame sequences.
- Exit: send `\x03` (Ctrl+C) once or twice, then `proc.kill()`.

## Tests

- Per package, always: `cd packages/<name> && bun test`. Root `bun test` is deliberately blocked.
- **`core` and `tui` finish in one run (~207s and ~10s). `opencode` does not** — three separate attempts were killed before completing on 2026-08-19. Run it in directory chunks; `test/cli test/plugin test/config test/util test/project` is 939 tests across 93 files in 399s, which is about the largest chunk that fits.
- **Two different clocks produce red lines, and `--timeout` only fixes one.** Bun's per-test default is 5s and that class clears at `--timeout 30000` (`test/agent` went 48 pass/1 fail → 49/0 on the flag alone, changing nothing else). But `test/lib/effect.ts` carries its own readiness deadline at lines 173-175, so `file HttpApi > serves search endpoints` fails at 5694ms no matter what bun is told.
- **Read the duration before you read the failure.** A time at almost exactly the timeout value (`5000.90ms`, `30007.09ms`) is a deadline, not a defect. A time well under the budget means an internal deadline fired and raising `--timeout` will not help. A time far past it is a genuine hang.
- **Pipe a long run to a file, not through `grep`.** `bun test | grep ...` buffers, so a run that gets killed leaves *nothing* to read. `bun test > run.log 2>&1` keeps everything up to the kill, which is how the server-cluster failures were identified at all.
- Before renaming any assertion that says `opencode`, read the source it asserts against. Several are correct: `core/test/config/config.test.ts` must keep `.opencode` because `core/src/config.ts` still hardcodes it (lines 181/189/195), and npm scopes, provider IDs, `opencode.ai` URLs, outbound user-agent headers and the `.git/opencode` cache file are all upstream's real identity.

## Gotchas

- Agent Tab-cycle order is alphabetical, and config agents interleave with built-ins. **Since the paradigm layer shipped (2026-08-06) the cycle is Build → Plan only** — Gryphon is no longer an agent; it is a paradigm applied *under* whichever mode is active, and its heads are subagents (`@warrior`, `@scout`) which never enter the cycle. If Gryphon reappears in the Tab cycle, the paradigm plugin failed to load (silently — see errors.md).
- `pty.spawn` on Windows needs an **absolute exe path** (`C:\Users\<you>\.bun\bin\bun.exe`); ConPTY does not do a PATH lookup, and a bare `"bun"` fails with a bare `Error: File not found`.
- The prompt status row (agent name · model · variant · description marquee) needs ~85+ cols or it wraps to a second line; use cols ≥ 120 in harnesses.
- Incremental repaints only rewrite changed cells — static text like the agent name only appears in the stream on full repaints (boot, resize, agent switch). Absence from a chunk does not mean absence from the screen.
- **Never conclude "not rendered" from grepping the stream.** Incremental repaints emit a word as separate positioned writes (`gryph` at one column, `on` at another, often different chunks), so a literal substring search returns 0 hits for text that is plainly on screen — this faked a broken feature twice on 2026-08-06. Judge the screen instead: read a full-repaint frame, which you can force with `proc.resize(cols, rows)`. For anything the renderer might fragment, a probe file written from the code itself beats any stream assertion.
- **For "which row/column is it on", read the cursor positions, not a reconstruction.** A hand-rolled grid rebuild is a convenience and it lies too — one placed the tail of a word a row below its head and produced a confident, wrong "the status row wraps" report. Extract the last `ESC[row;colH` before each write and compare rows directly (e.g. `gryph` at row 24 col 101 vs `Build` at row 24 col 37 = same row, no wrap).
- **Slow the polling down once a step is waiting on the network, and trace from inside the code.** The repaint-forcing poll is not a passive observer: at a 1.5s interval it re-renders 140x40 cells every couple of seconds on a CPU-only machine, competing with the process parsing the model stream. On 2026-08-27 that made a 49s generation look like a >420s hang, with a server log that showed the stream starting and nothing after it. At a 9s interval the same flow finished in 123s. Two rules follow: **poll at 9s or slower while a step awaits the network**, and get timings from an append-to-file inside the plugin rather than inferring them from frames. Also remember a SUCCESSFUL turn logs nothing on completion - `opencode.log` silence after `message=stream` is ambiguous, not evidence of a hang.
- **Wait for each step the same way you waited for boot** — force a repaint, read that frame, retry a few times. Grepping the raw stream for the next dialog's title is the same trap as above wearing a different hat: on 2026-08-18 it reported "wizard never opened" while the wizard was open on screen.
- **Drive a wizard by the title on screen, not by an assumed step order.** Craft goes name → shape → **the king's model** → head 1 role → head 1 model; there is no role step before the king's model. A fixed Down/Enter script that assumes otherwise probes the wrong screen and still returns confident numbers.
- **Assert on text the search box cannot echo.** Typing `claude` into a model filter puts "claude" on screen no matter what is listed, so counting "claude" proves nothing. Count what only a row can carry — `Haiku`/`Opus`/`Sonnet` for the negative, `Kimi K2.5 Free` for the positive.
- Plugins under `~/.config/vangio/plugins/` are a **snapshot, not a link** — re-run `bun packages/paradigm/script/install.ts <active-paradigm>` after any change to `packages/paradigm/src`, or the TUI keeps running the old bundle and the verification is worthless.
