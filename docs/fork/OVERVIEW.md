# OVERVIEW.md — VanGio
> Renamed from CLAUDE.md on 2026-07-16 — this is a fork-doc, NOT opencode's loaded root instruction file (that's `/AGENTS.md`; see the Fork Notice banner at its top). Keeping the old name risked being mistaken for that file.
> Last updated: 2026-07-20
> Planning docs: BRD.md | PRD.md | CONFIG.md | SDD.md
> IMPORTANT: This project is a FORK of OpenCode (sst/opencode), not a from-scratch build. Patch and extend; do not rebuild. Everything unverified is flagged "VERIFY AT SETUP" — never assume.
> WORKFLOW NOTE: Actual code editing on the forked source now happens in Claude Code (local filesystem access), not this chat interface. These planning docs are the shared reference kept in sync across sessions/tools.

---

## 0. Quick Reference
**Start every session:** Read `docs/fork/README.md` (index + precedence) → this file → build-progress.md → errors.md → then code.
**Feature questions:** See PRD.md
**Config/provider structure:** See CONFIG.md
**Architecture/data flows:** See SDD.md
**Business context + risks:** See BRD.md
**IDE:** Cursor (free tier; Pro $20/mo optional — editor works fully even when AI cap is hit; VanGio runs in the terminal, unaffected by Cursor's AI limits)

---

## 1. Project Overview
> **Positioning (set 2026-07-29):** this repository is **VanGio Code** — the coding agent, and the
> first product in a larger **VanGio** ecosystem. The eventual main VanGio product is a
> capability-aware automation AI (see build-progress.md → "v8 — VanGio (the ecosystem)"), which
> is where the Gryphon principle of *a model per role* graduates from a coding-agent detail into
> the core of the product. **v8 is deferred — everything below is still the active scope.**

VanGio Code is an AI-powered multi-surface development tool, forked from OpenCode. It has two modes:

- **Terminal mode** (v1, shipped) — CLI/TUI with Gryphon 3-head orchestration, DeepSeek V4 Flash Free default, free cloud models
- **Desktop app** (v2, planned — see the RESCOPE notice in build-progress.md; upstream already ships `packages/app` and `packages/desktop`) — visual UI wrapping the same engine for noob-friendly vibecoding

The long-term vision: **VanGio isn't just one AI. It's a factory that builds the perfect AI team for your job.** You describe what you want to build → VanGio assembles a 3-model paradigm (orchestrator + implementer + researcher) tailored to that domain. From TikTok marketing to full-stack web apps — the right team for every task, at the lowest possible cost.

Built **natively on Windows 11** (WSL2 was abandoned — unfixable component-store corruption, error 14098), defaulting to DeepSeek V4 Flash Free (cloud, via OpenCode Zen) with GLM-4.7-Flash as a configured fallback and Qwen/Kimi as switchable profiles, plus local Ollama as optional offline fallback. For personal freelance frontend use first; possible commercial/subscription product later.
→ Full context + accepted risks: BRD.md

---

## 2. Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Base project | OpenCode (sst/opencode, mirror: anomalyco/opencode) | Forked, MIT, TypeScript |
| Runtime | Bun | Per OpenCode requirements |
| Language | TypeScript | Match upstream conventions — do NOT introduce a different style |
| Provider SDK | `@ai-sdk/openai-compatible` | Inherited — used for all providers |
| Default model | DeepSeek V4 Flash Free (via OpenCode Zen) | model ref `opencode/deepseek-v4-flash-free`, provider `opencode`, baseURL `https://opencode.ai/zen/v1`. 200K context, 128K max output, $0. **Caveat: temporary free promo tier, not permanent — could disappear or change.** Switched from GLM-4.7-Flash (2026-07-16) |
| Secondary/fallback | GLM-4.7-Flash (cloud) | baseURL `https://api.z.ai/api/paas/v4` (VERIFIED). Free, 200K context. Kept as a configured fallback profile, not default — known 1-concurrent-request limit causes retry loops in OpenCode |
| Banner | `cfonts` | New addition for VanGio branding (placeholder — pixel-art mascot parked) |
| Environment | Windows 11, native (Git Bash) | WSL2 abandoned (unfixable component-store corruption). Native Windows install already works for v1; a clean installer/onboarding polish is still the pre-launch item before any public release (BRD) |
| IDE | Cursor (free tier) | Pro optional |

---

## 3. Project Structure (FORK — do not invent new layout)
OpenCode's real monorepo layout is preserved as-is. VanGio's actual additions/changes:
```
vangio-v1/                 # forked repo, OpenCode structure preserved
├── opencode.json          # VanGio provider config — see CONFIG.md
├── .env.example           # documents ZHIPU_API_KEY (+ QWEN/KIMI keys later); never commit real keys
├── AGENTS.md              # opencode's OWN loaded root instruction file — has a "Fork Notice" banner pointing here; do not confuse with this doc set
├── .opencode/opencode.jsonc # project config; "instructions" glob auto-loads all of docs/fork/**/*.md every session
├── docs/fork/              # THIS folder — fork-specific docs, loaded automatically, take precedence over upstream docs on conflict
│   └── README.md / OVERVIEW.md (this file) / BRD.md / PRD.md / CONFIG.md / SDD.md / build-progress.md / errors.md
├── [banner edit]          # small edit to inherited startup code, adds cfonts call
└── [rate-limit handling]  # small targeted edit — LOCATE existing provider error handling first, do NOT guess the file
```

---

## 4. Provider / Credential Setup
→ Full detail: CONFIG.md
- API keys via `opencode auth login` (writes to `~/.local/share/opencode/auth.json`) OR `{env:VAR}` substitution
- Never hardcode keys in `opencode.json`
- **Default provider: DeepSeek V4 Flash Free via OpenCode Zen** — sign in at `opencode.ai/auth`, get a Zen key, run `/connect` in the TUI → select "opencode" → paste key. Model ref: `opencode/deepseek-v4-flash-free`. **UNVERIFIED (flag from other session, not independently re-tested in this one): whether this actually resolves the GLM concurrency/retry-loop bug, since that bug may be OpenCode's own client behavior (firing parallel requests without queuing) rather than GLM-specific — switching providers may mask it, not fix it. Confirm with a real multi-tool-call session before treating this as solved.**
- Secondary/fallback provider GLM: baseURL `https://api.z.ai/api/paas/v4` (VERIFIED); signup at open.bigmodel.cn (phone verification, no credit card — VERIFY it accepts your number; z.ai international is the fallback)
- Qwen/Kimi/Ollama baseURLs: **VERIFY AT SETUP** against each provider's live docs — do not trust any hardcoded value
- **Privacy note carried forward: DeepSeek V4 Flash Free's data may be used to improve the model during its free period (not zero-retention) — same rule as GLM: personal/hobby use only, NOT safe for freelance client/confidential code**

---

## 4.5 Gryphon Plugins & Upgrades (2026-07-17)

Gryphon now has two plugins wired in:

| Plugin | Purpose | How to use |
|---|---|---|
| **Graphify** (`@sentropic/graphify`) | General knowledge graph — entities, relations, ontology clusters. Best for big-picture architecture questions: "how does the plugin system relate to providers?" | **NOTE 2026-07-19:** Graphify removed — incompatible with current plugin API (no fixed release exists). CodeGraph MCP covers this need. |
| **opencode-mem** | Persistent memory via local vector DB — remembers project conventions, preferences, and decisions across sessions | Activated automatically on load. Consult at session start |
| **CodeGraph** (`@colbymchenry/codegraph`) | Code-specific intelligence — symbols, callers, callees, call paths, impact analysis. 55K+ nodes already indexed. Best for debugging and refactoring: "who calls this function?", "what breaks if I change X?" | Wired as MCP server via `"mcp"` block in `.opencode/opencode.jsonc`. Tools fire automatically when Gryphon needs code intelligence |

**Routing logic** (baked into Gryphon's prompt):
- "Who calls X?" → **CodeGraph** (its specialty)
- "How does area X relate to Y?" → **Graphify** (concept-level — currently unavailable, CodeGraph covers most needs)
- "What is this symbol?" → just **grep/read** (too simple for either graph tool)
- "What changed recently?" → **git**

**Premium brain profile** — `premium-gryphon` agent exists in global config but is dormant until you set `ANTHROPIC_API_KEY` env var. Uses Claude Sonnet 4 (paid) for complex architecture tasks that exceed DeepSeek's free-tier capability. Tab-cycle includes it once the key is present.

---

## 5. Phases Completed (v1)
All v1 phases are done and shipped. See `build-progress.md` for the full roadmap beyond v1:

- **v1 (shipped):** Banner, default provider switch, rebranding, Gryphon 3-head orchestration — tagged v1.0.0 (83ccb91fa, 2026-07-19)
- **v3 (IN PROGRESS — chosen 2026-07-19):** Mobile remote control — watch/reply/approve sessions from Android over Tailscale. Notifier code complete and verified end-to-end; laptop setup mostly done. See `mobile-control-setup.md`
- **v2 (deferred, not cancelled):** Desktop app — visual UI wrapping the VanGio engine. Taken out of sequence deliberately: mobile and desktop both talk to the same engine HTTP API, so neither blocks the other
- **v4:** Paradigm presets — hand-crafted 3-AI teams for common domains
- **v5:** Paradigm customizer — user tweaks models/roles/routing
- **v6:** AI-assisted paradigm builder — wizard generates a custom team from your goal
- **v7:** Autonomous paradigm generation — full vision: you describe it, VanGio builds it

---

## 6. What NOT To Do (fork-specific)
1. DO NOT restructure OpenCode's folder layout — patch, don't rewrite
2. DO NOT hardcode API keys in opencode.json — always `{env:VAR}` or auth.json
3. DO NOT rewrite the core agent loop — it's inherited and works
4. DO NOT guess provider baseURLs — VERIFY each against live docs at setup
5. DO NOT assume GLM's or DeepSeek's free tiers are permanent — GLM is throttled to 1 concurrent request; DeepSeek V4 Flash Free is a temporary promo that could disappear or change without notice. Build for both the 429 case and the "model no longer free" case
6. DO NOT build any Won't-Have feature (team features, macOS/Linux-native, Ollama Cloud, custom indexing) in v1 without explicit go-ahead
7. DO NOT touch unrelated parts of the codebase while adding rate-limit handling — minimal, targeted diff
8. WSL2 is NOT used for this project — abandoned due to unfixable Windows component-store corruption. Do not reintroduce it without a real reason; native Windows (Git Bash) is the actual v1 environment
9. DO NOT remove OpenCode's own license/attribution notices when rebranding output
10. DO NOT confuse the free GLM endpoint (`/api/paas/v4`) with the paid Coding Plan endpoint (`/api/coding/paas/v4`) — they are NOT interchangeable
11. DO NOT use the paid Coding Plan endpoint unless a paid plan is explicitly purchased later
12. DO NOT expand scope mid-build — if it's not in PRD Must-Have, it waits
13. DO NOT verify that a model still exists by reading documentation. models.dev and `zen.mdx` are authoritative for **capabilities** (context, output, tools, images) and never for **availability**. Availability comes only from the provider's live endpoint — `curl -s https://opencode.ai/zen/v1/models`. Two scout bindings died silently in five days because docs were treated as proof (errors.md 2026-08-13, 2026-08-17)
14. DO NOT rebuild what the engine already has. Verified present: per-agent models, parallel subagents (`task` tool `background: true` + `BackgroundJob.Service`), durable per-session model override with transcript announcement (`SessionEvent.ModelSwitched`), model-neutral session storage, and the models.dev catalog. Check for the existing mechanism before designing a new subsystem
15. DO NOT bind a 1-concurrent provider (Zhipu GLM, measured) to a schemata head that may run in parallel — and remember a 429 is ambiguous: GLM's is a concurrency limit that clears in a second, Zen's is a daily quota that only tomorrow fixes. Same status code, opposite correct response

---

## 7. First Steps (verified sequence)
→ Live checklist with status: build-progress.md

```
Step 1:  [DONE, historical] Attempted WSL2 — abandoned due to Error 14098 component-store corruption, unresolved even after DISM RestoreHealth. Switched to native Windows.
Step 2:  Install OpenCode natively on Windows: `npm i -g opencode-ai@latest` → verify: `opencode --version`
Step 3:  [DONE] Forked+cloned OpenCode source to build VanGio's own customizations (banner, rate-limit handling) — see repo at vangio-v1, branch `dev`, origin=user's fork, upstream=anomalyco/opencode
Step 4:  [DONE] `bun install` completed clean after installing VS Build Tools — note: final install used 100% prebuilt native binaries (no local compilation occurred), so the VS Build Tools fix is UNCONFIRMED as the actual root cause. Treat as resolved-in-practice, not diagnosed-with-certainty.
Step 5:  [DONE] Get free GLM key at open.bigmodel.cn or z.ai (kept as fallback profile)
Step 6:  [DONE] Store key: `[System.Environment]::SetEnvironmentVariable("ZHIPU_API_KEY", "...", "User")` + add to Git Bash: `export PATH="$HOME/.bun/bin:$PATH"` pattern for any tool PATH issues
Step 7:  [DONE] Created `~/.config/opencode/opencode.json` with GLM block; original first-run test passed
Step 8:  [DONE] SUCCESS CHECKPOINT passed — OpenCode responded, agent loop confirmed working
Step 9:  [DONE] Banner implemented in the forked source (Phase 5) and render-verified. Actual code editing happens in Claude Code (local filesystem access) rather than this chat interface — planning docs are the shared reference between sessions
Step 10: [DONE] Phase 6: default provider switched to DeepSeek V4 Flash Free via Zen (config-only)
Step 11: NEXT — v1 is shipped; current work is v3 Mobile Remote Control. build-progress.md "Current Status" is the live answer to "what now?" — this list is history, not a queue
--- POST-V1 (v1 works & shipped 2026-07-19) ---
- Pixel-art mascot polish (parked — current banner uses a simple bracket/antenna face, verified working)
- custom codebase indexing differentiator (verify OpenCode doesn't already have it first — confirmed it does NOT natively; opencode-codebase-index and CodeGraph are candidate free plugins, pick one not both, they overlap)
- VanGio native side-panel VS Code/Cursor extension (OpenCode's own extension is terminal-wrapper only, no native panel exists yet)
- native Windows clean-installer polish (pre-launch blocker before going public — v1 personal use already works natively)
- 🔮 **Long-term vision: Paradigm Shift** — see build-progress.md v4-v7. VanGio becomes a factory that assembles the perfect AI team for any job, not just a single AI assistant.
```
