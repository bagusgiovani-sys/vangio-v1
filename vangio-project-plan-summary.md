# VanGio — Project Plan Summary

> Throwaway export, generated 2026-07-20 from `docs/fork/` (README, OVERVIEW, BRD, PRD, build-progress).
> Source of truth stays in `docs/fork/`. Delete this file after use.

---

## 1. What VanGio is

An AI-powered multi-surface development tool, **forked from OpenCode** (sst/opencode, mirror anomalyco/opencode) — TypeScript + Bun, MIT licensed. Patch-and-extend, never rebuild.

- **Terminal mode (v1)** — shipped. CLI/TUI with Gryphon 3-head orchestration, running free cloud models.
- **Desktop app (v2)** — planned. Visual UI wrapping the same engine.

**Long-term vision:** VanGio isn't one AI — it's a *factory that builds the perfect AI team for your job*. You describe what you want to build, VanGio assembles a 3-model paradigm (orchestrator + implementer + researcher) tuned to that domain, at the lowest possible cost.

**Owner:** solo freelance frontend engineer. Personal use first; possible subscription product later.

---

## 2. Business context (BRD)

| | |
|---|---|
| Why it exists | Claude Code / Cursor cost money; wants that experience free-or-cheap, tailored, and a chance to learn agent-tool architecture |
| Success at launch | Daily use on real freelance work without wanting to switch back |
| Failure condition | Crashes constantly / unusable |
| Budget | $10–50/month |
| Timeline | A few months, no hard deadline |
| Hardware | Windows 11 laptop, 16GB RAM, integrated graphics — CPU-only inference, caps local models at ~7–8B and makes them slow in agentic loops |
| Distribution | GitHub clone + install script |

**Pre-launch blocker before any public release:** a clean native-Windows installer/onboarding path (v1 personal use already runs natively — WSL2 was abandoned).

---

## 3. Model / provider strategy

| Role | Model | Notes |
|---|---|---|
| **Default** | DeepSeek V4 Flash Free via OpenCode Zen (`opencode/deepseek-v4-flash-free`) | 200K ctx, $0, ~79% SWE-bench Verified. Currently works **keyless** — fragile promo tier |
| **Warrior head** | `opencode/mimo-v2.5-free` | 78.6 SWE-bench, best agentic average of Zen's free set, 1M ctx |
| **Fallback** | GLM-4.7-Flash (`https://api.z.ai/api/paas/v4`) | Genuinely free & ongoing, but **1 concurrent request** → OpenCode retries forever (upstream issue #8618). Configured, not default |
| Switchable | Qwen / Kimi | Qwen cloud free tier ended Apr 2026; Kimi needs $1 top-up. Verify baseURLs at setup |
| Optional | Local Ollama (7–8B) | Offline / private snippets only — hardware-bound |
| Dormant | `premium-gryphon` on Claude Sonnet | Wakes only when `ANTHROPIC_API_KEY` is set |

**Privacy rule (hard):** every Zen free model is a feedback-collection tier — data may be used for training. **Personal/hobby use only, never client or confidential code.**

**Zen free tier is a finite budget**, not unlimited (users hit a "Free usage exceeded" wall — issue #28055). Unknown whether the budget is pooled across models or per-model. Token discipline matters regardless.

---

## 4. v1 scope (MoSCoW, from PRD)

**Must have** — native Windows install; DeepSeek default + GLM/Qwen/Kimi profiles; manual mid-session provider switching; inherited core agent loop (read/edit, shell, multi-step tool calls, streaming, LSP); non-crashing error handling; startup banner (built **first**, per the 2026-07-16 reorder).

**Should have** — config folder/CLI output renamed OpenCode → VanGio.

**Could have (post-v1)** — pixel-art mascot; Ollama tool-calling workaround; quota-aware provider suggestions.

**Won't have (v1)** — team/multi-user; macOS/Linux-native; monetization; custom foundation model; Ollama Cloud.

---

## 5. Current status — v1 SHIPPED

Tagged **v1.0.0** on `83ccb91fa` (2026-07-19). All v1 phases done and live-verified:

- **Phase 1–4 Environment/fork** — WSL2 abandoned (Error 14098 component-store corruption); native Windows + Git Bash; forked, cloned, `bun install` clean; repo **detached from fork network** 2026-07-18 so GitHub counts contributions.
- **Phase 5 Banner** — owl face + block-font "VANGIO" wordmark (cfonts pre-rendered to static glyphs in `logo.ts`, not a runtime dep) + byline + signal-driven blinking cursor. Verified under a ConPTY harness.
- **Phase 6 Provider switch** — DeepSeek V4 Flash Free default, real completion confirmed keyless.
- **Phase 6.5 Theme + agents** — `neon-matrix` theme (note: active theme lives in **tui.json**, not opencode.json); King/Warrior agent workflow.
- **Phase 6.6 Gryphon consolidation** — king/warrior/scout merged into one primary `gryphon`; new `Marquee` component scrolls the active agent's description. Tab cycles **Build → Gryphon → Plan** (alphabetical).
- **Phase 6.7 Gryphon upgrades** — opencode-mem (persistent memory) + CodeGraph MCP (55K nodes / 191K edges); sharpened routing + token-discipline prompt. Graphify later removed (incompatible with current plugin API).
- **Phase 7 Rate-limit handling** — **cancelled** 2026-07-18; the retry-loop was GLM-specific, revisit only if it resurfaces.
- **Phase 8 Rebranding** — `vangio` XDG dirs, `.vangio` project dir, CLI name, one-time legacy-dir migration, 71-string user-facing sweep. Deliberately *not* renamed: `opencode.json` filenames, `$schema`/docs URLs, `OPENCODE_*` env vars, `@opencode-ai/*` packages, external product names.

**Global launcher:** `vangio` shims in `~/.bun/bin` run the source entry without changing cwd — machine-level files, not in the repo; recreate if the repo moves.

---

## 6. v3 Mobile Remote Control — engine work done, surface deferred behind v4–v6

Chosen 2026-07-19 (v2 desktop deliberately skipped for now; the two don't block each other — both talk to the same engine HTTP API).

**Done:** `packages/notifier` built TDD (watcher decision logic, ntfy transport, plugin entry), 23 tests green, typecheck clean, 3 commits pushed. Plugin bundled to `~/.config/vangio/plugins/`, `VANGIO_NTFY_TOPIC` set, ntfy pipeline proven, power settings verified, Tailscale 1.98.9 installed, setup guide at `docs/fork/mobile-control-setup.md`.

**Verified end-to-end against live `vangio serve`** — both paths: session-finished (priority 3) *and* the critical needs-approval at **priority 5 (DND-bypassing)** with a working tap-through click URL. Mobile approve/deny confirmed usable, clearing the spec's blocking-defect risk. Live testing also caught a real bug: notifications were silently lost because event hooks fire-and-forget and the process could exit mid-POST — fixed with a `dispose` drain.

**Remaining (user-side):** `tailscale up` login, `VANGIO_CLICK_BASE_URL`, serve + web app + tailscale serve mounts, phone setup, acceptance ritual. Note `vangio run` exits too fast to deliver — `vangio serve` is the verified path.

---

## 7. Roadmap — RESEQUENCED 2026-08-17

**The schemata work (v4–v6) is now the active track, in VanGio Code (the TUI), ahead of the
desktop and web surfaces.** User decision, 2026-08-17. The prior ordering put v4–v7 after the
phone and desktop apps; that is superseded. v2 and v3 are not cancelled — they are deprioritised
behind the schemata track, and the mobile work already done stands.

Rationale: v5, v6 and v7 are all *interfaces onto* the schemata data model. Building the desktop
and mobile surfaces first would mean building them twice — once against today's fixed three-head
paradigm and again after the data model changes. The engine work has to land first.

| Version | Deliverable | Status |
|---|---|---|
| **v4** | **Paradigm templates** — hand-crafted teams named for the job (`code-review`, `documenter`, `web-dev`, `content-creator`). Good defaults, no AI generation. Plus **Paradigm Shift stage one**: always-on model swapping | **active track** |
| **v5** | **Paradigm Craft** — create/name/clone, choose heads and roles, swap models, TUI shows the active paradigm | **active track** |
| **v6** | AI-assisted paradigm builder — describe a goal, answer 3–5 questions, get a paradigm to review | **active track** |
| **v7** | **Paradigm Shift stage two** — Gryphon composes the paradigm itself from the user's goal: decomposition → role mapping → model selection → instantiation. **The differentiator** | after v6; needs a real surface (desktop or web) |
| **v2** | Desktop app (Tauri/Electron) over the engine HTTP API — project browser, diff viewer, preset gallery | deferred behind v4–v6 |
| **v3** | Mobile remote control | notifier shipped and verified; remaining user-side setup deferred |

### Naming — SETTLED 2026-08-17

The vocabulary is fixed. This supersedes the earlier "Gryphon is the outer layer" framing and the
Gryphon Auto / Full Control mode names.

| Term | What it is | On disk |
|---|---|---|
| **VanGio** | the ecosystem | — |
| **VanGio Code** | the coding agent (this repo) | — |
| **Gryphon** | **the engine.** Capability-aware team assembly plus honest degradation | `packages/paradigm` |
| **Schemata** | the **container** — the library holding every paradigm | `~/.config/vangio/paradigms/` |
| **a paradigm** | one team configuration: a king plus heads | `paradigms/<name>.json` |
| **heads** | the roles inside a paradigm (king, warrior, scout, …) | `heads` key |
| **Paradigm Shift** | the automatic mode — see below | `"shift": { "auto": true }` |
| **Paradigm Craft** | the manual mode — see below | — |

**Why Gryphon is the engine name:** a gryphon is a hybrid creature — eagle and lion. A paradigm is
a hybrid too: Zhipu *and* NVIDIA *and* Zen, working as one animal. The name encodes the core
mechanic, so it stays. It also remains the name of the default bundled paradigm, and is the
mascot if one is ever drawn.

**Note the containment:** schemata is the *library*, a paradigm is *one entry in it*. This is
exactly the existing on-disk shape — a `paradigms/` directory holding one JSON per paradigm — so
no rename or migration is required anywhere.

#### The two modes

- **Paradigm Shift** — the automatic mode. Two behaviours, and they ship in two stages:
  - **Stage one (v4–v6, buildable now):** always-on model swapping. When a free tier dies or a
    quota is spent, Gryphon re-binds the affected head and says so. **This half is always on in
    both modes** — Craft does not mean your models stop moving.
  - **Stage two (v7):** Gryphon *composes the paradigm itself* from what the user says they want
    to build. This is the v7 "autonomous generation" row, now named. It is not a v4–v6 deliverable.
- **Paradigm Craft** — the manual mode. The user authors a paradigm and selects it: choose the
  heads, the roles and the models. This is the v5 deliverable and is fully buildable on the design
  agreed so far.

**Naming rejected and why:** *Lock*, *Hold*, *Anchor* and *Fixed* were all rejected as the manual
mode's name because model swapping is always on — any name promising stillness would be a lie the
first time a free tier died mid-session. The axis is *who composes the team*, not whether models
move.

In Craft the **shape** is chosen before roles. Two shapes (names still placeholders): **Court** —
distinct roles where order matters; **Legion** — interchangeable workers run in parallel. Both
compile to the same `heads` + `instances` data model, so shape is a wizard affordance, not a
stored mode.

### Schemata — decisions taken 2026-08-17

- **Shape:** a king is mandatory and non-negotiable; minimum 2 heads total; up to 6 heads below
  the king. Enforced in `packages/paradigm/src/schema.ts`.
- **Both team shapes are user-selectable:** a *pipeline* of distinct roles (planner, coder,
  tester, reviewer, documenter, researcher) where order matters, **or** interchangeable *workers*
  of one kind that the king slices a task across. The user picks per schemata.
- **Parallelism is a posture, not a mode.** The schemata declares which heads *may* run in
  parallel plus a default posture (prefer-sequential / prefer-parallel); the king decides per
  task. This matches the engine, where `background` is already a per-call decision.
  **Default posture is sequential** until Zen's bucket question (Q1) is answered — see below.
- **Heads declare `needs`, not model lists.** A head states what its role requires (min output,
  tools, images); the engine filters the live catalog against that. The user picks a role and is
  offered the 3–5 models that fit and are currently alive — never a list of 100.
- **Curated recommendations ship as JSON**, not just prose, so the TUI picker and v6's builder can
  both read them. Human reference: `docs/fork/model-index.md`.

### What is already in the engine — do NOT rebuild

Verified 2026-08-17. The schemata work is a layer over these, not a replacement:

- **Per-agent models** — OpenCode agents already carry their own `model`.
- **Parallel subagents** — the `task` tool already takes `background: true`, backed by a wired
  `BackgroundJob.Service`; tool calls within one turn already dispatch as concurrent fibers.
- **Durable per-session model override** — `SessionEvent.ModelSwitched` writes the `session.model`
  column *and* appends a `model-switched` message to the transcript.
- **Model capability catalog** — models.dev, already consumed.

**The genuinely new ground is capability-aware, staleness-resistant selection and honest
degradation.** Nothing upstream checks that a bound model still exists, and nothing degrades when
a free tier ends — it shows a subscribe ad. That gap is real and measured: two scout bindings died
silently in five days (`north-mini-code-free`, then `ling-3.0-tiny-free`).

**Smaller candidates:** pixel-art mascot; custom codebase indexing (confirmed absent from OpenCode natively); quota-aware provider suggestions; native side-panel VS Code/Cursor extension (upstream's is a terminal wrapper only — verified gap); native Windows installer polish.

### Base runtime — DeepSeek Harness evaluated, staying on OpenCode (2026-08-17)

**Decision: do not switch off OpenCode. Ship Gryphon on OpenCode, then port it to dsh as a
plugin.** Evaluated at user request the day it was raised; dsh had been public for four days.

DeepSeek Harness (`dsh`, `deepseek-ai/deepseek-harness`, released 2026-08-13, MIT, TypeScript/Node
on the Cordis plugin framework) is an agent runtime whose stated principle is that *every* part is
a plugin — model adapter, tool registry, session log, **and the agent loop itself** — with "no
privileged core to patch."

**Why it was tempting, honestly:** it fixes real OpenCode pain. The paradigm plugin's only engine
seam is the `config()` hook, and `packages/opencode/src/plugin/index.ts:241-249` wraps that call in
`Effect.ignore` — validation errors from it are structurally unreportable. Hard rule #1
("patch, don't rewrite") exists because OpenCode's core is hostile to modification. On dsh the
paradigm layer would be a first-class plugin, and the agent loop would be swappable by config.

**Why we are not switching — the decisive fact:** dsh has **no automated model capability
catalog**. Its docs are explicit that users must hand-declare modalities per endpoint ("a
hand-entered model is text-only until it says otherwise"), and `contextWindow` is a hand-written
per-model config value with optimistic defaults (1M context / 256k output). VanGio's whole
differentiation is capability-aware selection against a *live* catalog plus honest degradation.
OpenCode hands that over via models.dev (`limit.context`, `limit.output`, `capabilities.tools`,
`capabilities.input[]`, `cost[]`, `status`, auto-synced and event-refreshed). On dsh the resolver
would have no data source, and step one would be rebuilding models.dev ingestion.

**Three supporting reasons:** dsh ships a web UI and **no official TUI** (the terminal UI is a
four-day-old third-party Rust/ratatui plugin), so VanGio Code's TUI work would be discarded; the
README promises compatibility-breaking changes with config shapes actively drifting, which is far
worse than the current monthly-merge tax; and 64 commits across 34 packages plus the entire
approved schemata design are premised on OpenCode's `Catalog` and plugin API.

**Portability constraint adopted as a result (amends the resolver design):** the resolver MUST be
a pure function taking a candidate `ModelInfo[]` and returning a ranked list — it must never reach
into `Catalog.Service` itself. That keeps it testable without a live catalog and portable to any
runtime that can hand it a model list. It is the one design constraint that buys the dsh option
for free.

**Deferred, not dropped:** porting Gryphon to dsh as a plugin is a distribution play — a dsh plugin
ecosystem is forming now, and a fork of OpenCode reaches nobody by comparison. That is a v7/v8
conversation, not a v4 one. Re-evaluate the base question only after dsh reaches a stable release
and its config shapes settle.

---

## 8. Hard rules — what NOT to do

1. Don't restructure OpenCode's layout — patch, don't rewrite.
2. Don't hardcode API keys — `{env:VAR}` or `auth.json` only.
3. Don't rewrite the core agent loop — inherited and working.
4. Don't guess provider baseURLs — verify against live docs.
5. Don't assume free tiers are permanent — build for both 429 and "no longer free".
6. Don't build Won't-Have features without explicit go-ahead.
7. Keep diffs minimal and targeted; don't touch unrelated code.
8. WSL2 is not used — don't reintroduce it.
9. Never strip OpenCode's license/attribution when rebranding.
10. Don't confuse GLM's free `/api/paas/v4` with the paid `/api/coding/paas/v4`.
11. No scope expansion mid-build — if it's not Must-Have, it waits.

---

## 9. Open / unverified items

- Whether DeepSeek-via-Zen actually avoids the concurrency retry-loop, or whether that bug is OpenCode-client-side and follows to any provider — **still untested** in a real multi-tool-call session.
- How long Zen's keyless anonymous access lasts (expect sudden 401s → sign in at opencode.ai/auth + `/connect`).
- Whether opencode-mem works in practice — loads clean, live behavior unverified.
- Whether Zen's free budget is pooled or per-model — **Q1, still open and now load-bearing.** It
  decides whether parallel schemata heads are viable on free tiers at all: if the bucket is shared,
  six heads drain one budget six times faster and fail together. Cannot be observed (no quota
  header reaches the client); instrument the next genuine 429 rather than forcing one.
- The VS Build Tools fix for the original `bun install` failure is **unconfirmed as root cause** — the successful install used 100% prebuilt binaries, so nothing compiled locally. Don't repeat that diagnosis as settled.
- Differentiation strategy vs free competitors (the v4–v7 paradigm shift *is* the answer; deferred until v4).
- Per-client confidentiality/IP clauses — check per client.

---

## 10. Working conventions

- **Docs precedence:** `docs/fork/` beats upstream docs on product direction. `build-progress.md` + `errors.md` are current-state truth; BRD/PRD/SDD/CONFIG are *intended* design — if they contradict progress, the plan doc is stale, flag it.
- **Six Paths workflow:** King (main session) plans/reviews/talks; `warrior` subagent implements fully-specified chunks. Watcher = CodeGraph auto-sync; reality-check external facts via web/Context7; secretary = keep progress + errors docs in sync; inspector = self-review, `/security-review` and `/code-review` on risky or nontrivial diffs.
- **Push policy (since 2026-07-17):** commit + push to `origin/dev` at every checkpoint, without being asked. One logical change per commit; never commit half-done work.
- **Verification discipline:** TUI animations need a ConPTY harness (`@lydell/node-pty` run under **node**, not bun) — piping `bun dev` to a file shows only one frame. Recipe lives in `.claude/skills/verify/SKILL.md`.
