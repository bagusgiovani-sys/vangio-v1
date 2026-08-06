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
> **RESCOPE NEEDED (discovered 2026-07-29).** Upstream already ships both surfaces this phase
> assumed VanGio would build: `packages/app` (502 files — a SolidJS client with session tabs,
> file tree, embedded terminals, command palette, and settings dialogs for providers/models/
> servers/keybinds) and `packages/desktop` (83 files — an Electron shell that depends on
> `@opencode-ai/app` as a workspace package and is configured with electron-builder for Mac,
> Windows, and Linux). VanGio has changed **zero** files in `packages/app`. The web app is also
> already in use — v3's mobile setup serves it over Tailscale. So v2 is realistically a
> **rebranding pass plus whatever is genuinely missing**, closer in size to Phase 8 than to a
> ground-up build. Re-plan before starting. Related: `settings-models` / `dialog-manage-models`
> are a natural host for v5's paradigm customizer, so v5 has a UI foundation too.

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

### v8 — VanGio (the ecosystem): capability-aware automation — FINAL PHASE, DEFERRED
> Direction set 2026-07-29. **Nothing here is scheduled.** Recorded so the reasoning is not
> re-derived later. Do not start this before v3–v7 land.

**Renaming/positioning decision:** this repository is **VanGio Code** — the coding agent, one
product inside a larger **VanGio** ecosystem. It is no longer "the product"; it is the first one.

**The main VanGio product** is a capability-aware automation AI. The user describes a workflow;
VanGio decides which steps it can actually automate *on this machine, with these models*, assigns
a model to each automatable step, and tells the user plainly which steps they must still do by
hand. Paid models are an option, free models the default. **This is where the Gryphon schema
graduates** — "the right model for each role" stops being a coding-agent detail and becomes the
core principle of the main product.

Worked example the direction came from (a video pipeline): find a niche video → upload → auto
clip and edit → add sound and subtitles → render → upload to YouTube.

**Analysis already done (2026-07-29) — read before designing this:**

1. **Models are not the scarce resource; integrations are.** Of the six steps above, only about
   two need a language model at all. The rest are ffmpeg invocations, a YouTube Data API client,
   and OAuth credentials. A filter that asks "is there a free model for this step?" asks the
   wrong question — it should ask "do I have a *tool plus credential* for this step?"
   Filter on **capability**, not on model availability.
2. **Every free Zen model is text-only** (verified against the live catalog 2026-07-29:
   big-pickle, deepseek-v4-flash-free, laguna-s-2.1-free, ling-3.0-flash-free, mimo-v2.5-free,
   nemotron-3-ultra-free, north-mini-code-free — all text/coding LLMs). None see pixels or hear
   audio. Any video workflow can only reason over *text about* the media — transcripts, titles,
   metadata — which makes ASR (Whisper) a hard dependency rather than a nice-to-have.
3. **Hardware is a first-class constraint, not a footnote.** 16GB RAM, integrated graphics,
   CPU-only. Whisper transcription and ffmpeg rendering are the heaviest steps in that pipeline
   and are exactly the parts no cloud free tier will absorb. "Capability-aware" must mean aware
   of the machine, not just of the model list.
4. **Reliability compounds.** Six unattended steps at 90% each is ~53% end-to-end, before Zen's
   unpublished rate-limit wall (see errors.md watchlist). Long unattended model-driven chains on
   free tiers is where this design fails in practice.
5. **The reframe that makes it work: do not put the model in the hot loop.** VanGio Code is a
   coding agent — its strength is *writing and wiring* automation, not *being* the automation at
   runtime. So: user describes the workflow → VanGio reports feasibility honestly → VanGio
   **generates the pipeline as a script** (ffmpeg/API calls, with a model invoked only at the
   steps needing judgment) → the script runs deterministically, repeatably, at near-zero cost.
   This sidesteps the compounding-reliability trap and plays to what the fork is actually good at.

**The genuinely novel part** is the honest feasibility filter: *"steps 1, 3, 4 I can automate;
2 and 6 need YouTube credentials you haven't set up; 5 will take ~8 minutes per video on your
hardware."* Zapier/n8n show thousands of integrations and let you discover the gaps yourself.

**Open scope question, unresolved:** is this VanGio Code v8, or a separate product that merely
uses VanGio Code? Today the fork inherits an agent loop, tool system, TUI, web app, and desktop
shell for free by tracking OpenCode. An automation platform inherits far less of that leverage,
and it pulls against the BRD's "solo dev, personal use first." Decide before building.

#### Added 2026-08-06 — the workflow run view, and where the moat actually is

Two things were established in discussion and are recorded here so they are not re-derived.

**1. A new requirement that changes the architecture: the visual workflow run.** On approving a
plan ("ok let's do this workflow"), the user gets a step-by-step view showing which steps are
done and which are not. Point 5 above says "generates the pipeline as a script" — **a script has
no state.** It cannot report that it is on step 3 of 7, cannot show what is blocked, cannot be
resumed tomorrow. This requires a **run model**: steps as records, per-step status, artifacts,
persistence. It is a real addition, not a skin over the generated script. The surface for it
already exists — `packages/app` (502 files, desktop-class web client, zero files changed by
VanGio) wrapped by `packages/desktop` (Electron). A run view is a new page in something we
already own.

**2. Competitive position, checked 2026-08-06 — the product is a planner, not an executor.**

| | What it does | What it assumes |
|---|---|---|
| n8n | Executes a workflow you built by hand in a node graph | You already know what is automatable |
| OpenClaw | Executes what you ask, now, from a chat app | You already know what your machine can do |
| VanGio | **Reports what is possible before you commit**, then builds it | Nothing — that is the point |

**OpenClaw** (Peter Steinberger; shipped Nov 2025 as Clawdbot, renamed Jan 2026; MIT; >250k
GitHub stars in ~60 days) is an autonomous agent that runs on your machine and is driven from
WhatsApp/Telegram — shell, browser, files, email. It is not a model; it wraps one and gives it
hands. Notably **its memory is markdown files on disk**, which independently matches the profile
decision recorded in session 18.

Neither n8n nor OpenClaw probes the machine and reports honestly on what it cannot do. That
remains unoccupied ground.

**Therefore the three layers, with very different economics:**
- **Planner** (decompose goal → probe device → classify automatable vs manual → report honestly)
  — the entire moat. Build this.
- **Executor** (actually run the steps) — **commodity, and where a solo project dies.** n8n has
  400+ integrations from a funded team; OpenClaw has hands plus an MIT community skill format.
  Do not rebuild this. Point 5's "generate, don't be the runtime" conclusion stands: emit a
  script, an n8n import, or an OpenClaw skill.
- **Tracker** (the run view from (1)) — what makes it feel real to a user.

**Standing risk to design against:** the tracker is the easiest layer to build and the most
impressive to demo, so it will feel like the product works before the hard part does. The hard
part is the device probe being *right*. The first time it claims a step is automatable and it is
not, the honest-feasibility promise — the only thing here that Zapier and n8n lack — is gone. The
probe must be conservative to the point of pessimism and built on real checks (`ffmpeg -version`,
does the OAuth token exist, actual RAM) rather than a model's opinion about what is installed.

**Note on sequencing:** in conversation these collapse into one product — "an LLM that builds AI
agents, which then checks the device and splits manual from automated." On this roadmap that is
v6/v7 (assisted, then autonomous paradigm generation) *plus* v8. All three are operations on the
**paradigm object**, which is why the paradigm layer is the prerequisite for every one of them.

**Parked idea (not adopted):** a front-door split in the web app between "Vibecoder" and
"Programmer / dev AI tools" paths. It is a packaging decision and only becomes meaningful once
there is a differentiated product to package.

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
| 10 | 2026-07-18 | (Claude Code) Global `vangio` command created: launcher shims in `~/.bun/bin` (`vangio.cmd` for PowerShell/cmd, `vangio` sh script for Git Bash) run the source entry `packages/opencode/src/index.ts` via `bun run --conditions=browser` WITHOUT changing cwd — so `vangio` opens whatever project folder you're standing in. Replaces typing `bun dev` from the repo. Verified from home dir in both shells (`vangio --version` → `local`, exit 0) | **SUPERSEDED 2026-07-20 (session 14)** — this shim design was broken for the TUI; see the "Global `vangio` command" section below for the current one, and do NOT recreate the version described here. Shims are machine-level files (hardcode this repo's absolute path), NOT in the repo — recreate them if the repo moves or on a new machine. `bin/vangio` npm launcher is unusable from source (hunts for a prebuilt platform binary). **Note the verification gap that let the bug through: `vangio --version` was accepted as proof, and it never loads the TUI** |
| 11 | 2026-07-19 | (Claude Code) Plugin-stall investigated + resolved (one-time cold npm install, not a bug — errors.md), graphify removed (incompatible with current plugin API, no fixed release; CodeGraph MCP covers it), **v1 TUI ACCEPTANCE PASSED** live under ConPTY harness: banner byline + owl glyphs render, DeepSeek V4 Flash (free) via OpenCode Zen shown as default (migrated config live), Tab cycle Build→Gryphon→Plan works with Gryphon marquee scrolling, `⊙ 1 MCP` indicator (codegraph) visible, boot log clean of plugin errors, clean Ctrl+C exit | Theme not explicitly asserted (harness strips color codes), but migrated `tui.json` is the active theme mechanism per boot log. v1 phase list is now fully done+verified — next step is the user's call: tag/ship v1 or pick a post-v1 item |
| 12 | 2026-07-19 | (Claude Code) **v3 Mobile Remote Control started** — Tasks 1–3 of the mobile-session-control plan DONE via TDD: new `packages/notifier` (watcher decision logic, ntfy transport, plugin entry), 23 tests green + full-repo typecheck clean, 3 commits pushed (341194f26, e0ff54d43, 7924430c0). Task 4 partial: plugin bundled to `~/.config/vangio/plugins/vangio-notifier.js`, `VANGIO_NTFY_TOPIC` secret generated + set (User env), ntfy pipeline proven (HTTP 200), power settings verified already correct (lid=do nothing, AC sleep=never — hidden LIDACTION unhidden to check), Tailscale 1.98.9 installed; setup guide created (`docs/fork/mobile-control-setup.md`). **Notifier VERIFIED END-TO-END against live `vangio serve` sessions — BOTH notification paths**: (a) `Done - vangio-v1 / Session finished after 8 s` (priority 3) from a real completed session, and (b) the critical `Needs approval - vangio-v1 / bash: echo hello-from-vangio` at **priority 5 (max, DND-bypassing)** from a real gated shell command, with a tap-through click URL whose base64 segment decodes to the correct project path. Mobile approve/deny UI confirmed usable by the user, clearing spec §9.2's blocking-defect risk. Session-start cleanup: orphaned `launcher-test.ts` probe deleted | Plan deviations forced by post-plan reality (recorded in guide + commits): bundle target is `vangio` not `opencode` dir; plugin must default-export `{ id, server }` (v1 PluginModule shape — legacy path would call every named export as a plugin); `noUncheckedIndexedAccess` needed `!` in tests; tsconfig needs DOM libs. Live verification also caught a real bug (see errors.md): notifications were silently lost because the host fires event hooks fire-and-forget and the process can exit mid-POST — fixed with a `dispose` drain; note `vangio run` still can't deliver (exits too fast), `vangio serve` is the verified path. REMAINING (user): `tailscale up` login, VANGIO_CLICK_BASE_URL, serve + web app + tailscale serve mounts, phone setup, acceptance ritual |

| 13 | 2026-07-20 | (Claude Code) Stale-plan-doc sweep, triggered while summarizing the plan for export. BRD: fork base corrected OpenClaude → OpenCode (one-liner + paid-API aside), Windows setup rewritten (WSL2 was still listed as the chosen path), default-endpoint open question closed as RESOLVED (DeepSeek via Zen), pre-launch blocker rewritten from "support native Windows without WSL2" (already true) to "clean installer/onboarding" — and it now records that the current `~/.bun/bin` shims hardcode this repo's absolute path, so they aren't shippable. OVERVIEW: §5 reordered to show v3 in progress / v2 deferred-not-cancelled, §7 Steps 9–10 marked DONE with a pointer that build-progress "Current Status" is the live queue, not that list. PRD: one stale WSL2 mention in a user story | No code touched — docs only. Per the README precedence rule (build-progress/errors are current-state truth; BRD/PRD/SDD are intended design and go stale), these were contradictions, not disagreements. BRD's remaining OpenClaude mentions are intentional: it's a real reference product and the record of why OpenCode was chosen over it |

| 14 | 2026-07-20 | (Claude Code) **Global `vangio` command fixed.** User hit `Cannot find module 'react/jsx-dev-runtime'` running `vangio` from another project. Root-caused by controlled experiment, not inspection: bun resolves `jsxImportSource` from the tsconfig nearest **cwd**, not nearest the transpiled file, so the TUI's `@opentui/solid` setting was invisible from any folder except `packages/opencode` — it failed from the repo root too, so the other project's React config was never the cause. Fix: new tracked `script/vangio-launcher.ts` + rewritten sh/cmd shims that pin `--cwd packages/opencode` for bun and `chdir` back to the invocation directory (restoring `PWD` so `vangio ..` still resolves). Also started the v3 mobile work this session: steps 7–9 verified, step 10 blocked on a tailnet Serve admin toggle | Verified with the real command from KodeHub, repo root, and home; plus `vangio ..`, `--version`, `models`, and `serve` (whose `/path` confirmed worktree = invoking folder). Rejected: `--tsconfig-override` (build-only, runtime ignores it), per-file `@jsxImportSource` pragmas (103 files in packages/tui, permanent upstream-merge conflict), compiled binary (fixes cwd but goes **silently stale** after source edits — wrong trade while the fork is under active development). Root lesson recorded in errors.md: `--version` is not proof a launcher works, it exits before the TUI loads |

| 15 | 2026-07-29 | (Claude Code) **First upstream merge since the 2026-07-16 fork point.** 220 upstream commits merged on branch `merge/upstream-2026-07-29` → exactly ONE conflict (`session/prompt/meta.txt`: VanGio had swapped 5 branding lines, upstream rewrote the whole file into new sections — resolved by taking upstream's version and re-applying the branding). Verified: `bun install` clean, `bun typecheck` 31/31 including `@vangio/notifier`, notifier 24/24 + legacy-dirs 5/5 + permission.shared 5/5 tests pass, and a real TUI launch under the ConPTY harness renders the owl, wordmark, byline, `Build ·DeepSeek V4 Flash (free) OpenCode Zen·` with marquee, and `⊙ 1 MCP` with no notifier errors. Then a post-merge inspection fixed 15 home-screen tips that taught the wrong CLI name and config paths (`opencode run/serve/upgrade/...` → `vangio ...`, `~/.config/opencode/tui.json` → `~/.config/vangio/`, `.opencode/{commands,agents,tools,plugins,themes}/` → `.vangio/...`) | **Fork is 2.5% of the codebase** — 78 of 3,090 source files touched, only 13 of them new. That thinness is why 220 commits produced one conflict. **Two roadmap discoveries:** upstream already ships `packages/app` (502 files — the web app VanGio serves to the phone, 0 files changed by VanGio) and `packages/desktop` (83 files — a full Electron app with electron-builder Mac/Win/Linux targets), so v2 is largely a rebrand, not a build. **New watchlist item** in errors.md: `.vangio` project-dir support is patched into only one of two live config paths — verified working today, but silently at risk when upstream finishes its v1→v2 config migration |

| 16 | 2026-07-29 | (Claude Code) **Product positioning set: this repo is VanGio Code**, the coding agent and first product in a **VanGio** ecosystem. The eventual flagship is a capability-aware automation AI that matches workflow steps to available models AND hardware (free default, paid optional) — the Gryphon "model per role" principle graduating from a coding-agent detail into the main product's core. Recorded as **v8, deferred**, with the full supporting analysis (integrations not models are the bottleneck; all 7 free Zen models are text-only; hardware is a first-class constraint; reliability compounds across unattended steps; generate pipelines rather than drive them live). BRD/PRD/OVERVIEW renamed to VanGio Code with pointers to the v8 section | No code touched — positioning + roadmap only. The unresolved scope question is recorded rather than answered: whether v8 is VanGio Code's final phase or a separate product that merely uses it. Parked without adopting: a "Vibecoder vs Programmer" front-door split in the web app |

| 17 | 2026-08-02 | (Claude Code) **Known-drift cleanup — the three items session 16 flagged as "clean up regardless of the paradigm decision".** (1) **Graphify fully purged from the live Gryphon prompt** in `~/.config/vangio/opencode.json`: the tool-description block, the `/graphify .` instruction, and BOTH knowledge-tool routing references (rule 1's "NOT CodeGraph or Graphify" and rule 3, which pointed concept-level questions at it). The plugin was removed 2026-07-19 as incompatible with the plugin API, so for two weeks the prompt had been instructing the model to run a tool that does not exist. Rule 3 now routes to a broad CodeGraph query + `docs/fork/OVERVIEW.md`, and says explicitly that no concept-graph tool exists so the model stops hunting for one. (2) **`premium-gryphon` promoted from a 337-char stub to the full paradigm (4,047 chars)** — it previously said "same three-headed workflow as standard Gryphon" *without restating any of it*, so the PAID path silently ran on weaker instructions than the free one. It is now Gryphon's prompt with only the King head swapped, plus paid-specific discipline (delegating matters MORE when your own tokens cost money) and a rewritten ESCALATION section (it IS the escalation target — nothing stronger to hand off to). (3) **`docs/fork/CONFIG.md` paths corrected** to `~/.config/vangio/` and `~/.local/share/vangio/`, CLI examples to `vangio ...`, graphify dropped from the plugin example with a do-not-re-add note | Live config is a machine-level file, NOT in the repo — backed up before editing and verified after by loading it through the real engine (`debug config`): both prompts parse and are Graphify-free at runtime. This is the shape the paradigm work will formalize: fixing premium-gryphon meant *copying* a prompt and swapping one line, which is exactly the "heads are not independently addressable" defect that motivates the paradigm layer. **The 224-commit push is still blocked** — GitHub rejects it because the merge carries upstream's `.github/workflows/publish.yml` and the stored OAuth credential lacks `workflow` scope. Note `git push --dry-run` **succeeds** against this block, so it is not a valid test |
| 18 | 2026-08-06 | (Claude Code) **One source of truth for user context — `~/.config/vangio/AGENTS.md` created.** The complaint was that no AI tool reliably knows who the user is or what they are building across projects, so they hallucinate context and the background gets retyped every session. **No new machinery was needed: the mechanism already existed and the file simply did not exist.** `packages/opencode/src/session/instruction.ts:60-63` defines `globalFiles = [~/.config/vangio/AGENTS.md, ~/.claude/CLAUDE.md]`, loaded by `systemPaths()` (`:115-120`) on every session in every project, ahead of any project-level `AGENTS.md`/`CLAUDE.md`; first existing file wins (`break`), so the two are alternatives, not additive. `~/`-prefixed entries in the config `instructions` array are also expanded (`:138`), so more files can be added later with no code change. Wrote a ~60-line profile (identity, machine constraints, 6 hard rules, model/privacy posture, verification rules, paths/remotes, working preferences) and pointed `~/.claude/CLAUDE.md` at it via a single `@~/.config/vangio/AGENTS.md` import so there is exactly one copy and no drift. **Also logged retroactively: paradigm layer Task 1 shipped 2026-08-02** (`ff6bc6ce` plan, `d4bd1fa3` schema + 5 tests, `0fdeca59` lockfile) — `packages/paradigm/src/schema.ts` with open-ended head count. Task 2 (the compiler) is next | **Verified live in both clients from `$HOME`, outside this repo** — testing inside the repo proves nothing, since project-level instruction files could supply the answer. `claude --print` returned the OS setup and the no-AI-attribution rule, and explicitly noted the profile overrides its own harness instruction to add a `Co-Authored-By` trailer. `vangio run` on `deepseek-v4-flash-free` returned the OS setup and the Zen-free-tier privacy rule. Both files are **machine-level and outside version control** — this row is the reproduction recipe after an OS reinstall. Deliberately NOT built: conversation-archive search over `~/.local/share/vangio/opencode-local.db`. Every session from every project is already in that one DB (`project`/`session`/`message`/`part` tables), so search is cheap to add later — but it addresses recall, not identity, and would not have fixed this |

---

## Phase 6.7 — Gryphon Upgrades: Plugins + Sharper Prompt + Premium Brain (2026-07-17)

> **PARTLY SUPERSEDED — read before trusting this section.** Two things below are no longer true:
> (1) **Graphify is gone.** Removed 2026-07-19 (incompatible with the plugin API); its last traces
> were purged from the Gryphon prompt in session 17 (2026-08-02). Do not re-add it.
> (2) **The config path moved.** Phase 8 rebranded `~/.config/opencode/` → `~/.config/vangio/`;
> paths quoted below are what was live in July, not where to look now.
> Also revised in session 17: `premium-gryphon`'s prompt, which was a stub that referenced
> Gryphon's workflow without restating it, now carries the full routing rules and token discipline.

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

## Global `vangio` command — launcher + shims (rewritten 2026-07-20)

Typing `vangio` in any folder runs this fork from source and opens that folder as the project.

Mechanism: the shims start bun with `--cwd <repo>/packages/opencode` so bun reads the tsconfig
that sets `jsxImportSource: "@opentui/solid"` (it resolves that from **cwd**, not from the file
being transpiled — see errors.md 2026-07-20), and pass the invocation directory in
`VANGIO_ORIGINAL_CWD`. `script/vangio-launcher.ts` (tracked in the repo) chdirs back to it, and
restores `PWD` so relative project paths like `vangio ..` still resolve, before importing the CLI.

The two shims are **machine-level** files that hardcode this repo's absolute path — they are not
in the repo. Recreate them if the repo moves or on a new machine.

`~/.bun/bin/vangio` (Git Bash / sh):

```sh
#!/bin/sh
VANGIO_REPO="C:/Exodus/Projects/VanGio-AI Agent/vangio-v1"
VANGIO_ORIGINAL_CWD="$PWD" exec bun run --conditions=browser \
  --cwd "$VANGIO_REPO/packages/opencode" \
  "$VANGIO_REPO/script/vangio-launcher.ts" "$@"
```

`~/.bun/bin/vangio.cmd` (PowerShell / cmd):

```bat
@echo off
setlocal
set "VANGIO_REPO=C:\Exodus\Projects\VanGio-AI Agent\vangio-v1"
set "VANGIO_ORIGINAL_CWD=%CD%"
bun run --conditions=browser --cwd "%VANGIO_REPO%\packages\opencode" "%VANGIO_REPO%\script\vangio-launcher.ts" %*
```

**Verifying a change to any of this: `vangio --version` is NOT sufficient** — it exits before the
TUI module graph loads, which is exactly why the JSX bug survived from session 10 to session 14.
Run the bare default command from a folder outside the repo and confirm it opens that folder.

## Upstream merge policy (added 2026-07-29)

VanGio tracks upstream (`anomalyco/opencode`) rather than hard-forking. Nothing arrives
automatically — `upstream` code only lands when you run `git fetch upstream` +
`git merge upstream/dev` yourself. Leaving the GitHub fork network on 2026-07-18 changed only
the contribution-graph label; the remote still works exactly as before.

**Cadence: merge roughly monthly.** Measured cost at the first merge (13 days, 220 upstream
commits): one conflict, about half a day including verification. Upstream ships ~37 commits/day
and maintains 97.5% of what VanGio runs on, so tracking is overwhelmingly worth it. Postponing a
merge does not avoid the work — it compounds it, because your own reasons for each patch fade.

**Always merge on a branch, never on `dev`:**

```bash
git fetch upstream dev
git checkout -b merge/upstream-YYYY-MM-DD
git merge upstream/dev
# resolve conflicts, then:
bun install && bun typecheck
# per-package tests (root `bun test` is deliberately blocked)
cd packages/notifier && bun test
# THEN the real gate — a TUI launch under the ConPTY harness (.claude/skills/verify/SKILL.md).
# `--version` is NOT proof; it exits before the TUI module graph loads (errors.md 2026-07-20).
```

Only merge to `dev` once the TUI actually renders. If it fails, throw the branch away — you lose
an afternoon, not the project.

**Re-check after every merge:** the `.vangio` project-dir marker test (see the errors.md
watchlist entry) — upstream's v1→v2 config migration will break it silently.

**When to reconsider tracking:** a merge costing 3+ days, an upstream license/direction change,
or the paradigm layer genuinely requiring a rewrite of the agent loop rather than a layer on top.
All three are observable events, not calendar dates.

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

**Standing user profile (added 2026-08-06).** `~/.config/vangio/AGENTS.md` is the single source of
truth for who the user is, the machine's constraints, and the hard rules. VanGio loads it into
every session in every project (`session/instruction.ts:60-63`); `~/.claude/CLAUDE.md` imports it
so Claude Code reads the same copy. **Neither file is version-controlled** — session 18's row is
the recipe to recreate them. Keep it to a page; anything longer belongs in `docs/fork/` and gets
referenced from it.
