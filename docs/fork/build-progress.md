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
- [ ] Sign in at opencode.ai/auth, get a Zen API key
- [ ] `/connect` in TUI → select "opencode" → paste key
- [ ] Update `opencode.json`: `model` → `opencode/deepseek-v4-flash-free` (see CONFIG.md for full block), keep GLM configured as fallback
- [ ] **Real test needed:** run a multi-tool-call session (not just one message) to check whether this actually avoids the concurrency/retry-loop issue GLM hit, or whether that bug is OpenCode-client-side and follows to any provider

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

---

## Current Status
**Last completed (2026-07-16, Claude Code):** Phase 5 banner implemented and render-verified — `packages/tui/src/logo.ts` (VANGIO block wordmark, van|gio two-tone) + `packages/tui/src/component/logo.tsx` (owl face + byline). Typecheck clean. Also: `bun dev` confirmed from source, fork-docs layer live, CodeGraph indexed + connected (`@colbymchenry/codegraph` — the "which CodeGraph" question from the open items is now settled).
**Key deviations from original plan:** (1) WSL2 abandoned — native Windows instead. (2) GLM hit an unfixable 1-concurrent-request wall in real use (OpenCode issue #8618) — switching default to DeepSeek V4 Flash Free via Zen, GLM kept as fallback. (3) Build order changed: banner first. (4) Code editing happens in Claude Code; docs remain the shared continuity layer. (5) Banner spec adapted to the TUI's component architecture — cfonts pre-rendered to static glyphs instead of a runtime dep, blink cursor inherited from the TUI's native DECSCUSR setup (see Phase 5 notes).
**In progress:** Awaiting user eyeball check of the banner in a real terminal, then commit.
**Next action:** User runs `bun dev`, confirms/tweaks the banner look. Once approved and committed → Phase 6 (default provider switch to DeepSeek via Zen — config-only, needs user to get a Zen key at opencode.ai/auth).
**Open/unverified items to resolve, not assume:** (a) whether DeepSeek/Zen actually fixes the concurrency bug or just moves it, (b) the true root cause of the original bun install error.
**Discipline reminder unchanged:** don't add plugins/features beyond the confirmed 4-phase build order until each phase is actually done and tested.
