# Build Progress — VanGio
> Started: 2026-07-05 | Last updated: 2026-07-16
> Read this at the start of EVERY coding session before touching any file.
> Status keys: [ ] Pending  [~] In Progress  [x] Done

---

## Phase 1 — Environment Setup
- [x] Step 1: Virtualization confirmed enabled (Task Manager)
- [x] Step 2: WSL2 — ABANDONED. Hit Error 14098 (component store) blocking feature registration; RestoreHealth didn't resolve. Switched to native Windows instead (see note below)
- [x] Step 3: N/A — native Windows path taken, no Ubuntu update needed

## Phase 2 — OpenCode Install
- [x] Step 4: Installed OpenCode natively on Windows via npm (`npm i -g opencode-ai@latest`) — verified working, TUI launches

## Phase 3 — Default Provider (GLM)
- [x] Step 5: Got free GLM key from z.ai/model-api (English international portal; NOT bigmodel.cn). Note: key rotated twice after accidental exposure — keep keys private
- [x] Step 6: Key stored as permanent Windows env var ZHIPU_API_KEY via [System.Environment]::SetEnvironmentVariable(...,"User")
- [x] Step 7: Config created at C:\Users\<name>\.config\opencode\opencode.json with GLM block, baseURL https://api.z.ai/api/paas/v4, model zhipu/glm-4.7-flash
- [x] Step 8: **SUCCESS CHECKPOINT PASSED** — OpenCode opens, defaults to zhipu/glm-4.7-flash, Build/Plan agents work, GLM responds. Environment fully working.

## Phase 4 — Fork & Source Build (for actual customization, separate from Phase 2's global install)
- [x] Forked anomalyco/opencode to github.com/bagusgiovani-sys/vangio-v1, cloned to `C:\Exodus\Projects\Vangio-AI Agent\vangio-v1`, branch `dev`, origin=fork, upstream=anomalyco/opencode
- [x] Bun installed globally (fixed a Git-Bash-vs-PowerShell PATH visibility issue — Bun installer updates Windows PATH, needed a full editor restart or manual `export PATH="$HOME/.bun/bin:$PATH"` in `~/.bashrc` for Git Bash to see it)
- [x] Cleaned up an accidental empty git repo created by a misplaced `git init` in the outer project folder (not the actual fork — that's safely nested in `vangio-v1`)
- [x] `bun install` completed clean ("Checked 2412 installs across 2705 packages, no changes") after installing Visual Studio Build Tools (C++ workload) to fix a `node-gyp`/`tree-sitter-powershell` compile error
- [~] **CAVEAT, not resolved with certainty:** the final install used 100% prebuilt native binaries — zero local `.node` compilation actually occurred. This means the VS Build Tools fix is UNCONFIRMED as the true root cause of the original error. Don't repeat this diagnosis as settled fact if the same error resurfaces.
- [x] `fix-node-pty` — RESOLVED AS STALE (2026-07-16): script moved upstream to `packages/core` and now runs automatically via the root `postinstall` hook, so it already ran during the clean `bun install`. The old `--cwd packages/opencode` path no longer exists.
- [x] `bun dev` — CONFIRMED (2026-07-16): TUI opens from source, renders home screen (logo, prompt box, provider status bar, footer), no crashes. Verified via captured run in Claude Code.
- **WORKFLOW NOTE:** actual code editing/searching in vangio-v1 now happens in **Claude Code** (local filesystem access), not this chat. This file + the other planning docs are the shared reference kept in sync across both.

## Phase 5 — Banner (Must-Have, NOW FIRST per reorder confirmed 2026-07-16)
- [x] Locate OpenCode's actual startup banner code — FOUND (2026-07-16): glyph data at `packages/tui/src/logo.ts` (shared source of truth — re-exported to the CLI via `packages/opencode/src/cli/logo.ts`), rendered on the TUI home screen by `packages/tui/src/component/logo.tsx` (mounted in `routes/home.tsx`). Separate private copy in `packages/tui/src/util/presentation.ts` (session-end epilogue) and a plain-text `wordmark` in `packages/opencode/src/cli/ui.ts` — both left as "opencode" for now, they're Phase 8 rebranding scope.
- [x] Implement banner (2026-07-16) — with two adaptations from the original spec, since the TUI is a component-rendered screen buffer, not a raw print stream:
  - `cfonts` is NOT a runtime dependency: the verified block-font wordmark (exact 6-line/54-width output, regenerated deterministically via `bunx cfonts "VANGIO" -f block`) is embedded as static glyph data in `logo.ts`, split "VAN" (dim) + "GIO" (bright) matching upstream's two-tone "open|code" pattern.
  - ANSI blink (`\x1b[5m`) doesn't apply inside the TUI's own render buffer — implemented instead as a signal-driven blinking block cursor (`█`, theme green, 500ms toggle via `setInterval` + solid signal, same idiom as upstream's `move.tsx` dots animation) rendered immediately after the "i" in the byline. Terminal-independent: it's a real re-render, not an SGR blink attribute.
  - Owl face (▲ ears, ● eyes, ▼ beak) positioned LEFT of the wordmark (vertically centered, per user feedback 2026-07-16 — was initially on top) + "by bagusgiovani" byline below, using theme colors.
- [x] Confirmed rendering via real runs: `bun dev` captured output (owl + all 6 wordmark rows + byline + intact prompt/status/footer) AND a ConPTY test using the repo's own `@lydell/node-pty` proving the cursor actually blinks (26 frame flushes at 500ms cadence, green `█` written after the byline). NOTE for future verification: piping `bun dev` to a file shows only ONE frame — opentui suspends repainting without a real TTY; use a node-pty harness to verify animations.
- [ ] USER EYEBALL CHECK: run `bun dev` in a real terminal (Windows Terminal / Git Bash) and confirm owl placement/proportions/spacing/colors look right — branding is subjective, iterate if wanted. Phase not "done" until this passes.

## Phase 6 — Default Provider Switch (config-only, confirmed 2026-07-16)
- [x] Update `opencode.json`: `model` → `opencode/deepseek-v4-flash-free` — DONE (2026-07-16): global `~/.config/opencode/opencode.json` rewritten with Zen provider block + GLM kept as fallback profile. Status bar confirms "DeepSeek V4 Flash (free) OpenCode Zen".
- [x] **VERIFIED WORKING KEYLESS (2026-07-16):** a real completion came back from `opencode/deepseek-v4-flash-free` with NO `OPENCODE_ZEN_API_KEY` env var and NO `auth.json` — Zen currently accepts anonymous requests for this free model. FRAGILE: when anonymous access ends, sign in at opencode.ai/auth and `/connect` (or set the env var). Don't be surprised by sudden 401s.
- [ ] Sign in at opencode.ai/auth + `/connect` — deferred until keyless access breaks (works without it today)
- [ ] **Real test still needed:** run a multi-tool-call session (not just one message) to check whether this actually avoids the concurrency/retry-loop issue GLM hit, or whether that bug is OpenCode-client-side and follows to any provider

## Phase 6.5 — Theme + Agent Workflow (user-directed additions, 2026-07-16)
- [x] "neon-matrix" theme created at `~/.config/opencode/themes/neon-matrix.json` (bright neon green #39FF14 text, matrix green #00FF41 primary, near-black green-tinted background #050805) and activated via `"theme": "neon-matrix"` in `~/.config/opencode/tui.json`. GOTCHA discovered: the active theme name lives in **tui.json**, NOT opencode.json — the TUI reads `useTuiConfig().theme`; theme files are discovered from `<config-dir>/themes/*.json` and project `.opencode/themes/`.
- [x] King/Warrior agent workflow in global opencode.json `"agent"` block: `king` (mode primary, planner/advisor persona, `permission.edit: deny` so it can't write files) and `warrior` (mode primary, implementer persona). Both verified responding via `opencode run --agent <name>`. Tab in the TUI switches between primaries. Warrior was briefly on GLM-4.7-Flash (wrong — its 1-concurrent-request retry-loop bug fires under exactly the warrior's multi-tool-call load; user caught it), then briefly both-on-DeepSeek, now settled per research below.
- [x] **Warrior model selected by benchmark research (2026-07-16): `opencode/mimo-v2.5-free`** — verified responding. Zen's live free catalog (via `opencode models`): big-pickle, deepseek-v4-flash-free, hy3-free, mimo-v2.5-free, nemotron-3-ultra-free, north-mini-code-free. Selection rationale: MiMo-V2.5 scores 78.6 SWE-bench Verified (thinking mode) — near DeepSeek's ~79 — with the strongest agentic average of the free set (65.8 vs ~51), 1M context on Zen. Rejected: North Mini Code (fast 30B-A3B but Artificial Analysis Coding Index only 33.4 — scout-tier, too weak for warrior; could be a future third agent for trivial tasks), Nemotron 3 Ultra (70.7 SWE-V but "Trial use only — do not submit personal or confidential data"), Big Pickle (73.8 SWE-V but stealth model — unknown provider/data policy, "limited time"), Hy3 (preview, no published benchmarks). King stays on DeepSeek V4 Flash Free.
- [!] **Zen free-tier limits: deliberately unpublished.** Confirmed real: users hit a hard "Free usage exceeded, add credits" wall (opencode GitHub issue #28055) — the free tier is a finite budget, not unlimited. UNKNOWN whether the budget is pooled across all free models or per-model — so splitting king/warrior across DeepSeek/MiMo may or may not stretch the total budget, but it does separate per-model rate limits and gives redundancy when one model is down/exhausted. Token discipline matters regardless. Also: 200K/1M figures are CONTEXT WINDOWS (per-request visibility), not session quotas — new sessions do NOT reset rate limits; opencode auto-compaction handles context overflow in-session.
- [!] Privacy reminder: ALL Zen free models are feedback-collection tiers (data may be used for training) — same policy as before: personal/hobby use only, never client/confidential code.

## Phase 7 — Rate-Limit Handling (Must-Have, now AFTER provider switch)
- [ ] Locate OpenCode's existing provider error-handling code (do NOT guess the file)
- [ ] Add clear 429/overload message suggesting a provider switch
- [ ] Confirm a failed request does not crash the session
- [ ] Re-check whether this is still needed post-Phase-6, or if DeepSeek/Zen sidesteps it

## Phase 8 — Branding/Rebranding (Should-Have, now LAST)
- [ ] Rename config folder/output refs OpenCode → VanGio (keep license/attribution notices intact)

---

## Post-v1 (do NOT start until v1 works and ships)
- [ ] Pixel-art mascot logo (parked — use a real pixel-art tool)
- [ ] Rate-limit handling refinement / quota-aware suggestions
- [ ] Custom codebase indexing differentiator — CONFIRMED OpenCode does NOT have this natively (verified: relies on grep/ripgrep/LSP, not semantic search, unlike Cursor). Candidate free plugins: Graphify, `opencode-codebase-index` (Helweg), or `colbymchenry/codegraph` — NOTE: two unrelated tools are both called "CodeGraph," confirm which one before installing. Pick ONE, they overlap in purpose — running multiple simultaneously is redundant (duplicate indexing overhead, duplicate background watchers, agent confusion over which search tool to use)
- [ ] VanGio native side-panel VS Code/Cursor extension — docked, resizable, layout-persistent panel with status indicator + config UI (NOT a terminal wrapper; OpenCode only has the wrapper today). Optionally reuse/rebrand OpenCode's existing terminal-wrapper extension as an interim step
- [ ] Native Windows support without WSL2 — ALREADY EFFECTIVELY DONE for personal use (native npm install works). Still validate/document a clean installer before any public release

## Post-v1 Enhancement Menu (researched free OpenCode plugins — install ONE only when a specific pain appears, not preemptively)
Since VanGio IS OpenCode, all awesome-opencode ecosystem plugins work for free. Prioritized by relevance to GLM-4.7-Flash's known weakness (context/memory on long or multi-file tasks):
- **Graphify** — on-device knowledge-graph codebase mapping, free, MIT, works with OpenCode. Best first pick for cross-file understanding. (Also a partial substitute for the custom-indexing differentiator.)
- **opencode-mem** — persistent memory via LOCAL vector DB, web UI, can reuse existing GLM auth. Free.
- **opencode-openmemory** — local-first, privacy-focused memory (good for freelance client confidentiality). Free.
- **Dynamic context pruning / token-pruning plugins** — stretch the rate-limited free tier further on long sessions.
- **oh-my-opencode** — "battery-included" heavy pack (async subagents, curated agents, LSP/AST, Claude Code compat). Powerful but complex — a LATER tool, not a day-one add. `oh-my-opencode-slim` is the lighter variant.
- NOTE: `opencode-supermemory` requires a PAID Supermemory Pro plan for hosted mode (only self-hosted is free) — prefer opencode-mem/openmemory for a truly-free path.
- Scope-creep traps (useful but NOT for v1): opencode-notify, Composio (team integrations, irrelevant to solo), worktree plugins, browser automation, antigravity-auth (free Gemini access).

---

## Session Log
| Session | Date | Steps completed | Notes |
|---------|------|-----------------|-------|
| 1 | 2026-07-05 | Planning complete (BRD/PRD/CONFIG/SDD/CLAUDE) | Build not started yet |
| 2 | 2026-07-07 to 2026-07-16 | Native Windows environment working, GLM connected, hit GLM concurrency wall, forked+cloned for source customization, bun install resolved, banner code verified, decided to switch default provider to DeepSeek V4 Flash Free, reordered remaining phases | Workflow split: this chat = planning/docs, Claude Code = actual source editing |
| 3 | 2026-07-16 | (Claude Code) docs/fork instruction layer set up + committed/pushed; Windows symlink corruption fixed (see errors.md) unblocking pre-push typecheck; `bun dev` confirmed from source; CodeGraph indexed + wired into Claude Code; Phase 5 banner IMPLEMENTED (logo.ts + logo.tsx) and render-verified — awaiting user eyeball check | fix-node-pty found stale (moved to core postinstall); banner spec adapted to component architecture (see Phase 5 notes) |
| 4 | 2026-07-16 | Banner committed+pushed (285c6e22f); Phase 6 provider switch DONE (DeepSeek default via Zen, verified with real completion — works keyless for now); neon-matrix theme created + activated; king/warrior agent workflow configured in global opencode.json, both agents verified responding; Six Paths (King & Warrior) workflow set up for Claude Code (.claude/CLAUDE.md + .claude/agents/warrior.md) | Theme name lives in tui.json not opencode.json; Zen keyless access is fragile — expect to need /connect eventually |

---

## Current Status
**Last completed (2026-07-16, Claude Code):** Phase 5 banner implemented and render-verified — `packages/tui/src/logo.ts` (VANGIO block wordmark, van|gio two-tone) + `packages/tui/src/component/logo.tsx` (owl face + byline). Typecheck clean. Also: `bun dev` confirmed from source, fork-docs layer live, CodeGraph indexed + connected (`@colbymchenry/codegraph` — the "which CodeGraph" question from the open items is now settled).
**Key deviations from original plan:** (1) WSL2 abandoned — native Windows instead. (2) GLM hit an unfixable 1-concurrent-request wall in real use (OpenCode issue #8618) — switching default to DeepSeek V4 Flash Free via Zen, GLM kept as fallback. (3) Build order changed: banner first. (4) Code editing happens in Claude Code; docs remain the shared continuity layer. (5) Banner spec adapted to the TUI's component architecture — cfonts pre-rendered to static glyphs instead of a runtime dep, blink cursor inherited from the TUI's native DECSCUSR setup (see Phase 5 notes).
**In progress:** Phase 6 essentially done (see Phase 6 notes — keyless Zen works today). Remaining v1 work: Phase 7 (rate-limit handling — re-check if still needed now that DeepSeek is default) and Phase 8 (rebranding: session epilogue + CLI plain wordmark + config folder rename).
**Next action:** Run a real multi-tool-call session on DeepSeek to close the concurrency question, then decide if Phase 7 is still needed.
**Open/unverified items to resolve, not assume:** (a) whether DeepSeek/Zen actually avoids the concurrency bug in a real multi-tool-call session, (b) the true root cause of the original bun install error, (c) how long Zen's keyless access lasts.
**Discipline reminder unchanged:** don't add plugins/features beyond the confirmed 4-phase build order until each phase is actually done and tested.
