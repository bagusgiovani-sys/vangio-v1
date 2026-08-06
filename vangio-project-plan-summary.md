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

## 6. In progress — v3 Mobile Remote Control

Chosen 2026-07-19 (v2 desktop deliberately skipped for now; the two don't block each other — both talk to the same engine HTTP API).

**Done:** `packages/notifier` built TDD (watcher decision logic, ntfy transport, plugin entry), 23 tests green, typecheck clean, 3 commits pushed. Plugin bundled to `~/.config/vangio/plugins/`, `VANGIO_NTFY_TOPIC` set, ntfy pipeline proven, power settings verified, Tailscale 1.98.9 installed, setup guide at `docs/fork/mobile-control-setup.md`.

**Verified end-to-end against live `vangio serve`** — both paths: session-finished (priority 3) *and* the critical needs-approval at **priority 5 (DND-bypassing)** with a working tap-through click URL. Mobile approve/deny confirmed usable, clearing the spec's blocking-defect risk. Live testing also caught a real bug: notifications were silently lost because event hooks fire-and-forget and the process could exit mid-POST — fixed with a `dispose` drain.

**Remaining (user-side):** `tailscale up` login, `VANGIO_CLICK_BASE_URL`, serve + web app + tailscale serve mounts, phone setup, acceptance ritual. Note `vangio run` exits too fast to deliver — `vangio serve` is the verified path.

---

## 7. Roadmap beyond v3

| Version | Deliverable |
|---|---|
| **v2** | Desktop app (Tauri/Electron) over the engine HTTP API — project browser, diff viewer, preset gallery. The noob-friendly surface |
| **v3** | Mobile remote control ← *in progress* |
| **v4** | Paradigm presets — hand-crafted 3-AI teams (`web-dev`, `content-creator`, `data-analyst`, `tiktok-marketing`). Good defaults, no AI generation |
| **v5** | Paradigm customizer — swap models, adjust routing, rename heads |
| **v6** | AI-assisted paradigm builder — describe a goal, answer 3–5 questions, get a config to review |
| **v7** | Autonomous paradigm generation — goal decomposition → role mapping → model selection → instantiation, self-improving. **The differentiator** |

**Smaller candidates:** pixel-art mascot; custom codebase indexing (confirmed absent from OpenCode natively); quota-aware provider suggestions; native side-panel VS Code/Cursor extension (upstream's is a terminal wrapper only — verified gap); native Windows installer polish.

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
- Whether Zen's free budget is pooled or per-model.
- The VS Build Tools fix for the original `bun install` failure is **unconfirmed as root cause** — the successful install used 100% prebuilt binaries, so nothing compiled locally. Don't repeat that diagnosis as settled.
- Differentiation strategy vs free competitors (the v4–v7 paradigm shift *is* the answer; deferred until v4).
- Per-client confidentiality/IP clauses — check per client.

---

## 10. Working conventions

- **Docs precedence:** `docs/fork/` beats upstream docs on product direction. `build-progress.md` + `errors.md` are current-state truth; BRD/PRD/SDD/CONFIG are *intended* design — if they contradict progress, the plan doc is stale, flag it.
- **Six Paths workflow:** King (main session) plans/reviews/talks; `warrior` subagent implements fully-specified chunks. Watcher = CodeGraph auto-sync; reality-check external facts via web/Context7; secretary = keep progress + errors docs in sync; inspector = self-review, `/security-review` and `/code-review` on risky or nontrivial diffs.
- **Push policy (since 2026-07-17):** commit + push to `origin/dev` at every checkpoint, without being asked. One logical change per commit; never commit half-done work.
- **Verification discipline:** TUI animations need a ConPTY harness (`@lydell/node-pty` run under **node**, not bun) — piping `bun dev` to a file shows only one frame. Recipe lives in `.claude/skills/verify/SKILL.md`.
