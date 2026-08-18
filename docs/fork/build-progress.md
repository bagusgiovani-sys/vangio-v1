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

### v5 — Paradigm Craft — **SHIPPED 2026-08-18**
- [x] `/craft` — a wizard: name → shape → a model per head, hard-filtered against the live
      catalog by what each role actually needs. Writes `~/.config/vangio/paradigms/<name>.json`.
- [x] `/clone` — copy any paradigm under a new name. This is the sanctioned way to customise a
      bundled preset, since `install.ts` overwrites the six bundled filenames on every install.
- [x] Failing models stay **visible** with the reason ("needs 128000 output, has 32000") and are
      refused on selection — never silently dropped from the list.
- [x] 105 tests in `packages/paradigm`, plus live ConPTY verification of both flows.
- **Deliberately NOT built:** field-by-field editing of arbitrary heads, and `/paradigm edit` →
  `$EDITOR`. Both are scoped out in the design spec. Edit a crafted paradigm by hand for now.
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

#### Added 2026-08-06 — model discovery is mostly already inherited; do NOT build a scraper

**Requirement:** the product must search efficiently for which AI models are free and usable
before deciding what an agent can automate and what stays manual work, weighed against the
user's device spec.

**Most of this already exists in the fork.** `packages/core/src/models-dev.ts` fetches
`https://models.dev/api.json` and caches it to `~/.cache/vangio/models.json` (3.5 MB, refreshed
automatically; `Flag.OPENCODE_MODELS_URL` overrides the source). Do not build a scraper, and do
not use web search for this — it is a local JSON query.

Per-model fields, which are exactly the capability filter's inputs (`models-dev.ts:62-95`):

| Field | Use |
|---|---|
| `cost.{input,output}` | free tier detection — both `0` means free |
| `modalities.{input,output}` | `text` / `audio` / `image` / `video` / `pdf` — can it see or hear |
| `limit.{context,output}` | context window |
| `tool_call` | can it drive tools — required for any agent step |
| `reasoning`, `attachment`, `release_date`, `status` | quality/recency filtering |

Precedent already in the codebase: `packages/opencode/src/provider/provider.ts:191-194` drops
paid models with `if (value.cost.input === 0) continue` when no key is present.

**Measured against the live cache 2026-08-06:** 180 providers, 6,149 models; **486 free**
(input and output both 0), **386** of those tool-call capable, **204** accepting non-text input.

**This overturns finding 2 above.** "Every free model is text-only" was verified against the
**Zen catalog only** (7 models) on 2026-07-29. Across the full catalog it is false — free
image/video/audio models exist, e.g. `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`
(text+image+video+audio). Whisper may therefore not be the hard dependency finding 2 assumed.
Do not delete finding 2 — it remains true of Zen, which is what VanGio defaults to.

**Caveats that must survive into the design — free-by-cost is NOT reachable:**
1. `cost: 0` means the catalog lists no price. It does not mean keyless, unmetered, or up right
   now. The NVIDIA and Poe entries need API keys; rate limits are not in the catalog at all.
2. Several "models" in that 204 are specialized vision nets (`bevformer`,
   `active-speaker-detection`, `sparsedrive`), not general-purpose models. The number is an
   upper bound.
3. So the filter needs stages, not one query: **cost → modality → `tool_call` → actually
   reachable with a credential this user holds → observed to work.** Only the first three are
   answerable from the catalog.

**The device half is not in the catalog and has no inherited machinery.** RAM, disk, CPU, GPU,
and whether `ffmpeg` / `whisper` / a given CLI is installed must come from real local probes.
That is the part still to be built, and per the standing risk below it is the part that has to
be right.

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

| 19 | 2026-08-06 | (Claude Code) **The paradigm layer shipped and is LIVE.** Tasks 1–6 of `docs/superpowers/plans/2026-08-02-paradigm-layer.md`, TDD throughout, 26 tests green, typecheck 32/32. New package `packages/paradigm`: `schema.ts` (the paradigm as data, open-ended head count), `compile.ts` (paradigm → agent config entries), `load.ts` (read paradigm files + active marker; malformed files return error strings, never throw), `index.ts` (v1 plugin `config` hook wiring load+compile, config-wins merge). `paradigms/gryphon.json` + `paradigms/premium-gryphon.json` — **`diff` between them is three lines**: name, description, and the king's model. **Zero upstream files modified.** Installed via `packages/paradigm/script/install.ts` (bundles to `~/.config/vangio/plugins/vangio-paradigm.js`, copies paradigms, writes the marker), then the four now-redundant agent entries (`gryphon`, `premium-gryphon`, `warrior`, `scout`) were removed from live `~/.config/vangio/opencode.json`, leaving it with no `agent` key at all | **Verified in the real engine, not by unit tests.** `debug agent`: `build` and `plan` both carry the king's model *and* the compiled doctrine (`PARADIGM: gryphon`, `ROUTING RULES`); `warrior`/`scout` are `mode: subagent` on their own models; **`gryphon` returns NOT FOUND**. TUI under the ConPTY harness: boot shows `Build`, then Tab alternates `Plan → Build → Plan → Build` — **Gryphon never appears**. The paradigm swap works: one marker change moved the king from `deepseek-v4-flash-free` to `claude-sonnet-5`, doctrine included, no prompt copying. **Deviation from plan:** premium's king is `anthropic/claude-sonnet-5`, not the plan's `claude-sonnet-4-20250514` (May 2025, no longer in the catalog's current Anthropic listing). **Also removed `warrior`/`scout` from config, which the plan left optional** — the merge gives config precedence, so leaving them would have made edits to `paradigms/*.json` silently do nothing. **Open item closed honestly: runtime switching does NOT work** — measured, see errors.md. A switch needs a restart; no `/paradigm` live-switch command was shipped. Two errors.md watchlist entries added (v2 API trap; restart requirement) and `.claude/skills/verify/SKILL.md`'s stale "Build → Gryphon → Plan" gotcha corrected |

| 20 | 2026-08-06 | (Claude Code) **Picker feasibility probed; session closed with the decision open.** Second probe on live switching, this time instrumenting the hook itself: a throwaway plugin appended to a log on every v1 `config` hook fire, then the session had its active marker changed, `opencode.json` rewritten, and Tab pressed. **Exactly one fire, at boot.** Combined with session 19's harness result (a running session keeps the paradigm it booted with), live switching is confirmed unreachable through this mechanism. Four options for the status-row picker written up with that evidence in `docs/superpowers/plans/2026-08-06-paradigm-picker-options.md`; recommendation is A+B (display the active paradigm + a picker that applies on restart), C (live switching) parked behind the upstream-tracking question, D (relaunch-and-resume) unprobed | **Nothing implemented — this row records a measurement and an open decision, not a feature.** Probe plugin removed from `~/.config/vangio/plugins/` afterwards; only `vangio-notifier.js` and `vangio-paradigm.js` remain. Worth noting the shape of the finding: the picker looked like a UI task and turned out to be gated on an engine constraint, which is why it was probed before any UI was written |

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

**Paradigm layer is live (2026-08-06).** Gryphon is no longer an agent — it is a paradigm applied
*under* whichever mode is active. Tab cycles **Build → Plan** only; `@warrior` and `@scout` are
subagents. Paradigms live in `~/.config/vangio/paradigms/*.json`, the active one in
`~/.local/share/vangio/paradigm-active`. **Switching requires a restart** (measured — errors.md).
Re-run `bun run packages/paradigm/script/install.ts` after any change to `packages/paradigm/src`:
the plugins dir holds a snapshot, not a live link.

**Status-row paradigm picker (A+B) is SHIPPED — 2026-08-06.** The active paradigm shows at the
right end of the prompt status row, and `/paradigm` (also in the command palette) opens a picker
that writes the marker and says plainly that it applies on restart. A pending switch renders as
`gryphon → premium-gryphon` so the row never claims a paradigm is running when it isn't.

**It cost zero upstream edits.** The options doc assumed A+B meant patching
`packages/tui/src/component/prompt/index.tsx` — permanent monthly merge cost. It doesn't: the TUI
exposes slots, keymap layers and a ready-made select dialog, so the whole feature is a second
VanGio-owned plugin (`packages/paradigm/src/tui.tsx` + `picker.ts`). The only trade is position —
the `home_prompt_right` / `session_prompt_right` slots render at the right end of the row rather
than beside the model.

**Writing a TUI plugin — three things that are not obvious** (all measured, all in errors.md):
1. **TUI plugins are NOT auto-discovered from the plugins dir.** That glob is server-only; a tui
   plugin must be declared in `~/.config/vangio/tui.json`'s `plugin` array. `install.ts` now does
   this idempotently.
2. **A module exports `server()` or `tui()`, never both** — hence two bundles.
3. **The bundle must not carry its own Solid** — `solid-js`/`@opentui/*` stay `external` so the
   host maps them to its live modules; `@opentui/solid/bun-plugin` does the JSX transform.

Verified under the ConPTY harness against all six acceptance criteria, including
`debug agent build` reporting `anthropic/claude-sonnet-5` after picking `premium-gryphon` and
restarting. Live switching (option C) remains **rejected** — unchanged by this work, since nothing
here touches agent resolution. Option D (relaunch-and-resume) stays unprobed unless the restart
notice proves annoying in real use.

**Standing user profile (added 2026-08-06).** `~/.config/vangio/AGENTS.md` is the single source of
truth for who the user is, the machine's constraints, and the hard rules. VanGio loads it into
every session in every project (`session/instruction.ts:60-63`); `~/.claude/CLAUDE.md` imports it
so Claude Code reads the same copy. **Neither file is version-controlled** — session 18's row is
the recipe to recreate them. Keep it to a page; anything longer belongs in `docs/fork/` and gets
referenced from it.

---

## Phase 9 - Free-tier fallback: research + design (2026-08-13)

Spec: `docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md`. Design only; nothing
implemented yet, and two questions are still open (Q1 bucket scope, Q2 runtime proof).

- [x] **Scout was bound to a dead model.** Zen retired `north-mini-code-free` 2026-08-12 (upstream
  `1f94d8a3c8`); both paradigms still pointed at it and no layer caught it. Rebound to
  `opencode/ling-3.0-tiny-free`. Full write-up in `errors.md`.
- [x] **models.dev is NOT authoritative for Zen availability** - it carries 26 `opencode` ids
  ending `-free`; Zen publishes 8. The roster in `packages/web/src/content/docs/zen.mdx` at the
  current upstream ref is the authority. Re-check every `*-free` id in `paradigms/*.json` at each
  upstream merge.
- [x] **The Go upsell is a deliberate funnel**, not an oversight: `retry.ts:76-88` mints the
  action, `usage-exceeded-dialogs.tsx` renders it with a 24h re-show timer and a don't-show flag.
  It will not be fixed upstream, which is what makes it fork-differentiating territory.
- [x] **A model swap between retry attempts is reachable** (`processor.ts:640/660-673` +
  `llm.ts:35-48`) - the session layer, NOT the config layer, so the 2026-08-06 live-switch blocker
  does not apply and option C's cost is sidestepped. Read-verified; runtime proof still owed.
- [x] **Zen's free limit is a per-IP daily counter** bucketed by date + the first TWO characters of
  the model id *only when* the model has an explicit `rateLimit`; otherwise every default-limit
  free model shares one budget. Numbers live in the `ZEN_LIMITS` SST secret and no quota header
  ever reaches the client (`handler.ts:300-306`).
- [x] **OmniRoute evaluated on this machine and rejected as a backend for now.** v3.8.48, 1321
  packages, **2.53 GB**, 9 min install. Binds `0.0.0.0` with the default `CHANGEME` management
  password. `providers list` -> "No providers configured"; `/api/free-tier/summary` -> 401;
  `quota` -> "No quota data". Two keyless models tested: one returned HTTP 200 with an empty
  stream, the other 503. Its catalog claims `oc/deepseek-v4-flash-free` has 1M context / 384k
  output when Zen says 200k / 128k. `omniroute stop` orphans a `server-ws.mjs` holding the port.
  Kept as a possible future substrate behind the resolver interface, not a dependency.

### Session state - resume here (2026-08-13)

**Where we stopped:** the fallback spec is written, committed and pushed (`bf6a1545ff`). It is
awaiting the user's review. Nothing is implemented. The next step after the user approves the spec
is `superpowers:writing-plans` to turn it into a task-by-task implementation plan - NOT
implementation.

**Two questions gate the plan; neither is answered:**
- **Q1 - is Zen's daily bucket per-model or shared across all default-limit free models?** Cannot
  be observed (no quota header ever reaches the client). Do NOT burn a day's quota forcing it.
  Instrument the next genuine 429 instead: on the first free-tier 429, immediately issue one
  minimal request to each of the other seven free models and record which also 429.
- **Q2 - does mutating `streamInput.model` in the `set` callback actually change the model on the
  next retry attempt?** Read-verified only (F2 in the spec). Must be proven under the ConPTY
  harness (`.claude/skills/verify/SKILL.md`) before any plan claims the auto path works.
  `--version` is not proof.

**Open decisions for the user:**
- Uninstall OmniRoute, or keep it and connect a couple of provider accounts so its quota API has
  real data? Connecting accounts is the only way to learn whether a non-Zen fallback target is
  actually viable - which is what Q1 makes or breaks.
- If OmniRoute is kept: change the management password off the default `CHANGEME` and bind it to
  localhost instead of `0.0.0.0` before using it for anything.

**Environment left behind by this session:**
- OmniRoute was installed, evaluated, and **fully uninstalled** the same session (user's call, on
  the evidence above). `npm uninstall -g omniroute` removed 1189 packages; the package dir, the
  shims and the `~/.omniroute/` data dir are all gone, and global npm is back to claude-code,
  codegraph, npm and opencode-ai. Nothing of the user's was in the data dir - the `.env` held only
  a self-generated `STORAGE_ENCRYPTION_KEY`. **To re-evaluate:** `npm install -g omniroute` (~2.5
  GB, ~9 min, needs `--fetch-retries`; it failed once with ECONNRESET and left a partial tree that
  had to be removed by hand). Before using it for anything: change the management password off the
  default `CHANGEME` and bind it to localhost instead of `0.0.0.0`. Two operational gotchas worth
  remembering: `omniroute stop` orphans a `server-ws.mjs` process still holding port 20128, and
  `setup-opencode` hard-codes `~/.config/opencode/opencode.json` (wrong dir for VanGio; use
  `--dry-run` and place the output by hand).
- `git fetch upstream` was run: `upstream/dev` is local at `999be62662` (2026-08-12). The roughly
  monthly upstream merge is now ~4 weeks overdue and has not been started. Merge on a branch,
  never directly on `dev`.
- Scout is rebound to `opencode/ling-3.0-tiny-free` in both paradigms and synced to
  `~/.config/vangio/paradigms/`. Active paradigm marker: `gryphon`.

### Session state - resume here (2026-08-14) - SUPERSEDES the 2026-08-13 block above

Q1 and Q2 from the 2026-08-13 block are both STILL OPEN and unchanged. Everything below is new.

**Provider testing - what is now PROVEN vs still unverified.**

- [x] **`zhipu/glm-4.7-flash` is a working non-Zen fallback, verified end to end.** The provider block
  was already in `~/.config/vangio/opencode.json` (named "Zhipu GLM (free, fallback)") and
  `ZHIPU_API_KEY` is already set. Live results: HTTP 200 in 2.4s; it is a *reasoning* model
  (`reasoning_content` present - a low `max_tokens` returns EMPTY content because the budget is
  spent thinking, which is how the first test failed); tool calling works
  (`finish_reason: tool_calls`, correct name and args); and `vangio run --model zhipu/glm-4.7-flash`
  works. 200k ctx / 131k out - a HIGHER output ceiling than deepseek-v4-flash-free's 128k.
- [x] **GLM's free tier is hard-limited to 1 concurrent request** - measured: 3 parallel requests
  gave two 429s and one 200. Fine as a sequential fallback, NOT fine for parallel heads.
- [x] **DESIGN CONSEQUENCE: not every 429 means paradigm shift.** GLM's 429 is a *concurrency*
  limit (retry in a second and it works); Zen's is a *daily quota* (only tomorrow fixes it). Same
  status code, opposite correct response. Current code already handles this correctly - generic
  rate-limit text returns a plain retry (`retry.ts:129-136`) and only Zen's `FreeUsageLimitError`
  mints the shift action. The spec must state this explicitly or a naive "429 -> shift" breaks GLM.
- [x] **OpenCode splits `provider/model` on the FIRST slash** (`packages/opencode/src/acp/config-option.ts:135-141`),
  so nested ids like `openrouter/nvidia/nemotron-3-super-120b-a12b:free` parse correctly.
- [x] **NVIDIA is a first-class provider and is the recommended signup - NOT OpenRouter.** OpenCode
  ships a dedicated plugin (`packages/core/src/plugin/provider/nvidia.ts`) that injects
  `HTTP-Referer` / `X-Title` / `X-BILLING-INVOKE-ORIGIN` headers. Provider id `nvidia`, env
  `NVIDIA_API_KEY`, api `https://integrate.api.nvidia.com/v1`, npm `@ai-sdk/openai-compatible`.
  Free tier: ~1000 credits on joining the developer program, no credit card, **40 RPM** (200 on
  application). **Staleness check PASSED** - fetched the live 102-model list and confirmed all five
  recommended models are present: `nemotron-3-super-120b-a12b` (262k/262k),
  `nemotron-3.5-lightning-30b-a3b` (262k/262k), `nemotron-3-ultra-550b-a55b` (1M/65k),
  `nvidia-nemotron-nano-9b-v2` (131k/131k), `nemotron-3-nano-omni-30b-a3b-reasoning` (256k/65k, images).
  NVIDIA's terms are stricter than the others: trial use only, no confidential data, usage logged.
- [ ] **NOT tested - needs keys the user must create:** NVIDIA, OpenRouter, Google AI Studio, Groq,
  Mistral. NVIDIA is the one to get; one key covers a fallback for all three heads.

**Proposed chains (positions 2+ deliberately cross to a DIFFERENT quota system, so they survive
Q1 resolving to "shared bucket"):**

| Head | 1 (Zen) | 2 | 3 |
|---|---|---|---|
| king | `opencode/deepseek-v4-flash-free` | `zhipu/glm-4.7-flash` (PROVEN, serial only) | `nvidia/nemotron-3-super-120b-a12b` |
| warrior | `opencode/mimo-v2.5-free` | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` (images) | `google/gemini-3-flash-preview` |
| scout | `opencode/ling-3.0-tiny-free` | `nvidia/nvidia-nemotron-nano-9b-v2` | `groq/llama-3.1-8b-instant` |

**Pricing correction:** OpenCode Go is **$5 first month, then $10/month** (upstream `go.mdx` and the
live site). The string at `retry.ts:83` says "starting at $5/month" and is misleading. Go's limits
are $12 of usage per 5h, $30/week, $60/month, and it unlocks the *Pro* models.

**NEW THREAD, not yet specced - the session sidebar ("sessions like a chat room").**
Decision reached: **yes to a chat-room VIEW, no to a chat-room STORAGE MODEL.** "Session" is four
layers - Store (`opencode-local.db`), Model (the `parentID` hierarchy), Loop (`processor.ts` is
keyed on `sessionID`), View. The first three are the agent loop and rewriting them is one of the
three named events justifying a break from upstream. The View is a TUI plugin, and the paradigm
picker already proved that ships with ZERO upstream files modified.
The trap that decides it: **`@warrior` and `@scout` run as CHILD sessions** with a `parentID`;
flattening the list either hides delegated runs or buries real conversations.
Explainer deck published: https://claude.ai/code/artifact/cde8bba4-a814-44f9-823d-82b0e80344d1
Four decisions await the user: (1) do child sessions appear in the sidebar, (2) does a session keep
generating when you switch away, (3) fixed width or collapsible, (4) does it replace `<leader>l` or
sit beside it. Also found: `app_toggle_session_directory_filter` exists in `keybind.ts` but is bound
to `"none"`, so the project-scope toggle is currently unreachable.

**Nothing was written to VanGio for either thread** - the user asked for testing and confirmation
before any change. The only commits this session are the scout fix and documentation.

### Session state - resume here (2026-08-17) - Q2 CLOSED, Q3 OPENED

**Q2 is answered YES and is now guarded by tests.**
`packages/opencode/test/session/retry-model-swap.test.ts` (4 tests, green; 37 pass across both
retry files; `bun typecheck` clean across 32 packages). It reproduces the processor's retry wiring
against the real `SessionRetry.policy` and proves three things: mutating `streamInput.model` inside
the `set` callback changes the model the next attempt goes out on; `set` can see
`action.reason === "free_tier_limit"`, so a swap can be gated on a genuine free-tier wall rather
than on any 429; and successive failures keep swapping, so a fallback chain can be walked.

**It did not need the ConPTY harness, and that is not a shortcut.** The claim was about
`Effect.retry` re-evaluating a closure - precisely what a unit test pins down. The harness is still
owed for the *other* half (below), where it has something real to observe. The test is worth
keeping regardless: it is the regression guard for the monthly upstream merge, because if upstream
hoists the model read above `Effect.retry`, this goes red instead of the feature dying silently.

**Three new findings, and the third one is the reason the spec changed shape (F10/F11/F12).**

1. **An F2 swap lasts exactly ONE loop step.** The agent loop (`prompt.ts:1088`) re-reads messages
   **from the database** every iteration, re-resolves the model from `lastUser.model` (`:1141`),
   and hands `handle.process()` a **fresh object literal** (`:1272`). Nothing carries the mutated
   `streamInput` across the step boundary. A swapped session reverts to the dead model on the next
   tool-call round-trip and eats another 429 plus backoff - every step, for the rest of the turn.
2. **A durable session-scoped model override already exists.** `SessionEvent.ModelSwitched` is
   first-class: `V2Session.switchModel` publishes it, the projector writes the `session.model` JSON
   column, `currentModel()` reads that column ahead of everything else - **and `message-updater`
   already appends a `model-switched` message to the transcript.** That last part is the spec's
   "announce the swap" divider, already built and already rendered. It has been dropped from scope.
3. **But `ModelSwitched` alone does not close the gap either.** The loop reads `lastUser.model`,
   not `currentModel()`; `currentModel()` is only consulted when a *new prompt* arrives without an
   explicit model. So F2 covers the current step, `ModelSwitched` covers the next prompt, and the
   steps in between are covered by neither.

**Q3 - the one open design decision, awaiting the user.** How does a swap survive the step
boundary? Three candidates, written up in the spec's Open Questions with the recommendation:
(1) publish `ModelSwitched` and add one conditional at `prompt.ts:1141` so the loop prefers the
session row - durable, honest, reuses existing machinery, costs a third upstream seam;
(2) rewrite the persisted user message's model - zero prompt.ts changes, but edits history and so
conflicts with honest provenance; (3) ship `auto: false` only - smallest diff, drops the automatic
degradation that motivated the feature. **Recommended: (1)**, which means amending the spec's
Global Constraints to name `prompt.ts:1141` as an allowed seam alongside `retry.ts`/`processor.ts`.

**Q1 (Zen bucket per-model or shared) is unchanged and still open.** Unobservable without a real
429; the instrumentation recipe in the 2026-08-13 block still stands.

**Still untouched from prior sessions:** the upstream merge (`upstream/dev` local at `999be62662`,
2026-08-12) is now ~5 weeks overdue - merge on a branch, never on `dev`. The session-sidebar thread
still has its four decisions awaiting the user. No VanGio source file has been modified by this
work; the only change is one new test file plus documentation.

---

## Phase 10 - Schemata track opened (2026-08-17)

### Session state - RESUME HERE (2026-08-17) - supersedes every earlier block

**The roadmap was resequenced. v4-v6 (schemata) is now the ACTIVE track, ahead of the desktop (v2)
and mobile (v3) surfaces.** User decision. `vangio-project-plan-summary.md` section 7 is rewritten
and is the authority; the rationale is that v5, v6 and v7 are all interfaces onto the schemata data
model, so building the surfaces first means building them twice.

**We are mid-brainstorm on the schemata design (architectural path, `superpowers:brainstorming`).**
Nothing is implemented. The HARD GATE applies: no code until the design is presented and approved.
The immediate next step is the answer to the open question at the bottom of this block, then the
sectioned design, then a spec, then `superpowers:writing-plans`.

#### GRYPHON IS THE OUTER LAYER - added 2026-08-17, late session

Gryphon is not a schemata. It is the layer **above** schemata, and it has two modes:

- **Gryphon Auto** ("ez but noob mode") - the engine picks which model fills king / warrior /
  scout, and swaps models mid-session as quotas run out, without asking. The user never sees a
  schemata.
- **Gryphon Full Control** - the user is asked which schemata to use, and can create a new one or
  modify an existing one, choosing roles and models per head.

**In Full Control, shape is chosen BEFORE roles.** Two shapes, named this session as placeholders
the user will review:

- **Court** - distinct roles, order matters (planner, coder, tester, reviewer...). A king with
  specialised officers.
- **Legion** - interchangeable workers, same task shape, fanned out in parallel.

Both still compile to the same `heads` + `instances` data model from section 1 - Court is several
heads at `instances: 1`, Legion is one head at `instances: N`. The shape question is a wizard
affordance that generates heads; it is not stored as a mode. Confirmed with the user.

**Auto mode needs no new mode system.** The free-tier fallback spec already defines
`"shift": { "auto": true }` per paradigm. Gryphon Auto *is* that toggle raised to the top level and
given a name, combined with capability-aware model selection. One mechanism, not two - do not build
a parallel mode subsystem.

**One ambiguity flagged, not yet resolved:** "the engine decides who's king" can mean either
(a) the engine picks which *model* fills each fixed role, using needs + live availability + quota -
which is the resolver we are already designing and is achievable now; or (b) the engine derives the
*team composition itself* from the task, which is v7 autonomous generation. Working assumption is
(a). Confirm with the user before planning Auto mode.

#### Decisions already taken - do not relitigate

1. **Shape.** King mandatory and non-negotiable; minimum 2 heads; up to 6 heads below the king.
2. **Both team shapes are user-selectable** per schemata: a *pipeline* of distinct roles (planner,
   coder, tester, reviewer, documenter, researcher) where order matters, OR interchangeable
   *workers* of one kind that the king slices a task across.
3. **Parallelism is a posture, not a mode.** The schemata declares which heads *may* run in
   parallel plus a default posture; the king decides per task. Rejected: baking sequential-vs-
   parallel in at creation time, because the right shape is a property of the task, not the team.
   **Default posture is sequential** until Q1 is answered.
4. **Heads declare `needs`, not model lists.** The engine filters the live catalog; the user picks
   a role and is offered the 3-5 models that fit and are alive. Never a list of 100.
5. **Curated recommendations ship as JSON** the TUI can read, not prose only - v6's builder needs
   machine-readable recommendations, and prose can be generated from data but not the reverse.
6. **The agent loop will NOT be rewritten.** The user proposed it; the argument that settled it is
   that the loop is stateless between iterations *by design* - it rebuilds from SQLite every pass,
   which is exactly the property that lets multiple clients drive one session, which is what v3
   mobile needs. Rewriting it to hold state in memory would delete v3. The model-durability problem
   it was meant to solve is a one-line DB write instead (Q3 below).

#### What the engine ALREADY provides - verified 2026-08-17, do not rebuild

- **Per-agent models** - OpenCode agents already carry their own `model`.
- **Parallel subagents** - the `task` tool already takes `background: true`, backed by a fully
  wired `BackgroundJob.Service` (`start`/`wait`/`extend`/`cancel`/`waitForPromotion`); tool calls
  within one turn already dispatch as concurrent fibers. **Swarm mode is not a subsystem to build.**
  Gryphon's routing rules simply never mention `background`.
- **Durable per-session model override** - `SessionEvent.ModelSwitched` writes the `session.model`
  column AND appends a `model-switched` message to the transcript.
- **Model-neutral session storage** - the "vault" idea is already how it works; sessions are stored
  as provider-neutral records and translated per-model at call time. What actually breaks across a
  model swap is capability mismatch (context size, images, output ceiling), not storage.
- **Capability catalog** - models.dev, already consumed.

**Differentiation, sharpened:** it is NOT multi-agent teams or parallelism (Kimi K2.6 swarms to 300
sub-agents; Claude Code and OpenCode both have subagents). It IS capability-aware selection against
a live catalog plus honest degradation when a free tier ends. OpenCode cannot close that gap - its
free-limit response is a deliberate Go upsell funnel, not an oversight.

**Kimi comparison, for the record:** K2.6's Agent Swarm decomposes server-side, inside one model
family. Gryphon decomposes outside the model, so each head can be a different vendor. Different
layers, not competitors.

#### Work completed this session

- **Q2 CLOSED - the retry-time model swap is proven.** `packages/opencode/test/session/retry-model-swap.test.ts`,
  4 tests green. Commit `3f7b7d817e`.
- **F10/F11/F12 found** - the swap lasts one loop step; a durable override already exists as
  `ModelSwitched`; but neither covers the steps in between. Spec updated.
- **`docs/fork/model-index.md` written** - commit `f9ec1dbe38`.
- **Scout rebound off a second dead model** - commit `2f2b2099be`, errors.md entry 2026-08-17.
- **Roadmap resequenced** - commit `68c6aa566a`.

#### Model reality - the short version (full detail in model-index.md)

- **Only Zen and Zhipu work today.** Everything else needs a signup. **NVIDIA is the one to get**
  (~1000 free credits, 40 RPM, no card, first-class OpenCode plugin).
- **Ruled out:** Groq (6,000 TPM cap - one 30k-token request blows a full minute), Cerebras (8k
  free context), Mistral (limits unpublished, unverifiable from outside).
- **Zhipu is 1-concurrent by contract** - never bind it to a head that runs in parallel.
- **Exactly one free model accepts images:** `mimo-v2.5-free`.
- **For implementer roles the binding constraint is output ceiling, not context.**
  `nemotron-3.5-lightning-free` at 262k output is the standout.

#### Design APPROVED so far (brainstorming, architectural path)

**Section 1 - data model. APPROVED.**
- `packages/paradigm/roles.json` - curated role catalog, **bundled with the plugin, NOT copied to
  `~/.config/vangio/`**. Copying would let a reinstall silently overwrite user edits - the same
  class of bug as the path-rebrand orphaning. `picks` are candidates checked against the live
  catalog at read time; retired ones are dropped and logged once.
- Schemata extends today's `Paradigm` with `parallel: { posture, may }`, per-head `needs`,
  `needsOverride: "<reason>"`, and `instances: N`.
- **`instances` replaces a stored pipeline/workers mode.** Court = several heads at 1, Legion =
  one head at N, and they can be mixed. Maps 1:1 onto `task` + `background: true`.
- **`needs` has exactly four fields:** `minContext`, `minOutput`, `tools`, `attachment`. Paid-vs-
  free is a schemata-level `allowPaid: false`, not a need - it is a wallet policy, not a capability.
- **Hard-filter with override. APPROVED.** Model fits needs → fine. Fails needs + `needsOverride`
  → warning, runs. Fails needs, no override → validation error. **Absent from the live catalog →
  validation error that override CANNOT suppress.** Override means "I know it is underpowered",
  never "this model does not exist". Override requires a reason *string*, not `true`.

**Section 2 - TUI surface. APPROVED.**
- The 2026-08-06 picker already does switch + display-active with zero upstream edits. Reuse it.
- **Do NOT rename anything on disk.** `~/.config/vangio/paradigms/`, the `paradigm-active` marker
  and `packages/paradigm` all stay; the TUI says "schemata". Precedent: `opencode.json` was
  deliberately never renamed. Hard rule #5 makes a cosmetic path rename a bad trade.
- Commands: `/schemata` (exists, relabel), `/schemata new` (wizard), `/schemata clone`,
  `/schemata edit` → opens the JSON in `$EDITOR`.
- **Field-by-field TUI editing is deliberately out of scope** - a form builder for arbitrary heads
  is a large UI to own against monthly merges. `$EDITOR` is honest and free.
- Wizard order: name → **shape (Court/Legion)** → heads → model per head (hard-filtered, ordered by
  `picks`, `why` shown as row description) → parallel posture.
- **Bundled presets are read-only; editing one clones it first.** `install.ts` copies
  `paradigms/*.json` over config, so in-place edits of a bundled preset get silently reverted.
  User-created files have unique names and survive (install only copies, never deletes).
- Restart semantics: creating and cloning need no restart; switching does (measured 2026-08-06);
  **editing the ACTIVE schemata does, and that must be said at the point of edit.**
- **VERIFY BEFORE PLANNING:** the wizard chains multiple dialogs. `tui.tsx:40-42` documents that a
  dialog must be pushed synchronously inside the handler or the keymap layer clears the stack. A
  single dialog is proven; a *sequence* is not. Prove chaining under ConPTY first. Fallback if it
  fights the stack: one dialog that scaffolds a default file and hands off to `$EDITOR`.
- Text input is available - copy the `value` + `onConfirm` pattern from
  `packages/tui/src/component/dialog-session-rename.tsx`.

#### Open questions, in priority order

- **Auto-mode ambiguity (see the Gryphon block above)** - does "the engine decides who's king" mean
  model selection for fixed roles (assumed, achievable now) or team composition from the task (v7)?
  Confirm before planning Auto mode.
- **Shape names `Court` / `Legion` are placeholders** the user will review.
- **Q1 - is Zen's daily bucket per-model or shared?** Unchanged, unobservable, and now
  **load-bearing**: it decides whether parallel heads are viable on free tiers at all. Instrument
  the next genuine 429; do not force one.
- **Q3 - how does a model swap survive the loop-step boundary?** Recommendation: publish
  `ModelSwitched` plus one conditional at `prompt.ts:1141`, which needs the spec's Global
  Constraints amended to allow that third seam. Awaiting the user.
- **Session sidebar** - four decisions still parked, untouched this session.

#### Environment left behind

- Working tree clean, everything pushed to `origin/dev`.
- Scout now on `opencode/laguna-s-2.1-free` in both paradigms, synced via
  `bun run packages/paradigm/script/install.ts`. Active paradigm marker: `gryphon`.
- `~/.config/vangio/opencode.json` (NOT version-controlled) had the dead `north-mini-code-free`
  removed and laguna / lightning / ultra added.
- Upstream merge still ~5 weeks overdue at `999be62662`.

#### Base runtime re-evaluated — staying on OpenCode (2026-08-17)

User raised DeepSeek Harness (`dsh`) as a possible replacement base. Evaluated as a spike; full
reasoning and citations are in `vangio-project-plan-summary.md` § 7. **Outcome: do not switch.
Ship Gryphon on OpenCode, then port it to dsh as a plugin later.**

The decisive fact: **dsh has no automated model capability catalog** — modalities are hand-declared
per endpoint and `contextWindow` is a hand-written config value. VanGio's differentiation is
capability-aware selection against a *live* catalog, which OpenCode supplies via models.dev. On dsh
the resolver would have no data source at all.

Also weighed: dsh ships a web UI with no official TUI (the terminal UI is a four-day-old
third-party Rust/ratatui plugin); it is a developer preview promising breaking changes; and 64
commits across 34 packages plus the approved schemata design assume OpenCode's `Catalog`/plugin API.

**Two things to carry forward:**

1. **The resolver must be a pure function over an injected `ModelInfo[]`**, never reaching into
   `Catalog.Service` directly. Amends Section 3 below. Testable without a live catalog, and
   portable to any runtime that can supply a model list — this is what keeps the dsh port cheap.
2. **dsh is a distribution target, not a base.** Revisit only after it hits a stable release.

**Fair to OpenCode's critics:** dsh genuinely fixes real pain here — the `config()` hook's errors
are swallowed by `Effect.ignore` at `packages/opencode/src/plugin/index.ts:241-249`, and hard rule
"patch, don't rewrite" exists because the core resists modification. Those are OpenCode costs we
are choosing to keep paying, not pretending away.

---

## Phase 10 (cont.) — Section 3 of the schemata design presented (2026-08-17)

**Section 3 — the resolver. PRESENTED, awaiting approval.** Verified against the engine:

- `needs` maps cleanly onto real catalog fields: `minContext`→`limit.context`,
  `minOutput`→`limit.output`, `tools`→`capabilities.tools`,
  `attachment`→ non-`text` entries in `capabilities.input[]` (`packages/schema/src/model.ts:60-86`).
- `Catalog.model.available()` (`packages/core/src/catalog.ts:210`) already returns only models whose
  provider has credentials and which are `enabled` — the candidate list is a method call.
- **The resolver runs at authoring time, never at startup.** `config()` fires during plugin
  construction wrapped in `Effect.ignore`, so errors there are invisible; and the catalog is itself
  populated by a plugin (`packages/core/src/plugin/models-dev.ts`), so it may be unsynced at that
  moment. Boot-time resolution would be both silent and racy.
- Drift detection reuses the `event` hook — `models-dev.refreshed` / `Catalog.Event.Updated` fire
  after startup with the client live, so an audit there can actually be reported.
- **Absence is three states, not two:** in `all()` but not `available()` = exists, no API key
  (actionable); missing from `all()` = retired (the unsuppressable error). Different fixes.

**Two corrections to previously approved sections:**

1. **`allowPaid: false` cannot be implemented as "cost is zero."**
   `packages/core/src/plugin/models-dev.ts:14-20` defaults absent cost data to
   `{input: 0, output: 0}`, so a genuinely free model is byte-identical to one with unknown
   pricing. Fail closed — treat unknown cost as paid, and say so in the message.
2. **Ranking should follow `Catalog.model.small()`** (`catalog.ts:249-286`), which already
   implements weighted filter-then-rank (normalised cost 0.8 / age 0.2). Hard-filter on `needs`,
   then rank survivors by `picks` order first, capability headroom second. Do not invent a new
   scoring scheme.

---

## Phase 10 — Naming SETTLED (2026-08-17)

**User decision. This supersedes the "Gryphon is the outer layer" block earlier in Phase 10 and
the Gryphon Auto / Gryphon Full Control mode names. Full table in
`vangio-project-plan-summary.md` § 7.**

- **Gryphon = the ENGINE.** Rationale, from the user: a gryphon is a hybrid creature — eagle and
  lion — and a paradigm is a hybrid too (Zhipu *and* NVIDIA *and* Zen as one animal). The name
  encodes the core mechanic. It also stays the name of the default bundled paradigm and the mascot.
- **Schemata = the CONTAINER**, the library of paradigms. Note this is the reverse of the earlier
  reading, and it matches the existing disk layout exactly: `~/.config/vangio/paradigms/` is the
  schemata, each `<name>.json` in it is one paradigm. **No rename, no migration.**
- **A paradigm = one team config** (a king plus heads).
- **Paradigm Shift = the automatic mode.** Ships in two stages — see below.
- **Paradigm Craft = the manual mode.** The user authors and selects a paradigm. v5 deliverable.

**Rejected for the manual mode, and why it matters:** *Lock*, *Hold*, *Anchor*, *Fixed*. Model
swapping is always on in BOTH modes, so any name promising stillness would be false the first time
a free tier died mid-session. The axis is *who composes the team*, not whether models move.

### Paradigm Shift splits across versions — this resolves the auto-mode ambiguity

The open question from earlier in Phase 10 — does "the engine decides who's king" mean (a) picking
models for fixed roles or (b) deriving the team composition itself — is **answered: (b)**, the
stronger reading. Consequence:

- **Stage one (v4–v6, buildable now):** always-on model swapping when a quota dies. The fallback
  spec's `"shift": { "auto": true }` already names this.
- **Stage two (v7):** Gryphon composes the paradigm from the user's stated goal. This is the v7
  autonomous-generation row. **Not a v4–v6 deliverable** — do not scope it into the current track.

### Open naming item

**Court / Legion** (the two shapes chosen before roles in Craft) are still placeholders.

---

## Phase 10 — v4 paradigm templates shipped (2026-08-17)

**Four new paradigm templates plus the role catalog. All parse and compile against TODAY's schema —
v4 was not blocked on the schema extension after all.** Verified: `bun test` in `packages/paradigm`
38/38 green, and all six paradigms load and compile through the real `listParadigms` +
`compileParadigm` path with zero errors.

### The rule that fixes the role catalog's size

**A role exists only when it needs a different model CAPABILITY — not merely a different
instruction.** "Documenter", "reviewer" and "tester" are a warrior with a different prompt and a
different model bound, so they are not roles. Only `seer` earns a new name, because no prompt can
make a text-only model see a screenshot.

That gives exactly four roles, and they map 1:1 onto the four approved `needs` fields:

| Head | Job | Binding constraint |
|---|---|---|
| `king` | plans, decides, reviews, delegates. Mandatory | `minContext` |
| `warrior` | produces the artifact — code, docs, copy | `minOutput` |
| `scout` | finds things — lookups, research | cheap, fast, low output |
| `seer` | anything involving images | `attachment: ["image"]` |

### Files added

- **`packages/paradigm/roles.json`** — the curated role catalog from approved Section 1. Bundled
  and read in place, **deliberately not copied to `~/.config/vangio/`** so a reinstall can never
  overwrite user edits. Carries `needs` and ranked `picks` with a `why` per role, including the
  NVIDIA picks for when that key is set.
- **`paradigms/code-review.json`** — king judges severity on a 1M-context model, scout reads the
  code the diff does not show, warrior writes confirmed fixes.
- **`paradigms/documenter.json`** — warrior on `nemotron-3.5-lightning-free` (262k output, the best
  free ceiling anywhere) with a long-form prose brief.
- **`paradigms/web-dev.json`** — the only template with a `seer`, and so the only one that
  exercises the image path.
- **`paradigms/researcher.json`** — the Legion demo: king plus three scouts fanned in parallel.
  Written as three explicit heads today; collapses to one head at `instances: 3` once the schema
  gains it.

**The researcher's three scouts are bound to three DIFFERENT Zen models on purpose.** If Q1
resolves to "Zen's daily bucket is per-model", that is three independent budgets; if it resolves to
"shared", the arrangement costs nothing extra. It is the cheapest available hedge against an
unresolved question, and it doubles as the instrumentation for answering it.

### Two findings, both logged to errors.md, neither fixed unilaterally

1. **`gryphon`'s warrior is on the worst free output ceiling.** `mimo-v2.5-free` gives 32k output
   where `nemotron-3.5-lightning-free` gives 262k — and mimo is the *only* free model that accepts
   images, so binding it to a head that never sees images wastes the one thing it is good for.
   **Changing the flagship default's binding is the user's call**, so it is flagged, not changed.
   One-line fix when wanted. This is precisely the mismatch the resolver is being built to catch.
2. **`permission` on the king head is silently dropped.** `parseParadigm` accepts and validates it;
   `compileParadigm` never reads it for the king (`compile.ts:59-65`). **Paradigm Craft must not
   offer a permission control on the king head** or it will lie to the user. Same class of bug as
   the config-hook `Effect.ignore` problem — a validated-but-ignored field is worse than an
   unsupported one.

### Dropped from the old v4 list, with reason

`content-creator`, `data-analyst` and `tiktok-marketing` are mostly seer-and-prose work. They want
more than one image-capable model to bind, which means they want an NVIDIA key. Deferred until
that exists rather than shipped weak.

---

## Phase 10 — SPIKE RESOLVED: chained dialogs work (2026-08-17)

**The blocker on Section 4 (the Paradigm Craft wizard) is cleared. A multi-step dialog sequence
survives the keymap stack.** Proven under ConPTY, not asserted. Spike code was throwaway and has
been reverted; `packages/paradigm/src/tui.tsx` is unchanged and the bundle is back to 8191 bytes
with zero spike references.

**Method.** A three-step chain (`DialogPrompt` name -> `DialogSelect` shape -> `DialogSelect`
model) was added temporarily behind a `paradigm.craftspike` command, each step appending to a probe
file. The probe file matters: the verify skill's gotcha is that incremental repaints fragment text
across positioned writes, so stream-grepping cannot prove a dialog rendered. Code writing its own
probe can.

**Result — every step ran, in order, with state intact:**

```
command-run-start          depth=1 open=true
step1-render               depth=1 open=true
step1-confirm value=myteam depth=1 open=true
step2-render name=myteam   depth=1 open=true
step2-select value=court   depth=1 open=true
step3-render name=myteam shape=court  depth=1 open=true
step3-select value=lightning          depth=0 open=false
DONE-all-three-steps-ran              depth=0 open=false
```

### What this settles

1. **`api.ui.dialog.replace()` called synchronously inside `onConfirm`/`onSelect` advances the
   wizard correctly.** The 2026-08-06 hazard documented at `tui.tsx:38-48` is real but **confined
   to the command-handler return path** — whatever opened the command clears the stack when `run()`
   returns. Dialog *callbacks* fire later and are not subject to it. The fallback plan (one dialog
   that scaffolds a file and hands off to `$EDITOR`) is **not needed**.
2. **State threads through props across replaces.** `name=myteam` survived into step 2 and was
   still present alongside `shape=court` in step 3.
3. **`depth` stays at 1 the whole way — `replace` swaps the top, it does not nest.** There is no
   free Back button. A Back control must re-render the previous step from state held in closure.
   That is easy but it is a thing the wizard has to do deliberately, not get for free.
4. **`clear()` takes depth to 0 and closes.**

### Two corrections to earlier assumptions

- **`DialogPrompt` is exposed directly to plugins** with `title`, `placeholder`, `value`, `busy`
  and `onConfirm(value)` (`packages/plugin/src/tui.ts:150-159`). The earlier note to "copy the
  `value` + `onConfirm` pattern from `dialog-session-rename.tsx`" is obsolete — the primitive is
  already in the plugin API.
- **`DialogSelect` options carry a `disabled` flag** (`tui.ts:161-169`).
  **SUPERSEDED 2026-08-18 — do not use it for the hard filter.** This block assumed `disabled`
  would show a model greyed with its reason. It does the opposite: `dialog-select.tsx:154-160`
  drops every `disabled === true` option before the list is built, so the row is invisible and
  unreachable — exactly the "why isn't mimo in the list" failure the design forbids. The shipped
  wizard therefore **never sets `disabled` on a model row**; it keeps every row visible with the
  reason in `description` and gates selection through a `blocked: Map<string, string>` consulted
  in `onSelect`. Verified live under ConPTY.

### Harness lesson worth keeping

Typing `/craftspike` fast and pressing Enter **submits it to the LLM as chat** — the slash menu
does not keep up. The first run did exactly that and produced a false negative ("command never
ran") while the plugin was in fact loaded and correct. Use the command palette (`ctrl+t`) and type
at ~130ms per character. Both harnesses are in the session scratchpad.

---

## Session state — RESUME HERE (2026-08-18) — supersedes every earlier RESUME block

**v5 (Paradigm Craft) is SHIPPED.** `/craft` and `/clone` are built, reviewed, and live-verified
under ConPTY. 12 commits, `a757bed4..1eb8156e`, all pushed to `origin/dev`. 105 tests in
`packages/paradigm` (212 assertions), typecheck 32/32. Working tree clean, nothing unpushed.
Every commit stayed inside `packages/paradigm` — **v5 added zero upstream-merge risk.**

Spec: `docs/superpowers/specs/2026-08-17-gryphon-paradigm-design.md` (corrected against what
implementation proved). Plan: `docs/superpowers/plans/2026-08-18-paradigm-craft.md`.

### The next three things, in the order I would do them

**1. Switch the wizard's model source to the SDK's available-models endpoint. Do this first —
it is an afternoon, not a subsystem.**
`packages/server/src/handlers/model.ts:13` returns `catalog.model.available()`, which is ALREADY
credential-filtered. The wizard's `candidates()` in `packages/paradigm/src/tui.tsx` instead reads
`api.state.provider`, the raw TUI state, which lists every provider declared in the user's
`opencode.json` whether or not it has a key. That is why Craft will happily let you bind a head to
`anthropic/claude-sonnet-5` with no credentials and only fail at use time.
**Do not build a live credential probe.** Q4's investigation went hunting for a credential field
on `Provider` (there isn't a trustworthy one — `key` is never set for account-based auth like Zen,
and `source` is re-stamped `"config"` for anything in `opencode.json`) when the server had already
done the filtering. Use `api.client` to fetch the available list, diff it against
`api.state.provider` to confirm the filtering is real, then swap `candidates()` over.
This closes the "VanGio cannot tell you which providers actually work" gap, which directly
undercuts the product's core claim.

**2. Decide Q3 — it is the only thing blocking Paradigm Shift stage one.**
The loop reads `lastUser.model`, not `currentModel()`, so a retry-time swap (Q2, proven) covers
the current step and `ModelSwitched` covers the next prompt — the steps between are covered by
neither. **Recommendation on record: publish `SessionEvent.ModelSwitched` plus one conditional at
`prompt.ts:1141` so the loop prefers the session row.** Durable, reuses existing machinery, and
costs a THIRD upstream seam — which is why it needs a human decision, since it widens the patch
surface against monthly merges. Requires amending the fallback spec's Global Constraints to allow
that seam. **Awaiting the user. Do not start Shift stage one without this answer.**

**3. Take the upstream merge, on a branch, never on `dev`.**
~5 weeks overdue at `999be62662` (2026-08-12). v5 did not make it worse — this is the cheapest it
will ever be, and it only gets more expensive.

### Still open, lower priority

- **Q1 — is Zen's daily bucket per-model or shared?** Unobservable without a real 429; do not force
  one. The `researcher` paradigm binds three DIFFERENT Zen models deliberately as the
  instrumentation for when one occurs. Load-bearing for whether parallel heads work on free tiers.
- **v6** — AI-assisted paradigm builder. Build after the three above.
- Deferred minors from the final review were all triaged "fine to leave" — no cleanup debt.

### Two hard-won rules a future session must not relearn

- **A step is painted explicitly in this TUI or it is not painted at all.** A reactive
  `<Show when={step()} keyed>` inside a single `dialog.replace()` NEVER repaints — state advances,
  screen does not, no error, all tests green. Full entry in `errors.md` (2026-08-18 04:10). v6/v7
  build more multi-step dialogs on this API and inherit this rule.
- **A green unit suite says nothing about whether a TUI repaints.** Both `--version` and
  `bun test` are blind to it. Live ConPTY is the only proof; harness gotchas in
  `.claude/skills/verify`, notably: run the harness under `node` not `bun`, wait 45s, and invoke
  commands via the `ctrl+t` palette typing ~130ms/char — typing a slash command fast submits it to
  the LLM as chat and produces a false negative.

### Environment left behind

- Working tree clean, everything pushed to `origin/dev`. Active paradigm marker: `gryphon`.
- `~/.config/vangio/paradigms/` holds exactly the six bundled presets (any test clones removed).
- `gryphon` and `premium-gryphon` warriors were rebound to `nemotron-3.5-lightning-free` (262k
  output) earlier today; `mimo-v2.5-free` is now reserved for `seer` heads, being the only free
  model that accepts images.
