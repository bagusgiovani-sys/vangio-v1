# Build Progress — VanGio
> Started: 2026-07-05 | Last updated: 2026-07-19
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
- [x] **DETACHED from fork network (2026-07-18):** user clicked "Leave fork network" on GitHub — vangio-v1 is now a standalone repo. Reason: GitHub never counts commits in forks toward the contribution graph, so all VanGio work showed zero contributions. Local workflow unchanged (same `origin`/`upstream` remotes, same push targets); only GitHub's "forked from" label is gone. Contribution graph should start counting `dev` commits within ~a day.
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

## Phase 6.6 — Gryphon consolidation + description marquee (user-directed, 2026-07-17)
- [x] Agent roster consolidated: Tab cycle was getting crowded (build/plan/king/warrior/scout), so king/warrior/scout merged into ONE primary agent `gryphon` (DeepSeek, orchestrator persona, full permissions) with `warrior` and `scout` demoted to `mode: "subagent"` — out of the Tab cycle, still invokable via `@warrior`/`@scout` and delegable by Gryphon. Tab now cycles Build → Gryphon → Plan (alphabetical — verified live 2026-07-17).
- [x] FORK CODE: new `Marquee` component (`packages/tui/src/component/marquee.tsx`) — endless right-to-left sliding text (150ms tick, windowed slice, wraparound) — wired into the prompt status row (`component/prompt/index.tsx`) to scroll the current agent's `description`. Gryphon's description explains the three heads and their models. Typecheck clean.
- [x] Restored `renderLine` body in `component/logo.tsx` (was left empty by an external edit, breaking compile + wordmark render).
- [x] Live PTY verification of marquee slide + Tab cycle — DONE (2026-07-17, ConPTY harness with `@lydell/node-pty` run under **node**, NOT bun — see errors.md entry): marquee windows of the active agent's description advance ~1 char/150ms (offsets 0→51 traced), wraparound seam renders correctly (tail + 3-space gap + restart, second cycle observed), Tab switches the scrolled description Build→Gryphon→Plan with wrap back to Build, 6 rapid Tabs (2 full cycles) land back on Build, mid-scroll resize (140→100→140 cols) survives, clean Ctrl+C exit. Harness recipe persisted to `.claude/skills/verify/SKILL.md`. **CORRECTION:** actual Tab-cycle order is **Build → Gryphon → Plan** (alphabetical), not Build → Plan → Gryphon as written above. NOTE: at <~85 cols the status row wraps to a second line (marquee included) — acceptable, but part of the user eyeball check.

## Phase 6.5 — Theme + Agent Workflow (user-directed additions, 2026-07-16)
- [x] "neon-matrix" theme created at `~/.config/opencode/themes/neon-matrix.json` (bright neon green #39FF14 text, matrix green #00FF41 primary, near-black green-tinted background #050805) and activated via `"theme": "neon-matrix"` in `~/.config/opencode/tui.json`. GOTCHA discovered: the active theme name lives in **tui.json**, NOT opencode.json — the TUI reads `useTuiConfig().theme`; theme files are discovered from `<config-dir>/themes/*.json` and project `.opencode/themes/`.
- [x] King/Warrior agent workflow in global opencode.json `"agent"` block: `king` (mode primary, planner/advisor persona, `permission.edit: deny` so it can't write files) and `warrior` (mode primary, implementer persona). Both verified responding via `opencode run --agent <name>`. Tab in the TUI switches between primaries. Warrior was briefly on GLM-4.7-Flash (wrong — its 1-concurrent-request retry-loop bug fires under exactly the warrior's multi-tool-call load; user caught it), then briefly both-on-DeepSeek, now settled per research below.
- [x] **Warrior model selected by benchmark research (2026-07-16): `opencode/mimo-v2.5-free`** — verified responding. Zen's live free catalog (via `opencode models`): big-pickle, deepseek-v4-flash-free, hy3-free, mimo-v2.5-free, nemotron-3-ultra-free, north-mini-code-free. Selection rationale: MiMo-V2.5 scores 78.6 SWE-bench Verified (thinking mode) — near DeepSeek's ~79 — with the strongest agentic average of the free set (65.8 vs ~51), 1M context on Zen. Rejected: North Mini Code (fast 30B-A3B but Artificial Analysis Coding Index only 33.4 — scout-tier, too weak for warrior; could be a future third agent for trivial tasks), Nemotron 3 Ultra (70.7 SWE-V but "Trial use only — do not submit personal or confidential data"), Big Pickle (73.8 SWE-V but stealth model — unknown provider/data policy, "limited time"), Hy3 (preview, no published benchmarks). King stays on DeepSeek V4 Flash Free.
- [!] **Zen free-tier limits: deliberately unpublished.** Confirmed real: users hit a hard "Free usage exceeded, add credits" wall (opencode GitHub issue #28055) — the free tier is a finite budget, not unlimited. UNKNOWN whether the budget is pooled across all free models or per-model — so splitting king/warrior across DeepSeek/MiMo may or may not stretch the total budget, but it does separate per-model rate limits and gives redundancy when one model is down/exhausted. Token discipline matters regardless. Also: 200K/1M figures are CONTEXT WINDOWS (per-request visibility), not session quotas — new sessions do NOT reset rate limits; opencode auto-compaction handles context overflow in-session.
- [!] Privacy reminder: ALL Zen free models are feedback-collection tiers (data may be used for training) — same policy as before: personal/hobby use only, never client/confidential code.

## Phase 7 — Rate-Limit Handling (Must-Have, now AFTER provider switch)
- [x] **CANCELLED 2026-07-18:** User decided not needed. DeepSeek V4 Flash Free via Zen doesn't have GLM's 1-concurrent-request retry-loop issue; Zen's free tier has unpublished limits but a future wall is a different problem from the retry-loop bug. If rate-limit issues surface in real use, revisit then.

## Phase 8 — Branding/Rebranding (Should-Have, now LAST)
- [x] Rename config folder/output refs OpenCode → VanGio (keep license/attribution notices intact) — DONE 2026-07-18 in four commits: internal paths (`vangio` XDG dirs, `.vangio` project dir), CLI name (bin/scriptName/output), **legacy-dir migration** (one-time copy of old `opencode` config/data/state into `vangio` dirs at bootstrap + `.opencode` project dirs readable as fallback with `.vangio` winning), and the user-facing text sweep (prompt identity lines, ACP, OAuth page, HTTP API descriptions, permission/uninstall copy, customize skill paths)
- Deliberately NOT renamed: `opencode.json`/`opencode.jsonc` filenames (loader + ecosystem compat), `$schema`/docs URLs (opencode.ai is still the real schema/docs host), `OPENCODE_*` env vars, `@opencode-ai/*` package names, external products (OpenCode Zen/Go, Console), billing wire headers, internal type/function identifiers
- Known cosmetic leftovers (post-v1 if ever): generated SDK artifacts (`packages/sdk/openapi.json`, `sdk.gen.ts`) carry old descriptions until regenerated; OAuth page SVG wordmark still draws the OpenCode logotype; `packages/web` docs site is upstream's, out of fork scope

---

## Post-v1 Roadmap

VanGio v1 is shipped. This is the full product vision — each phase builds on the one before.

### v2 — Desktop App (Visual UI)
- [ ] **Tauri/Electron desktop app** wrapping the VanGio engine via HTTP API
- Visual project browser, click-to-edit, diff viewer, status dashboard
- Preset workflow gallery (guided mode for noobs)
- Same engine underneath — terminal mode still works side by side
- The "noob-friendly" surface — drag, click, see, never type an incantation

### v3 — Mobile Remote Control
- [ ] Watch/reply/approve VanGio sessions from Android over Tailscale
- Engine HTTP API (`opencode serve`) as the bridge — works with terminal OR desktop
- Push notifications via ntfy when a session asks for approval
- SPEC APPROVED 2026-07-17 — implementation plan written
- Architecture: Mobile does NOT wait for Desktop, Desktop does NOT block Mobile. Both talk to the same engine API.

### v4 — Paradigm Presets
- [ ] Hand-crafted multi-AI team configurations for common domains:
  - `web-dev` — one frontend specialist, one backend, one reviewer
  - `content-creator` — one strategist, one writer, one editor
  - `data-analyst` — one SQL/code, one visualization, one explainer
  - `tiktok-marketing` — one content strategist, one copywriter, one analytics
  - (more added based on real use)
- User picks from a gallery — each preset has hardcoded roles + recommended models
- Building on the Gryphon 3-head architecture proven in v1
- No AI generation yet — just good defaults

### v5 — Paradigm Customizer
- [ ] User can tweak a preset: change a role's model, adjust routing rules, rename a head
- Visual config editor in desktop app (or config schema for terminal users)
- Still manual — but the UI supports it
- Power-user unlock: the bridge between "I use what you give me" and "I build my own"

### v6 — AI-Assisted Paradigm Builder
- [ ] User describes their goal → AI asks 3–5 clarifying questions → generates a paradigm config
- "I want to make TikTok videos to sell bras" → VanGio figures out which 3-model team fits
- User reviews and tweaks the generated config before activation
- The AI acts as a smart wizard, not fully autonomous

### v7 — Autonomous Paradigm Generation
- [ ] Full vision: user says the goal → engine assembles the ideal 3-AI team
- Goal decomposition → role mapping → model selection → routing rules → instantiation
- Self-improves based on feedback ("this team produces weak video scripts")
- **The differentiating feature:** no other coding tool ships a factory that builds perfect teams for your job

### Smaller Enhancement Candidates (pick when specific pain appears)
- [ ] Pixel-art mascot logo (use a real pixel-art tool, not hand-typed ASCII)
- [ ] Custom codebase indexing differentiator (OpenCode doesn't have this natively)
- [ ] Rate-limit handling refinement / quota-aware provider suggestions
- [ ] VanGio native side-panel VS Code/Cursor extension
- [ ] Native Windows clean-installer polish (pre-launch blocker before public release)
- OpenCode ecosystem plugins: opencode-openmemory, dynamic context pruning, oh-my-opencode (later)

---

## Session Log
| Session | Date | Steps completed | Notes |
|---------|------|-----------------|-------|
| 1 | 2026-07-05 | Planning complete (BRD/PRD/CONFIG/SDD/CLAUDE) | Build not started yet |
| 2 | 2026-07-07 to 2026-07-16 | Native Windows environment working, GLM connected, hit GLM concurrency wall, forked+cloned for source customization, bun install resolved, banner code verified, decided to switch default provider to DeepSeek V4 Flash Free, reordered remaining phases | Workflow split: this chat = planning/docs, Claude Code = actual source editing |
| 3 | 2026-07-16 | (Claude Code) docs/fork instruction layer set up + committed/pushed; Windows symlink corruption fixed (see errors.md) unblocking pre-push typecheck; `bun dev` confirmed from source; CodeGraph indexed + wired into Claude Code; Phase 5 banner IMPLEMENTED (logo.ts + logo.tsx) and render-verified — awaiting user eyeball check | fix-node-pty found stale (moved to core postinstall); banner spec adapted to component architecture (see Phase 5 notes) |
| 4 | 2026-07-16 | Banner committed+pushed (285c6e22f); Phase 6 provider switch DONE (DeepSeek default via Zen, verified with real completion — works keyless for now); neon-matrix theme created + activated; king/warrior agent workflow configured in global opencode.json, both agents verified responding; Six Paths (King & Warrior) workflow set up for Claude Code (.claude/CLAUDE.md + .claude/agents/warrior.md) | Theme name lives in tui.json not opencode.json; Zen keyless access is fragile — expect to need /connect eventually |
| 5 | 2026-07-17 | (Claude Code) Six Paths workflow exported as portable kit (`six-paths-workflow/`, throwaway, for reuse in other projects); mobile session control idea brainstormed → reality-checked → spec approved (see Post-v1 entry); briefing copy exported to root (`mobile-session-control-summary.md`, throwaway) | Both root-level exports are disposable — user pastes them elsewhere then deletes; no commits made this session |
| 6 | 2026-07-17 | (Claude Code) Phase 6.6 marquee PTY verification DONE (slide, wraparound, Tab cycle, rapid-Tab, resize all pass); repo verify skill created (`.claude/skills/verify/SKILL.md`); Tab-order docs corrected (actual: Build→Gryphon→Plan) | Harness gotchas logged in errors.md: run node-pty host under node not bun; must answer terminal capability queries or TUI dies under PTY. POLICY CHANGE (user, same session): commit+push at every checkpoint from now on, no longer wait to be asked — CLAUDE.md Secretary rule updated; Phase 6.6 work committed+pushed under the new policy |
| 7 | 2026-07-18 | Phase 6.7 Gryphon upgrades (Graphify/opencode-mem/CodeGraph MCP/prompt sharpening/premium brain) done via Gryphon chat; Phase 7 cancelled per user; Phase 8 rebranding started; errors.md Zen limits added | Gryphon chat session (this environment) — all config changes done without switching tools. Phase 8 in progress. |
| 8 | 2026-07-18 | (Claude Code) Phase 8 continued: internal path rebranding committed+pushed — data/cache/config dirs `opencode` → `vangio`, project config dir `.opencode` → `.vangio`, skill cache marker `.opencode-version` → `.vangio-version`, plan-edit permission path, new `VANGIO_TEST_HOME` env (falls back to `OPENCODE_TEST_HOME`) | These 4 files were sitting uncommitted from a prior session — pushed at session start per frequent-push policy. Same session: found root cause of zero-push behavior (CLAUDE.md Secretary rule was never updated to the push policy — fixed); repo detached from fork network so GitHub contributions count (see Phase 4 note) |
| 9 | 2026-07-18 | (Claude Code) Phase 8 FINISHED: diagnosed "Gryphon missing / model fell back to GLM 5" (path rename orphaned old config — see errors.md), shipped legacy-dir migration (bun-tested + sandbox-verified + ran for real on this machine: Gryphon config, themes, tui.json, auth db all in `vangio` dirs now), committed prior session's CLI-name rebrand, fixed 3 rename leftovers (config dir match, plugin install target, TUI permission copy), swept 71 remaining user-facing strings incl. prompt identity + customize skill paths | 4 commits pushed (20eaacfe9, 7027e69a1, 1c6e01864 + docs). New watchlist item: `vangio models` in this repo stalls on project-plugin init (see errors.md) |
| 10 | 2026-07-18 | (Claude Code) Global `vangio` command created: launcher shims in `~/.bun/bin` (`vangio.cmd` for PowerShell/cmd, `vangio` sh script for Git Bash) run the source entry `packages/opencode/src/index.ts` via `bun run --conditions=browser` WITHOUT changing cwd — so `vangio` opens whatever project folder you're standing in. Replaces typing `bun dev` from the repo. Verified from home dir in both shells (`vangio --version` → `local`, exit 0) | Shims are machine-level files (hardcode this repo's absolute path), NOT in the repo — recreate them if the repo moves or on a new machine. `bin/vangio` npm launcher is unusable from source (hunts for a prebuilt platform binary) |
| 11 | 2026-07-19 | (Claude Code) Plugin-stall investigated + resolved (one-time cold npm install, not a bug — errors.md), graphify removed (incompatible with current plugin API, no fixed release; CodeGraph MCP covers it), **v1 TUI ACCEPTANCE PASSED** live under ConPTY harness: banner byline + owl glyphs render, DeepSeek V4 Flash (free) via OpenCode Zen shown as default (migrated config live), Tab cycle Build→Gryphon→Plan works with Gryphon marquee scrolling, `⊙ 1 MCP` indicator (codegraph) visible, boot log clean of plugin errors, clean Ctrl+C exit | Theme not explicitly asserted (harness strips color codes), but migrated `tui.json` is the active theme mechanism per boot log. v1 phase list is now fully done+verified — next step is the user's call: tag/ship v1 or pick a post-v1 item |
| 12 | 2026-07-19 | (Claude Code) **v3 Mobile Remote Control started** — Tasks 1–3 of the mobile-session-control plan DONE via TDD: new `packages/notifier` (watcher decision logic, ntfy transport, plugin entry), 23 tests green + full-repo typecheck clean, 3 commits pushed (341194f26, e0ff54d43, 7924430c0). Task 4 partial: plugin bundled to `~/.config/vangio/plugins/vangio-notifier.js`, `VANGIO_NTFY_TOPIC` secret generated + set (User env), ntfy pipeline proven (HTTP 200), power settings verified already correct (lid=do nothing, AC sleep=never — hidden LIDACTION unhidden to check), Tailscale 1.98.9 installed; setup guide created (`docs/fork/mobile-control-setup.md`). **Notifier VERIFIED END-TO-END against live `vangio serve` sessions — BOTH notification paths**: (a) `Done - vangio-v1 / Session finished after 8 s` (priority 3) from a real completed session, and (b) the critical `Needs approval - vangio-v1 / bash: echo hello-from-vangio` at **priority 5 (max, DND-bypassing)** from a real gated shell command, with a tap-through click URL whose base64 segment decodes to the correct project path. Mobile approve/deny UI confirmed usable by the user, clearing spec §9.2's blocking-defect risk. Session-start cleanup: orphaned `launcher-test.ts` probe deleted | Plan deviations forced by post-plan reality (recorded in guide + commits): bundle target is `vangio` not `opencode` dir; plugin must default-export `{ id, server }` (v1 PluginModule shape — legacy path would call every named export as a plugin); `noUncheckedIndexedAccess` needed `!` in tests; tsconfig needs DOM libs. Live verification also caught a real bug (see errors.md): notifications were silently lost because the host fires event hooks fire-and-forget and the process can exit mid-POST — fixed with a `dispose` drain; note `vangio run` still can't deliver (exits too fast), `vangio serve` is the verified path. REMAINING (user): `tailscale up` login, VANGIO_CLICK_BASE_URL, serve + web app + tailscale serve mounts, phone setup, acceptance ritual |

---

## Phase 6.7 — Gryphon Upgrades: Plugins + Sharper Prompt + Premium Brain (2026-07-17)
- [x] Installed **@sentropic/graphify** — codebase knowledge graph plugin. Enables concept-based search across files, not just text matching. Registered via `opencode plugin @sentropic/graphify`, scoped to project (`.opencode/opencode.jsonc`).
- [x] Installed **opencode-mem** — persistent memory plugin (local vector DB). Gryphon remembers project conventions, user preferences, and past decisions across sessions. Registered via `opencode plugin opencode-mem`, same scope.
- [x] **Sharpened Gryphon prompt** — complete rewrite in global `~/.config/opencode/opencode.json`:
  - Explicit routing rules: trivial lookup → self, moderate lookup → @scout, small edit → self, complex implementation → @warrior, ambiguous architecture → keep and think
  - Token discipline guidelines: Scout <10% cost (use liberally), Warrior ~60-80% (use sparingly), self after 5+ turns without output → ask user
  - Plugin awareness: Graphify and opencode-mem usage instructions baked into prompt
  - Verification discipline: never claim success without confirming, flag unverified, match code style
  - Escalation trigger: if task exceeds DeepSeek capability → suggest premium-gryphon
- [x] Added **premium-gryphon** agent profile — same three-headed workflow but backed by Claude Sonnet 4 (paid, requires `ANTHROPIC_API_KEY` env var). Configured but dormant until key is set. Anthropic provider block added to global config.
- [x] **CodeGraph wired as OpenCode MCP server** — `@colbymchenry/codegraph` was already installed globally (v1.4.1) and configured for Claude Code, but not for Gryphon/OpenCode. Ran `codegraph install --target opencode` and moved the generated config to the correct `.opencode/opencode.jsonc`. Index already built: 55,528 nodes, 191,032 edges across 3,138 files.
- [x] **Routing rules added to Gryphon prompt** — clear logic for when to use CodeGraph (code-level: callers, callees, impact analysis) vs Graphify (concept-level: architecture, entity relationships) vs Grep (simple: symbol lookups) vs Git (recent changes).
- NOTE: All upgrades were done directly from the Gryphon chat session (this environment), not from Claude Code — proving the upgrade loop works without switching tools.

## Current Status
**v1 is shipped and tagged** (v1.0.0 on 83ccb91fa, 2026-07-19). All v1 phases complete:
- Terminal mode with VanGio branding, DeepSeek V4 Flash Free default, Gryphon 3-head orchestration
- Banner (owl + VANGIO wordmark + blink cursor), theme (neon-matrix), marquee description scroll
- Provider switch (manual, mid-session), rebranding (paths, CLI name, legacy migration, text sweep)
- Plugins: opencode-mem (memory), CodeGraph MCP (code intelligence)
- Verification: v1 TUI acceptance passed live under ConPTY harness

**What's next:** v3 (Mobile Remote Control) chosen 2026-07-19 and in progress — notifier code complete (Tasks 1–3), laptop setup mostly done (Task 4); remaining: Tailscale login, service mounts, phone setup, acceptance ritual (see `docs/fork/mobile-control-setup.md`).

**Key deviations from original plan:** (1) WSL2 abandoned — native Windows instead. (2) GLM → DeepSeek V4 Flash Free default. (3) Build order changed: banner first. (4) Code editing in Claude Code; docs remain shared continuity layer. (5) Banner adapted to TUI component architecture (cfonts pre-rendered to static glyphs, no runtime blink). (6) Gryphon upgrades done directly from this chat, not Claude Code.

**Open/unverified items carried forward:** (a) whether DeepSeek/Zen avoids the concurrency bug in a real multi-tool-call session (untested), (b) how long Zen's keyless access lasts, (c) whether opencode-mem works correctly in practice (loads without errors; live behavior unverified).

**Policy: Commit and push more frequently.** Changes pushed to `origin/dev` after every logical checkpoint.
