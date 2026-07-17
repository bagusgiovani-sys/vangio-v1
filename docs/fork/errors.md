# Error Log — VanGio
> Append-only. Never edit existing entries. Never delete.
> Read this at the start of every coding session.

## Entry Format
---
## [YYYY-MM-DD HH:MM] [Short title]
#[type] #[concept]
**Context:** What you were building
**Error:** Exact error message or description
**Root cause:** Why it actually happened
**Fix:** Exactly what resolved it
**Prevention:** Rule to add to OVERVIEW.md > What NOT To Do
**Files affected:** List of changed files
---

## Known-Risk Watchlist (from planning — not errors yet, but expect these)
- **GLM phone verification** may reject your number at open.bigmodel.cn → fallback: z.ai international portal
- **Provider baseURLs drift** — Qwen/Kimi endpoints change; a wrong URL = silent failure. Always verify at setup
- **Free-model tool-calling quirks** — free/open models (Qwen, possibly GLM) may not stop cleanly after a tool call (documented OpenCode issue). Not a crash, an expected rough edge
- **GLM free vs paid endpoint mixup** — `/api/paas/v4` (free) vs `/api/coding/paas/v4` (paid Coding Plan) are NOT interchangeable
- **Kimi** requires min $1 top-up before the API works at all — not truly free
- **Local Ollama** on this hardware (16GB RAM, integrated graphics) will be slow — expected, not a bug
- **Zen free-tier limits are unpublished but real** — users report hitting a hard "Free usage exceeded, add credits" wall after "two huge sessions for six hours" (opencode issue #28055). Cooldown/reset behavior is undocumented and unreliable. Some users resort to Cloudflare WARP proxies (oplire tool) to work around it. Pooled across all Zen free models or per-model: unknown. Treat as a finite trial, not unlimited free access.

## Log

---
## [2026-07-17 22:10] ConPTY test harness: bun host breaks node-pty stdin; TUI dies without terminal query replies
#[environment] #[windows] #[verification] #[tooling]
**Context:** Verifying the Phase 6.6 marquee animation live. Animations need a real PTY (piped `bun dev` renders exactly one frame), so a `@lydell/node-pty` harness spawns the TUI in ConPTY and captures/injects terminal traffic.
**Error:** Two stacked failures. (1) With **bun** as the harness host runtime, every `proc.write()` to the PTY threw async `ERR_SOCKET_CLOSED` — the ConPTY input pipe was dead from the start, so the TUI got no input and no query replies. (2) Even with output flowing, the TUI writes terminal capability queries (XTVERSION `ESC[>0q`, kitty `ESC[?u`, ...) ~5s after launch and, receiving no replies, exits without rendering a single frame.
**Root cause:** (1) Bun's `node:net` named-pipe handling doesn't keep @lydell/node-pty's conin socket alive on Windows — node-pty's supported host is Node. (2) Under a PTY, opentui waits on capability negotiation before first render; a silent fake terminal fails that handshake (piped mode skips the handshake entirely, which is why `bun dev | ...` still shows one frame).
**Fix:** Run the harness with `node` (v22 works) and auto-respond to the queries like an xterm: XTVERSION → `ESC P>|xterm(388) ESC\`, DA1 → `ESC[?62;22c`, DSR 6n → `ESC[1;1R`, kitty → `ESC[?0u`, DECRQM 2026 → `ESC[?2026;2$y`, XTWINOPS 14/16 → sizes. Full TUI then boots, renders, animates, and exits cleanly on Ctrl+C.
**Prevention:** Recipe persisted in `.claude/skills/verify/SKILL.md` — future TUI verification starts from the working harness instead of rediscovering these two traps. Note the session-3 blink test presumably ran under node, which is why this never surfaced before.
**Files affected:** none in-repo (harness lives in session scratchpad; recipe in `.claude/skills/verify/SKILL.md`)
---
## [2026-07-17 00:30] Scout agent (North Mini Code) attempted unrequested file edit
#[model-behavior] #[free-model-quirk] #[agents]
**Context:** Live-testing the new `scout` agent (opencode/north-mini-code-free) with a read-only lookup question: "where is the owl logo rendered? which file do I edit to remove it?"
**Error:** Instead of answering, the model located the file and then attempted an Edit to remove the owl itself — an action nobody requested — then failed the edit (path resolution) and timed out (90s) without ever giving a final answer.
**Root cause:** Known category weakness of small free models: poor instruction discipline ("answer only, don't act"). The prompt phrasing "which file do I edit to remove it" was read as an instruction to edit. Confirms the pre-existing watchlist item "free-model tool-calling quirks."
**Fix:** Added `"permission": { "edit": "deny" }` to the scout agent config (same lock the king has) + rephrased test prompt. Retest: correct answer (packages/tui/src/component/logo.tsx) in 23s with minimal tool calls.
**Prevention:** ANY agent whose role is advisory/lookup-only must have edit denied in config — never rely on the prompt alone to keep a free model read-only. Rule generalizes: capability limits belong in permissions, not prose.
**Files affected:** ~/.config/opencode/opencode.json (out-of-repo config)
---
## [2026-07-16 22:00] Git symlinks materialized as text files broke pre-push typecheck
#[environment] #[git] #[windows]
**Context:** First `git push` from the fork on native Windows (docs/fork setup commit)
**Error:** Husky pre-push `bun turbo typecheck` failed: `packages/enterprise/src/custom-elements.d.ts(1,1): error TS1128: Declaration or statement expected.`
**Root cause:** The repo has 60 committed symlinks (git mode 120000). Git had `core.symlinks=false` locally (Windows default without symlink privilege), so each "symlink" was checked out as a plain text file containing only its target path — TypeScript then tried to parse the path string as a `.d.ts`. Pre-existing checkout issue, unrelated to any code change.
**Fix:** Enabled Windows Developer Mode (Settings → Privacy & Security → For developers), then `git config core.symlinks true`, deleted the 60 affected files, `git checkout --` them — all re-materialized as real symlinks. Typecheck passed; push succeeded.
**Prevention:** On any fresh clone of this repo on Windows: Developer Mode must be ON and `core.symlinks` must be true BEFORE `git clone` (or re-checkout symlinks after enabling). If typecheck ever fails with TS1128 on a tiny `.d.ts`, check `git ls-files --stage <file>` for mode 120000 first — don't debug it as a TypeScript problem.
**Files affected:** None (working-tree state only; no committed changes)
---
