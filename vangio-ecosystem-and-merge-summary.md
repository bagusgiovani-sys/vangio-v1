# VanGio — Ecosystem Direction + Phase Summary

> Throwaway export, generated 2026-07-29. Source of truth stays in `docs/fork/`.
> Delete this file after use.
>
> Sections 1–2 are **direction** (recorded, deliberately not scheduled).
> Sections 3–6 are **verified current state**, measured against the live repo.

---

# PART I — THE BIG IDEA

## 1. VanGio is an ecosystem; this repo is VanGio Code

**Positioning decision, 2026-07-29.** This repository is no longer "VanGio, the product." It is
**VanGio Code** — the coding agent, and the *first* product inside a larger **VanGio** ecosystem.

**The eventual flagship VanGio product is capability-aware automation.** The user describes a
workflow. VanGio works out which steps it can genuinely automate *on this machine, with these
models*, assigns a model to each automatable step, and states plainly which steps the user still
has to do by hand. Free models by default; paid models optional.

**This is where Gryphon graduates.** "The right model for each role" stops being an internal
detail of a coding agent and becomes the organizing principle of the main product. Gryphon is the
proof the shape works — a three-head team used in real sessions. The ecosystem product is that
same idea applied to arbitrary work instead of just code.

**Status: v8, DEFERRED.** Not scheduled. Do not start before v3–v7. Recorded in
`docs/fork/build-progress.md` → "v8 — VanGio (the ecosystem)".

### The worked example this came from

Find a niche video → upload → auto clip and edit → add sound and subtitles → render → upload to
YouTube. VanGio filters which steps free AI models can handle; the rest stay manual.

### The analysis behind it — do not re-derive

**1. Models are not the scarce resource. Integrations are.**
Of those six steps, only about **two** need a language model at all. The rest are ffmpeg
invocations, a YouTube Data API client, and OAuth credentials.

| Step | What it actually needs | LLM? |
|---|---|---|
| Find a niche video | YouTube Data API + judgment on results | Partly |
| Upload the video | File I/O | No |
| Auto clip and edit | ffmpeg to execute; transcript reasoning to choose cuts | Partly |
| Add sound + subtitles | Whisper (ASR) + ffmpeg mux + *licensed* music | Partly |
| Render | ffmpeg | No |
| Upload to YouTube | YouTube Data API + OAuth | No |

So the filter must ask **"do I have a tool + credential + the hardware for this?"** — not "is
there a free model for this?" Filter on **capability**, not model availability. This single change
is what makes the feature honest.

**2. Every free model available is text-only.**
Verified against the live Zen catalog: `big-pickle`, `deepseek-v4-flash-free`,
`laguna-s-2.1-free`, `ling-3.0-flash-free`, `mimo-v2.5-free`, `nemotron-3-ultra-free`,
`north-mini-code-free` — all text/coding LLMs. None see pixels or hear audio. A model cannot watch
a video and pick the good moment; it can only reason over *text about* the media. That makes ASR
(Whisper) a hard dependency, not a nice-to-have.

**3. Hardware is a first-class constraint, not a footnote.**
16GB RAM, integrated graphics, CPU-only. Whisper transcription and ffmpeg rendering are the two
heaviest steps in that pipeline and are precisely what no cloud free tier will absorb.
"Capability-aware" has to mean aware of *the machine*, not just of the model list.

**4. Reliability compounds.**
Six unattended steps at 90% each is ~53% end-to-end — before Zen's unpublished rate-limit wall.
Long, model-driven, unattended chains on free tiers is exactly where this design fails in practice.

**5. The reframe that makes it work: keep the model out of the hot loop.**
VanGio Code is a *coding agent*. Its strength is **writing and wiring** automation, not *being*
the automation at runtime. So:

> user describes the workflow → VanGio reports feasibility honestly → **VanGio generates the
> pipeline as a script** (ffmpeg/API calls, with a model invoked only at the steps needing
> judgment) → the script runs deterministically, repeatably, at near-zero cost.

This sidesteps the compounding-reliability trap entirely and plays to what the fork is actually
good at.

### The genuinely novel part

The **honest feasibility filter**: *"Steps 1, 3, and 4 I can automate. Steps 2 and 6 need YouTube
credentials you haven't set up. Step 5 will take about 8 minutes per video on your hardware."*

Zapier and n8n show you thousands of integrations and let you discover the gaps after you've
already invested an afternoon. Nobody tells you up front what is actually possible with what you
have.

### Unresolved — recorded, not answered

**Is v8 VanGio Code's final phase, or a separate product that merely uses VanGio Code?**
Today the fork inherits an agent loop, tool system, TUI, web app, and desktop shell for free by
tracking upstream. An automation platform inherits far less of that leverage, and it pulls against
the BRD's "solo dev, personal use first." Decide before building.

**Parked without adopting:** a "Vibecoder vs Programmer / dev AI tools" front-door split in the
web app. It is a packaging decision, meaningful only once there is a differentiated thing to
package.

---

## 2. Gryphon paradigm — design decisions so far

The problem: Gryphon was conceived as a *paradigm* (three heads, routing rules, cost discipline)
but shipped as a single agent sitting in the Tab cycle beside Build and Plan. Two orthogonal axes
— *what am I allowed to do* (mode) and *how is work distributed across models* (paradigm) —
collapsed into one selector. v4–v7 are all operations on a "paradigm" object that does not exist
outside one agent's prompt string.

Of the six open decisions in `vangio-gryphon-issue.md`, four now have answers:

**#1 — Is Gryphon a schema, a philosophy, or both? → BOTH.**
v8 forces it. A paradigm must be a machine-readable object (v5 edits it, v6 generates it, v7
generates it autonomously, v8 maps workflow steps onto it). But the routing rules and cost
discipline are the actual IP. So: structured config the engine resolves, *plus* prose doctrine
layered on for judgment calls a rule cannot express.

**#4 — Compile down, or new runtime? → COMPILE DOWN.**
Decided on evidence. Upstream put 84 commits into the agent-config surface in 6 months and is
mid-migration to a v2 architecture. Anything that rewires agent *resolution* lives in that blast
radius permanently; anything that emits plain agent definitions upstream already understands is
immune. This also keeps VanGio's changes in *new files*, which is the cheap side of the fork.

**#6 — Is 3 heads structural or incidental? → INCIDENTAL.**
v8 needs N workflow steps mapped to N models. A schema that hardcodes three would need replacing.
Design for N heads from the start.

**#2 — What happens to the Tab cycle? → Tab switches MODE; a separate control switches PARADIGM.**
Tab returns to Build → Plan only. Paradigm gets its own control (a `/paradigm` command and/or a
keybind), with the active paradigm shown in the status row beside the model. Two axes, two
controls, both visible. Rejected: leaving Gryphon in the Tab cycle as an alias for "Build +
Gryphon" — it preserves the conceptual collapse in the UI and breaks down at v4, when
`web-dev`, `content-creator`, `data-analyst`, and `tiktok-marketing` would each want a Tab slot.

**Still open:** #3 (exact selection mechanism — command, status-row picker, config key, or all
three) and #5 (does this land before or after v3 finishes).

### The target shape

```
paradigm: gryphon
  heads:
    king:    { model: deepseek-v4-flash-free, role: reason/decide/review }
    warrior: { model: mimo-v2.5-free,         role: implement }
    scout:   { model: north-mini-code-free,   role: lookup, permission: { edit: deny } }
  routing:
    - trivial lookup (< 2 reads)     -> king (self)
    - grep across 3+ files           -> scout
    - small edit (< 5 lines, 1 file) -> king (self)
    - multi-file implementation      -> warrior (requires full spec)
    - ambiguous architecture         -> king (self, no delegation)
  discipline:
    scout:   ~10% of a king turn    — use liberally
    warrior: ~60-80% of a king turn — spec required

# composes with mode rather than replacing it:
#   plan + gryphon      build + gryphon
#   plan + web-dev      build + tiktok-marketing
```

`premium-gryphon` collapses into "gryphon with the king head swapped" instead of being a
copy-pasted clone of the whole agent.

### Known drift to clean up regardless

- Gryphon's live prompt still documents **Graphify** and tells the model to run `/graphify .`.
  The plugin was removed 2026-07-19 as incompatible with the current plugin API. The prompt is
  instructing the model to use a tool that does not exist.
- `docs/fork/CONFIG.md` still describes agent config under `~/.config/opencode/`; the live path is
  `~/.config/vangio/` after the Phase 8 rebrand.
- `premium-gryphon` says "same three-headed workflow" without restating the routing rules, so the
  paid path silently has weaker instructions than the free one.

---

# PART II — VERIFIED CURRENT STATE

## 3. How this fork relates to upstream

**Nothing updates automatically.** Two remotes: `origin` → `bagusgiovani-sys/vangio-v1` (where you
push), `upstream` → `anomalyco/opencode` (the original). Upstream code arrives only when you run
`git fetch upstream` + `git merge upstream/dev`. Upstream shipping a new version cannot break you.

Clicking **"Leave fork network"** on 2026-07-18 changed only GitHub's UI label so commits count
toward the contribution graph. The technical connection is intact — 220 commits were fetched from
it this session.

| Metric | Value |
|---|---|
| Fork point | 2026-07-16 |
| Upstream commits since | **220** (~17/day) |
| VanGio commits | 30 |
| Source files in repo | **3,090** |
| Files VanGio touched | **78 (2.5%)** |
| …of which genuinely new | **13** |
| Conflicts in a 220-commit merge | **1** |

**97.5% of VanGio is OpenCode.** The fork is thin because most of the work is *new files*
(notifier, marquee, launcher, legacy-dirs) plus one-line `opencode`→`vangio` string swaps — the
"patch, don't rewrite" rule paying off exactly as intended.

**Decision: keep tracking upstream, merge ~monthly.** Upstream ships ~6,775 commits per 6 months
(a funded team) and maintains 97.5% of what VanGio runs on. Cutting the cord means volunteering to
replace that team solo.

**Counterintuitive but important:** merging *more often* is *less* risky. Risk scales with how much
has piled up, not with how many times you merge. Twenty commits has twenty suspects and you still
remember why your own patches exist; two thousand is archaeology. Postponing doesn't avoid the
work — it compounds it. Measured cost of tracking: **~half a day per month.**

**When cutting would actually be right** — observable events, not calendar dates:
1. A merge costing 3+ days
2. Upstream license change or hostile product pivot
3. The paradigm layer requiring a *rewrite* of the agent loop rather than a layer on top

## 4. The merge, executed and verified

Branch `merge/upstream-2026-07-29`, never directly on `dev`.

**The one conflict:** `packages/opencode/src/session/prompt/meta.txt` — VanGio had swapped five
branding lines; upstream rewrote the whole file into new sections. Resolved by taking upstream's
version wholesale and re-applying branding per the Phase 8 policy.

| Gate | Result |
|---|---|
| `bun install` | clean |
| `bun typecheck` | 31/31 (incl. `@vangio/notifier`) |
| notifier tests | 24 pass |
| legacy-dirs tests | 5 pass |
| permission.shared tests | 5 pass |
| **TUI under ConPTY harness** | **6/6 assertions, run twice** |

TUI render confirmed: owl glyphs, VANGIO wordmark, `by bagusgiovani` byline, blinking cursor,
`Build ·DeepSeek V4 Flash (free) OpenCode Zen·` with marquee scrolling, `⊙ 1 MCP` (CodeGraph), no
notifier errors.

> `--version` is NOT proof a launcher works — it exits before the TUI module graph loads. That gap
> let a bug survive from session 10 to session 14.

**Push still pending** a GitHub credential fix: the merge includes upstream's
`.github/workflows/publish.yml`, and the stored OAuth token lacks the `workflow` scope. Chosen fix:
a classic PAT with `repo` + `workflow`.

## 5. Post-merge inspection findings

**Fixed and committed — 15 wrong home-screen tips.** Phase 8's rebrand left tips teaching commands
and paths that don't exist for VanGio users:

- `~/.config/opencode/tui.json` → `~/.config/vangio/tui.json` (config dir is `vangio`, per
  `packages/core/src/global.ts:11`)
- `opencode run|serve|upgrade|auth list|agent create|github install|debug config` → `vangio ...`
  (binary is `vangio` per `package.json` bin + `.scriptName("vangio")`)
- `.opencode/{commands,agents,tools,plugins,themes}/` → `.vangio/...`

Deliberately left: the `opencode.json` filename, opencode.ai docs host, `/opencode` and `/oc`
GitHub bot triggers, `ghcr.io/anomalyco/opencode`, "OpenCode Zen".

**Latent risk logged to errors.md — not a current bug.** VanGio patched `.vangio` project-dir
support into `packages/opencode/src/config/paths.ts` (v1 path), but upstream's newer
`packages/core/src/config.ts` hardcodes `.opencode` in three places and is unpatched. Tested
empirically: a scratch project with `.vangio/opencode.json` **did** return its marker model, so the
v1 path is live and `.vangio` works today. But when upstream's v2 migration lands, `.vangio` stops
resolving **silently** — the same failure shape as the 2026-07-18 incident where Gryphon vanished
with no error. **Re-run the `.vangio` marker test after every merge.**

**Minor, reported not changed:** `marquee.tsx` runs a 150ms `setInterval` forever even when the
text fits the available width; the notifier's `lastSent` Map is never pruned, so it grows slowly
across a long-lived `vangio serve`.

**False alarm, correctly dismissed:** `legacy-dirs.ts` writes its marker into `to.state`, which
looked like a fresh-install crash — but `global.ts:37-45` creates that directory first and the call
has a `.catch()`.

## 6. Roadmap discovery: you already own more than the plan assumed

**The web app exists.** `packages/app` is **502 files**; VanGio has changed **zero** of them. It's
already in use — v3's mobile setup builds and serves it over Tailscale. It is a desktop-class
client: sortable session tabs, session forking, virtual-scrolling file tree, embedded terminals,
command palette, per-session token metrics, image/paste/drag attachments, multi-server support, and
settings dialogs for providers, models, servers, and keybinds.

**The desktop app exists too.** `packages/desktop` is **83 files** — Electron with `electron-vite`
and `electron-builder` targets for Mac, Windows, Linux. It declares `"@opencode-ai/app":
"workspace:*"`, so **the desktop app is the web app in an Electron shell.**

Consequences:
- **v2 is a rebrand, not a build** — closer to Phase 8's string sweep than a ground-up project.
  RESCOPE notice now in `build-progress.md`.
- **v5 has a UI foundation** — `settings-models` / `dialog-manage-models` already do per-provider
  model selection, a natural host for the paradigm customizer.
- There is already a GUI for everything currently hand-edited in `opencode.json`.

---

## 7. Docs updated + next actions

| File | Change |
|---|---|
| `docs/fork/build-progress.md` | v8 ecosystem section; v2 RESCOPE notice; upstream merge policy; sessions 15 + 16 |
| `docs/fork/errors.md` | Watchlist entry for the `.vangio` config-path latent risk |
| `docs/fork/OVERVIEW.md` | §1 positioning banner — VanGio Code inside the VanGio ecosystem |
| `docs/fork/BRD.md` | Product Summary renamed to VanGio Code with ecosystem pointer |
| `docs/fork/PRD.md` | Overview banner + roadmap item 11 (v8, deferred) |

**Next:**
1. **Finish the push** — classic PAT with `repo` + `workflow` at github.com/settings/tokens, then
   `git credential reject` the stale credential and `git push origin dev` (224 commits waiting).
2. **Adopt the monthly merge rhythm** — recipe in `build-progress.md` → "Upstream merge policy".
3. **Finish the Gryphon paradigm design** — decisions #3 (selection mechanism) and #5 (sequencing
   vs v3) remain open; then write the spec and the implementation plan.
