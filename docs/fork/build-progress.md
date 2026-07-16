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
- [ ] `bun run --cwd packages/opencode fix-node-pty` — confirm this step was run
- [ ] `bun dev` — confirm the TUI actually opens from source before editing anything
- **WORKFLOW NOTE:** actual code editing/searching in vangio-v1 now happens in **Claude Code** (local filesystem access), not this chat. This file + the other planning docs are the shared reference kept in sync across both.

## Phase 5 — Banner (Must-Have, NOW FIRST per reorder confirmed 2026-07-16)
- [ ] Implement verified banner code in the forked source: owl face (▲ ears, ● eyes, ▼ beak) + `cfonts` "VANGIO" wordmark (block font, confirmed 6 lines/54 width via real sandbox test) + "by bagusgiovani" byline + ANSI blink cursor (`\x1b[5m`)
- [ ] Locate OpenCode's actual startup banner code before editing — don't guess the file path
- [ ] Confirm it renders correctly in a real terminal (Windows Terminal / Git Bash), not just the chat preview

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

---

## Current Status
**Last completed:** Fork cloned and building from source (`vangio-v1`), `bun install` resolved (root cause of original error unconfirmed — see Phase 4 caveat), banner code fully verified and ready to implement, phase order and provider switch both confirmed by user (2026-07-16).
**Key deviations from original plan:** (1) WSL2 abandoned — native Windows instead. (2) GLM hit an unfixable 1-concurrent-request wall in real use (OpenCode issue #8618) — switching default to DeepSeek V4 Flash Free via Zen, GLM kept as fallback. (3) Build order changed: banner is now Phase 1 of remaining work (was rate-limit handling). (4) Actual code editing has moved to Claude Code; this chat + docs remain the planning/continuity layer.
**In progress:** Confirming `bun dev` actually opens the TUI from source, then implementing the banner (Phase 5 above).
**Next action:** In Claude Code — run `bun run --cwd packages/opencode fix-node-pty` then `bun dev` to confirm the source build works, THEN implement the banner code.
**Open/unverified items to resolve, not assume:** (a) whether DeepSeek/Zen actually fixes the concurrency bug or just moves it, (b) the true root cause of the original bun install error, (c) which "CodeGraph" tool (if any) is actually useful here.
**Discipline reminder unchanged:** don't add plugins/features beyond the confirmed 4-phase build order until each phase is actually done and tested.
