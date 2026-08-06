# VanGio — The Gryphon Architecture Issue

> Throwaway export, generated 2026-07-23. Source of truth stays in `docs/fork/`.
> Delete this file after use.
>
> **Status of this document:** Sections 1–4 describe verified current state (read from live
> config and repo docs). Section 5 onward is analysis and *proposed* options — nothing here
> has been decided or implemented.

---

## 1. The issue in one paragraph

Gryphon was conceived as a **schema / philosophy for how AI models should be used** — a
three-head orchestration paradigm (a strong model reasons, a cheaper model implements, a
cheapest model looks things up), with routing rules and token discipline attached. In the
shipped implementation it instead became **a single agent sitting in the Tab cycle as a peer
of Build and Plan**. A paradigm got flattened into a mode. That collapse is the issue.

---

## 2. What Gryphon actually is today (verified)

Defined in `~/.config/vangio/opencode.json` under the `"agent"` key:

| Agent | Mode | Model | Role |
|---|---|---|---|
| `gryphon` | `primary` | `opencode/deepseek-v4-flash-free` | King head — plans, decides, reviews. In the Tab cycle. |
| `premium-gryphon` | `primary` | `anthropic/claude-sonnet-4-20250514` | Same workflow, paid model. Dormant until `ANTHROPIC_API_KEY` is set. |
| `warrior` | `subagent` | `opencode/mimo-v2.5-free` | Implements fully-specified chunks. `@warrior`, out of Tab cycle. |
| `scout` | `subagent` | `opencode/north-mini-code-free` | Fast lookups, `edit: deny`. `@scout`, out of Tab cycle. |

**Tab cycles: Build → Gryphon → Plan** (alphabetical; config agents interleave with built-ins —
recorded in `.claude/skills/verify/SKILL.md:22`).

The entire paradigm — the three heads, the routing rules, the token-discipline budget, the
escalation policy — lives as **one long prose `prompt` string** on the `gryphon` agent
(`opencode.json:48`). It is instruction text handed to a model, not structure the engine
understands.

### What that prompt encodes

Routing rules:
1. Trivial lookup (< 2 file reads) → do it yourself
2. Moderate lookup (grep across 3+ files) → `@scout`
3. Small edit (< 5 lines, 1 file, well-understood) → do it yourself
4. Complex implementation (multi-file, new logic, needs testing) → `@warrior` with a full spec
5. Ambiguous architecture question → keep it, think harder, do not guess

Token discipline:
- Scout ≈ <10% of a King turn — use liberally
- Warrior ≈ 60–80% of a King turn — only with a complete spec
- 3+ reasoning turns on one task → consider delegating
- 5+ turns with no concrete output → stop and ask the user

Knowledge-tool routing (CodeGraph vs. grep vs. git; the Graphify branch is dead — the plugin
was removed 2026-07-19 as incompatible with the current plugin API, but the prompt still
references it).

---

## 3. Why this is wrong: two axes collapsed into one selector

**Build / Plan** answer: *what am I allowed to do right now?*
→ Permission and intent state. Plan is read-only. Build can write.

**Gryphon** answers: *how is this work distributed across models?*
→ Orchestration paradigm. Which head reasons, which implements, which looks up, and what the
routing and cost rules are between them.

These are **orthogonal dimensions**. "Plan mode, Gryphon-orchestrated" and "Build mode,
Gryphon-orchestrated" should both be legal and obvious. Today neither is expressible, because
selecting Gryphon means *not* selecting Plan or Build.

Concrete consequences:

- **You cannot plan with the team.** Planning is exactly where cheap-model delegation pays off
  most (scout does the codebase reconnaissance, king does the thinking) — and it is the one
  mode where Gryphon is unreachable.
- **Permission semantics are duplicated.** Gryphon has to carry its own permission posture in
  prompt prose because it displaced the mode that would have supplied it.
- **The paradigm is unenforceable.** Routing rules expressed as prose to a free 200K-context
  model are suggestions. The engine cannot count tokens, cannot enforce "scout for 3+ file
  greps," cannot fall back when a head is rate-limited. Nothing observes whether the discipline
  is followed.
- **`premium-gryphon` is a copy-paste fork, not a swap.** Changing one head's model required
  cloning the whole agent. That is the shape of the problem in miniature: heads are not
  independently addressable.

---

## 4. Current project state (verified)

**v1 — SHIPPED.** Tagged `v1.0.0` on `83ccb91fa` (2026-07-19).

| Phase | Outcome |
|---|---|
| 1–4 Environment/fork | Native Windows + Git Bash (WSL2 abandoned — Error 14098 component-store corruption). Repo detached from fork network 2026-07-18 so GitHub counts contributions. |
| 5 Banner | Owl face + block-font VANGIO wordmark (cfonts pre-rendered to static glyphs in `logo.ts`), byline, signal-driven blinking cursor. Verified under ConPTY harness. |
| 6 Provider switch | DeepSeek V4 Flash Free default; real completion confirmed **keyless**. |
| 6.5 Theme + agents | `neon-matrix` theme (active theme name lives in `tui.json`, **not** `opencode.json`); King/Warrior workflow. |
| 6.6 Gryphon consolidation | king/warrior/scout merged into one primary `gryphon`; new `Marquee` component scrolls the active agent's description. **This is the commit where the paradigm became a mode.** |
| 6.7 Gryphon upgrades | opencode-mem + CodeGraph MCP (55K nodes / 191K edges); sharpened routing + token-discipline prompt. Graphify later removed. |
| 7 Rate-limit handling | **Cancelled** 2026-07-18 — the retry-loop was GLM-specific. |
| 8 Rebranding | `vangio` XDG dirs, `.vangio` project dir, CLI name, one-time legacy-dir migration, 71-string user-facing sweep. |

**v3 Mobile Remote Control — in progress.** `packages/notifier` built TDD, 23 tests green,
typecheck clean. Verified end-to-end against live `vangio serve`: session-finished (priority 3)
and needs-approval at **priority 5 (DND-bypassing)** with working tap-through click URL. Live
testing caught and fixed a real bug — notifications silently lost because event hooks are
fire-and-forget and the process could exit mid-POST; fixed with a `dispose` drain. Remaining
work is user-side setup (`tailscale up` login, `VANGIO_CLICK_BASE_URL`, serve mounts, phone
setup); step 10 is blocked on tailnet Serve.

**Model strategy.** DeepSeek V4 Flash Free via OpenCode Zen (200K ctx, ~79% SWE-bench, currently
keyless — fragile promo tier). MiMo-V2.5 for the warrior head (78.6 SWE-bench, 1M ctx). GLM-4.7-Flash
configured as fallback but not default (1 concurrent request → retry-loop, upstream #8618).

**Hard privacy rule.** Every Zen free model is a feedback-collection tier — data may be used for
training. Personal/hobby use only, never client or confidential code.

---

## 5. The direction this blocks

From `docs/fork/build-progress.md`, the post-v1 roadmap:

| Version | Deliverable |
|---|---|
| v2 | Desktop app (Tauri/Electron) over the engine HTTP API — project browser, diff viewer, preset gallery. Deferred, not cancelled. |
| v3 | Mobile remote control ← *in progress* |
| **v4** | **Paradigm presets** — hand-crafted 3-AI teams: `web-dev`, `content-creator`, `data-analyst`, `tiktok-marketing`. Good defaults, no AI generation. |
| **v5** | **Paradigm customizer** — swap a role's model, adjust routing rules, rename a head. |
| **v6** | **AI-assisted paradigm builder** — describe a goal, answer 3–5 questions, get a config to review. |
| **v7** | **Autonomous paradigm generation** — goal decomposition → role mapping → model selection → routing rules → instantiation, self-improving. **The differentiator.** |

The stated long-term vision:

> VanGio isn't one AI — it's a *factory that builds the perfect AI team for your job*. You
> describe what you want to build, VanGio assembles a 3-model paradigm (orchestrator +
> implementer + researcher) tuned to that domain, at the lowest possible cost.

**v4 through v7 are all operations on one object: the paradigm.** Present it, edit it, generate
it, generate it autonomously. That object does not exist in the system today — it exists only as
prose inside one agent's prompt string.

So v4, taken literally against the current architecture, means adding `web-dev`,
`content-creator`, `data-analyst`, and `tiktok-marketing` as four more primary agents in the Tab
cycle, each with its own hand-written mega-prompt. Tab would cycle:

```
Build → content-creator → data-analyst → Gryphon → Plan → tiktok-marketing → web-dev
```

That is unreadable, it still collapses the paradigm axis into the mode axis, and v5
("change a role's model") has nothing to edit but prose. **v6 and v7 are not reachable from
there at all** — you cannot generate a config format that does not exist.

---

## 6. The reframe

Gryphon should be **the first instance of a paradigm system**, not a special-cased agent that
happens to have a good prompt.

- A **paradigm** = a named bundle of *(roles → models → routing rules → delegation policy →
  cost discipline)*.
- Gryphon is paradigm #1. It is the proof the shape works — a three-head team that has been
  used in real sessions.
- v4's presets are paradigms #2–#5, expressed in the same format, requiring no new engine code.
- v5 edits that format. v6 generates it from a conversation. v7 generates it from a goal.
- Modes (Build / Plan) stay exactly as upstream defines them. A paradigm applies **under**
  whichever mode is active.

The selector question follows from this: paradigm gets its own axis in config and UI
(status row, a `/paradigm` command, or desktop gallery in v2) — it does not compete for a slot
in the Tab cycle.

---

## 7. Options on the table (proposed, undecided)

### Option A — Paradigm layer as a real orthogonal axis *(recommended)*

Introduce a first-class `paradigm` concept the engine executes: heads with named roles and
models, machine-readable routing rules, explicit cost policy. Gryphon becomes the built-in
default paradigm. Build/Plan stay untouched and Gryphon leaves the Tab cycle.

```
paradigm: gryphon
  heads:
    king:    { model: deepseek-v4-flash-free, role: reason/decide/review }
    warrior: { model: mimo-v2.5-free,         role: implement }
    scout:   { model: north-mini-code-free,   role: lookup, permission: { edit: deny } }
  routing:
    - trivial lookup (< 2 reads)   -> king (self)
    - grep across 3+ files          -> scout
    - small edit (< 5 lines, 1 file)-> king (self)
    - multi-file implementation     -> warrior (requires full spec)
    - ambiguous architecture        -> king (self, no delegation)
  discipline:
    scout:   ~10% of a king turn  — use liberally
    warrior: ~60-80% of a king turn — spec required

# composes with mode, does not replace it:
#   plan  + gryphon      build + gryphon
#   plan  + web-dev      build + tiktok-marketing
```

- **Pros:** the only option that makes v4–v7 buildable. Swapping one head's model becomes a
  one-line change instead of a cloned agent. Routing becomes enforceable by the engine rather
  than suggested to a model. `premium-gryphon` collapses into "gryphon with the king head
  swapped."
- **Cons:** largest fork surface — new config schema, new resolution logic, TUI selector work.
  Directly contradicts hard rule #1 ("patch, don't rewrite") unless carefully scoped as an
  additive layer over the existing agent system.
- **Open question:** can this be built as a *thin* layer that compiles a paradigm down into the
  agent definitions OpenCode already understands? If yes, most of the fork risk evaporates.

### Option B — Doctrine only, no new machinery

Gryphon becomes shared prose injected into every agent's prompt. Build and Plan both "run
Gryphon." Gryphon leaves the Tab cycle; Tab returns to Build → Plan.

- **Pros:** cheapest by a wide margin. Fixes the axis-collapse today. Zero fork surface.
- **Cons:** the paradigm still has no home in the architecture, so v4 presets remain
  unrepresentable and v6/v7 stay unreachable. Postpones the real problem rather than solving it.

### Option C — Schema only, philosophy stays in docs

Build the paradigm config format and runtime; leave the token-discipline prose in `docs/fork/`.

- **Pros:** clean separation of data and doctrine.
- **Cons:** the routing and cost rules are the valuable part, and they would have no
  enforcement — the same weakness as today, just relocated.

---

## 8. Decisions still needed

1. **Is Gryphon primarily a schema, a philosophy, or both?** Load-bearing — it selects between
   Options A, B, and C. *(Asked; not yet answered.)*
2. **What happens to the Tab cycle?** Does Gryphon leave it entirely, or does it stay as a
   convenience alias for "Build + Gryphon paradigm"?
3. **How is a paradigm selected** — `/paradigm <name>` command, status-row selector, config key,
   or all three?
4. **Does the paradigm layer compile down to existing agent definitions**, or does it need new
   runtime execution? Determines whether Option A is a small additive patch or a genuine fork.
5. **Does this land before or after v3 finishes?** v3 is close to done and blocked only on
   user-side Tailscale setup.
6. **Is 3 heads structural or incidental?** Everything is written as "3-model paradigm" and
   "orchestrator + implementer + researcher." If a paradigm can have 2 or 5 heads, the schema
   must not hardcode three.

---

## 9. Constraints any solution must respect

From `docs/fork/` hard rules:

1. Don't restructure OpenCode's layout — patch, don't rewrite.
2. Don't rewrite the core agent loop — inherited and working.
3. Don't hardcode API keys — `{env:VAR}` or `auth.json` only.
4. Don't assume free tiers are permanent — build for both 429 and "no longer free."
5. Keep diffs minimal and targeted; don't touch unrelated code.
6. No scope expansion mid-build.
7. Never strip OpenCode's license/attribution.

Plus, from live experience recorded in `docs/fork/errors.md`: **any rename of a storage path
(config dir, data dir, DB file, marker file) must ship its migration in the same commit.** A
prior path rebrand silently orphaned all user config — Gryphon vanished from the TUI and the
model fell back to GLM with no error message at all. If a paradigm layer changes where agent
config is read from, that lesson applies directly.

---

## 10. Known drift to clean up regardless of the decision

- Gryphon's prompt still documents **Graphify** and instructs the model to run `/graphify .`.
  The plugin was removed 2026-07-19 (incompatible with the current plugin API). The prompt is
  telling the model to use a tool that does not exist.
- `docs/fork/CONFIG.md` describes agent config under `~/.config/opencode/` paths; live config is
  at `~/.config/vangio/` after the Phase 8 rebrand.
- `premium-gryphon` duplicates the full Gryphon workflow in a short prompt that says "same
  three-headed workflow" without restating the routing rules — so the paid path silently has
  weaker instructions than the free one.
