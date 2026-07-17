# OVERVIEW.md — VanGio
> Renamed from CLAUDE.md on 2026-07-16 — this is a fork-doc, NOT opencode's loaded root instruction file (that's `/AGENTS.md`; see the Fork Notice banner at its top). Keeping the old name risked being mistaken for that file.
> Last updated: 2026-07-16
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
VanGio is a fork of OpenCode: a terminal AI coding agent, run **natively on Windows 11** (WSL2 was abandoned — unfixable Windows component-store corruption, error 14098), defaulting to the free DeepSeek V4 Flash Free model (cloud, via OpenCode Zen) with GLM-4.7-Flash as a configured fallback and Qwen/Kimi as switchable profiles, plus local Ollama as an optional offline fallback. For personal freelance frontend use first; possible commercial/subscription product later.
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
| **Graphify** (`@sentropic/graphify`) | General knowledge graph — entities, relations, ontology clusters. Best for big-picture architecture questions: "how does the plugin system relate to providers?" | Run `/graphify .` in TUI once to build index, then ask concept-level questions. Gryphon's prompt has routing rules for when to use this vs CodeGraph |
| **opencode-mem** | Persistent memory via local vector DB — remembers project conventions, preferences, and decisions across sessions | Activated automatically on load. Consult at session start |
| **CodeGraph** (`@colbymchenry/codegraph`) | Code-specific intelligence — symbols, callers, callees, call paths, impact analysis. 55K+ nodes already indexed. Best for debugging and refactoring: "who calls this function?", "what breaks if I change X?" | Wired as MCP server via `"mcp"` block in `.opencode/opencode.jsonc`. Tools fire automatically when Gryphon needs code intelligence |

**Routing logic** (baked into Gryphon's prompt):
- "Who calls X?" → **CodeGraph** (its specialty)
- "How does area X relate to Y?" → **Graphify** (concept-level)
- "What is this symbol?" → just **grep/read** (too simple for either graph tool)
- "What changed recently?" → **git**

**Premium brain profile** — `premium-gryphon` agent exists in global config but is dormant until you set `ANTHROPIC_API_KEY` env var. Uses Claude Sonnet 4 (paid) for complex architecture tasks that exceed DeepSeek's free-tier capability. Tab-cycle includes it once the key is present.

---

## 5. Key Behaviors to Build (Must-Have, from PRD) — REORDERED 2026-07-16
Build in THIS order, one phase fully done before starting the next:
1. **Banner** — cfonts "VANGIO" wordmark + owl face + "by bagusgiovani" byline + ANSI blink cursor. Code already verified (6-line cfonts output confirmed by real sandbox run). Purely cosmetic, no functional risk — good first real edit to the forked source.
2. **Default provider switch** — config-only change to DeepSeek V4 Flash Free via Zen (see Section 4). No code change, just `opencode.json` + `/connect`.
3. **Rate-limit/concurrency handling** — catch 429/overload errors, show clear message suggesting a provider switch, never crash the session. Verify first whether DeepSeek/Zen still needs this (may or may not still hit the issue — see unverified flag in Section 4).
4. **Rebranding** — rename config folder/CLI output references from OpenCode → VanGio.
- Manual provider switching via `/models` remains available throughout
- Verify the inherited agent loop (file read/edit, shell exec, streaming, LSP for TS/JS) actually works with the new default provider before considering each phase done

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
Step 9:  NEXT — implement Phase 1 (banner) in the forked source (see Section 5 build order above). Actual code editing has moved to Claude Code (local filesystem access) rather than this chat interface — planning docs are the shared reference between sessions
Step 10: After banner — Phase 2: switch default provider to DeepSeek V4 Flash Free via Zen (config-only)
--- POST-V1 (do not start until v1 works & ships) ---
- Pixel-art mascot polish (parked — current banner uses a simple bracket/antenna face, verified working)
- custom codebase indexing differentiator (verify OpenCode doesn't already have it first — confirmed it does NOT natively; opencode-codebase-index and CodeGraph are candidate free plugins, pick one not both, they overlap)
- VanGio native side-panel VS Code/Cursor extension (OpenCode's own extension is terminal-wrapper only, no native panel exists yet)
- native Windows clean-installer polish (pre-launch blocker before going public — v1 personal use already works natively)
```
