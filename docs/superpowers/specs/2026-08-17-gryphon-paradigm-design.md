# Gryphon — Paradigm Engine Design

> **Status: v5 BUILT AND SHIPPED 2026-08-18.** `/craft` and `/clone` are implemented, tested
> (107 tests) and live-verified under ConPTY. Plan:
> `docs/superpowers/plans/2026-08-18-paradigm-craft.md`.
> Sections 1–4 are agreed. **Two questions remain open (Q1, Q3)** — Q4 and Q5 were answered
> during implementation and are recorded below. Neither open question blocks Craft or the
> resolver, though **Q3 blocks Paradigm Shift stage one** and is awaiting the user.
> Read the Verified Findings table before writing code — several findings overturn assumptions
> made earlier in the same session, including two that correct already-approved sections.
>
> **Companion spec:** `2026-08-13-free-tier-fallback-design.md` owns Paradigm Shift stage one
> (the always-on model swapping) and Q1–Q3. This document owns the data model, the resolver and
> Paradigm Craft. Where they overlap, the fallback spec is authoritative on swap mechanics and
> this one is authoritative on naming and the role/needs model.

**Goal:** Let a user assemble a *team* of models — a paradigm — where each head is chosen for what
it can actually do, checked against the live model catalog, and degraded honestly when a free tier
dies. Ship the hand-crafted templates (v4) and the manual authoring wizard (v5) on top of the
paradigm layer that already exists.

**Non-goal:** multi-agent orchestration or parallelism as such. The engine already has both
(F1, F2). The new ground is *capability-aware selection against a live catalog* plus honest
degradation. Nothing upstream checks that a bound model still exists, and nothing degrades when a
free tier ends — it shows a subscribe ad.

---

## Vocabulary — settled 2026-08-17

| Term | What it is | On disk |
|---|---|---|
| **VanGio** | the ecosystem | — |
| **VanGio Code** | the coding agent (this repo) | — |
| **Gryphon** | **the engine**: capability-aware team assembly plus honest degradation | `packages/paradigm` |
| **Schemata** | the **container** — the library holding every paradigm | `~/.config/vangio/paradigms/` |
| **a paradigm** | one team configuration: a king plus heads | `paradigms/<name>.json` |
| **heads** | the roles inside a paradigm | the `heads` key |
| **Paradigm Shift** | the automatic mode | `"shift": { "auto": true }` |
| **Paradigm Craft** | the manual mode | — |

Gryphon names the engine because a gryphon is a hybrid creature and a paradigm is a hybrid too —
Zhipu *and* NVIDIA *and* Zen working as one animal. The name encodes the mechanic. It also remains
the name of the default bundled paradigm.

**Schemata is the library; a paradigm is one entry in it.** This is exactly the existing disk
layout, so **no rename and no migration are required anywhere.** Hard rule #5 (a rename ships its
migration) never fires.

### The two modes

**Paradigm Shift** ships in two stages:

- **Stage one (v4–v6, buildable now)** — always-on model swapping. When a free tier dies, Gryphon
  re-binds the affected head and says so.
- **Stage two (v7)** — Gryphon composes the paradigm *itself* from the user's stated goal. This is
  the v7 autonomous-generation row. **Not a v4–v6 deliverable.**

**Paradigm Craft** is the manual mode: the user authors a paradigm and selects it. v5.

**Model swapping is always on in BOTH modes.** Craft does not mean your models stop moving. This
is why *Lock*, *Hold*, *Anchor* and *Fixed* were rejected as names — each would be false the first
time a free tier died mid-session. The axis is *who composes the team*, not whether models move.

---

## Verified Findings

Measured 2026-08-17 against this working tree. F9 was proven under a live ConPTY run.

| # | Finding | Evidence |
|---|---|---|
| F1 | **Parallel subagents already exist.** The `task` tool takes `background: true`, backed by a wired `BackgroundJob.Service`; tool calls within one turn already dispatch as concurrent fibers. Swarm mode is not a subsystem to build. | prior session, recorded in build-progress |
| F2 | **Per-agent models already exist**, and `SessionEvent.ModelSwitched` gives a durable per-session override that also appends a transcript message. | prior session |
| F3 | **The plugin `config()` hook cannot report errors.** It is called during plugin construction inside `Effect.tryPromise(...).pipe(Effect.tapError(log), Effect.ignore)`. A validation error thrown there is logged and swallowed — never shown to the user. | `packages/opencode/src/plugin/index.ts:241-249` |
| F4 | **The catalog is itself populated by a plugin**, so at `config()` time it may not have synced. Boot-time resolution would be both invisible (F3) and racy. | `packages/core/src/plugin/models-dev.ts` |
| F5 | **`Catalog.model.available()` already filters to credentialed providers and enabled models.** The resolver's candidate list is a method call, not something to build. | `packages/core/src/catalog.ts:210-213` |
| F6 | **A weighted filter-then-rank picker already exists** — `model.small()` scores normalised cost at 0.8 and age at 0.2. Follow its shape rather than inventing a scoring scheme. | `packages/core/src/catalog.ts:249-286` |
| F7 | **Absent cost data defaults to zero.** `cost()` builds `{input: input?.input ?? 0, output: input?.output ?? 0}`, so a genuinely free model and one with *unknown* pricing are byte-identical. **`allowPaid: false` cannot be implemented as "cost is zero."** | `packages/core/src/plugin/models-dev.ts:13-20` |
| F8 | **`permission` on the king head is silently dropped.** `parseParadigm` accepts and validates it on any head, but `compileParadigm` emits only `{model, prompt}` for the king — non-king heads get `permission`, the king does not. Parses clean, validates clean, does nothing. | `packages/paradigm/src/schema.ts:53-58`; `packages/paradigm/src/compile.ts:59-65` |
| F9 | **Chained dialogs work — PROVEN under ConPTY (2026-08-17).** A three-step `DialogPrompt → DialogSelect → DialogSelect` chain ran end to end with state intact. `api.ui.dialog.replace()` called synchronously inside `onConfirm`/`onSelect` advances correctly. **`depth` stayed at 1 throughout — `replace` swaps the top, it does not nest.** `clear()` takes depth to 0. | throwaway spike, reverted; probe log in build-progress Phase 10 |
| F10 | **The 2026-08-06 stack-clearing hazard is confined to the command-handler return path.** Whatever opened the command clears the stack when `run()` returns; dialog *callbacks* fire later and are not subject to it. The `$EDITOR`-handoff fallback is not needed. | `packages/paradigm/src/tui.tsx:38-48` + F9 |
| F11 | **`DialogPrompt` is already exposed to plugins** with `title`, `placeholder`, `value`, `busy`, `onConfirm(value)`, `onCancel`. The earlier note to copy `dialog-session-rename.tsx` is obsolete. | `packages/plugin/src/tui.ts:150-159` |
| F12 | **`DialogSelect` options carry a `disabled` flag** plus `description` and `footer` — exactly what a hard filter wants. **Unverified:** whether `disabled` actually blocks selection. | `packages/plugin/src/tui.ts:161-181` |
| F13 | **The TUI plugin API carries a full SDK `client` AND a synchronous loaded `state.provider` array** whose `models` map holds every model. The wizard's model step needs no async call and no loading state. | `packages/plugin/src/tui.ts:375-389, 599-617` |
| F14 | **The SDK `Model` shape carries every field the four `needs` require**, in a better form than the internal type — `capabilities.input.image` is a typed boolean rather than string-array matching. | `packages/sdk/js/src/v2/gen/types.gen.ts:2028-2094`; `Provider` at 2111-2123 |
| F15 | **DeepSeek Harness has no automated model capability catalog** — modalities are hand-declared per endpoint and `contextWindow` is a hand-written config value. Staying on OpenCode; port Gryphon to dsh as a plugin later. | evaluated 2026-08-17, recorded in plan summary §7 |

---

## Section 1 — Data model

**`packages/paradigm/roles.json`** — the curated role catalog. Bundled with the plugin and **read
in place, deliberately NOT copied into `~/.config/vangio/`**: copying would let a reinstall
silently overwrite user edits, the same class of bug as the path rebrand that orphaned all config.
`picks` are candidates checked against the live catalog at read time; retired ones are dropped and
logged once.

**The rule that keeps the catalog small:** *a role exists only when it needs a different model
CAPABILITY — not merely a different instruction.* "Documenter", "reviewer" and "tester" are a
warrior with a different prompt and a different model bound, so they are not roles. Only `seer`
earns a name, because no prompt can make a text-only model see an image.

That yields four roles, mapping 1:1 onto the four `needs` fields:

| Head | Job | Binding constraint |
|---|---|---|
| `king` | plans, decides, reviews, delegates. **Mandatory** | `minContext` |
| `warrior` | produces the artifact — code, docs, copy | `minOutput` |
| `scout` | finds things — lookups, research | cheap, fast, low output |
| `seer` | anything involving images | `attachment` |

**Schema extensions** to today's `Paradigm`: `parallel: { posture, may }`, per-head `needs`,
`needsOverride: "<reason>"`, and `instances: N`.

- **`instances` replaces a stored pipeline/workers mode.** Court = several heads at 1, Legion =
  one head at N, and they can be mixed. Maps 1:1 onto `task` + `background: true`.
- **`needs` has exactly four fields:** `minContext`, `minOutput`, `tools`, `attachment`.
- **Paid-vs-free is a paradigm-level `allowPaid: false`, not a need** — it is a wallet policy, not
  a capability. Per F7 it **must fail closed**: treat unknown cost as paid, and say so.

**Hard-filter with override.** Model fits needs → fine. Fails needs *and* carries
`needsOverride` → warning, runs. Fails needs with no override → validation error. Override
requires a reason *string*, never `true`.

**Absence is three states, not two** (refines the earlier two-state rule):

| State | Meaning | Behaviour |
|---|---|---|
| in `all()`, in `available()` | usable | normal |
| in `all()`, **not** in `available()` | exists, no credentials | actionable error — "add an API key" |
| **not in `all()`** | retired | **validation error that override CANNOT suppress** |

Override means "I know it is underpowered", never "this model does not exist".

---

## Section 2 — TUI surface

**Do NOT rename anything on disk.** `~/.config/vangio/paradigms/`, the `paradigm-active` marker
and `packages/paradigm` all stay. Precedent: the filename `opencode.json` was deliberately never
renamed. Hard rule #5 makes a cosmetic path rename a bad trade.

The 2026-08-06 picker already does switch-and-display-active with zero upstream edits. Reuse it.

Commands: `/paradigm` (exists, `slashName: "paradigm"`), `/paradigm new` (the Craft wizard),
`/paradigm clone`. **`/paradigm edit` → `$EDITOR` is out of scope for v5** — spawning a child
process from inside the TUI is a different risk class and deserves its own look.

**Field-by-field editing of arbitrary heads is deliberately out of scope.** A general form builder
is a large UI to own against monthly upstream merges.

**Restart semantics, stated at the point they matter:** creating and cloning need no restart;
switching does (measured 2026-08-06); **editing the ACTIVE paradigm does.**

**Bundled presets are read-only; editing one clones it first.** `install.ts` copies
`paradigms/*.json` over config, so in-place edits of a bundled preset are silently reverted on the
next install. User-created files have unique names and survive (install only copies, never
deletes).

---

## Section 3 — The resolver

**The resolver is a pure function over an injected model list.** It takes a candidate `Model[]`
and returns a ranked, annotated list. **It must never reach into `Catalog.Service` itself.** Two
reasons: it stays testable with fixtures and no running TUI, and it stays portable to any runtime
that can supply a model list — which is the single constraint that keeps the DeepSeek Harness port
cheap (F15).

**Where it runs: at authoring time, never at startup.** Per F3 a validation error at `config()` is
swallowed, and per F4 the catalog may not have synced yet. Boot-time resolution would be both
silent and racy. `config()` stays a dumb file→`cfg.agent` compile, unchanged.

**Inputs.** In the TUI, `api.state.provider` (F13) — synchronous, already loaded. Mapping (F14):

| `needs` | SDK `Model` field |
|---|---|
| `minContext` | `limit.context` |
| `minOutput` | `limit.output` |
| `tools` | `capabilities.toolcall` |
| `attachment: ["image"]` | `capabilities.input.image` |
| `allowPaid: false` | `cost.input` / `cost.output`, **failing closed** per F7 |

**Algorithm.** Hard-filter on `needs`, then rank survivors: `picks` order first, capability
headroom second. Follow the weighted shape of `model.small()` (F6) rather than inventing one.

**Drift detection** reuses the `event` hook: `models-dev.refreshed` and `Catalog.Event.Updated`
both fire *after* startup with the client live, so an audit there can actually be reported. That
is Section 1's "checked at read time, retired ones dropped and logged once" with a real home.

---

## Section 4 — The Paradigm Craft wizard

**The wizard is a state machine, not a dialog stack.** This falls out of F9: `replace` swaps the
top and `depth` stays at 1, so transitions are already ours to drive. Building a stack on top would
be inventing a second mechanism.

> **CORRECTED 2026-08-18 — the design stands, its assumed render mechanism did not.** This section
> originally implied the machine could be rendered by *one* `dialog.replace()` wrapping a reactive
> component that swaps on the current step (a Solid `<Show when={step()} keyed>`). **That does not
> repaint.** Proven live under ConPTY during implementation: the internal state advanced correctly
> while the screen kept showing the previous dialog, so the wizard appeared frozen. The shipped
> code drives **every** transition through an explicit `api.ui.dialog.replace()` / re-render call,
> which is F9's already-proven mechanism. The state-machine design itself is unaffected — a draft
> plus pure transitions is exactly what shipped. Only the painting changed.
>
> Consequence for later work: **v6 and v7 must not assume a reactive component can drive a
> multi-step dialog.** Each step is painted explicitly or it is not painted at all.

**Structure — mirroring the split that already exists** (`picker.ts` is pure and tested in
`picker.test.ts`; `tui.tsx` only renders):

- **`packages/paradigm/src/craft.ts`** — no TUI imports. `Draft`, a `Step` union,
  `nextStep(draft, step, answer)`, `validateName`, `toParadigm(draft)`, and
  **`modelOptions(role, models)` — which *is* the Section 3 resolver.**
- **`packages/paradigm/test/craft.test.ts`** — every transition plus the whole filter/rank table.
- **`tui.tsx`** — a thin renderer switching on `step`, calling `api.ui.dialog.replace()`.

**Flow:**

1. **Name** — `DialogPrompt` (F11). Rejects empty, non-`[a-z0-9-]`, and **any name colliding with
   a bundled preset**, because `install.ts` would silently revert the user's work. This is the
   only place the read-only-presets rule can actually be enforced.
2. **Shape** — Court or Legion.
3. **Heads** — Court: repeated role picks from `roles.json` with a "done" row (minimum 1 below the
   king, maximum 6). Legion: one role plus a count.
4. **Model per head** — hard-filtered. Fitting models carry their `picks` `why` as the row
   description; **failing models are shown `disabled` with the reason** ("needs 128k output, has
   32k") rather than hidden. The user must see what was rejected and why.
5. **Posture** — asked only when the shape can actually run parallel.
6. **Review** — `DialogConfirm`; confirming writes `~/.config/vangio/paradigms/<name>.json`.

**Three rules baked in:**

- **No permission control on the king, ever** (F8). Offering it would make the wizard lie.
- **Back is a literal "← Back" first row on each select.** `DialogSelect` has no cancel callback
  (F12), so Escape closes the whole dialog; an explicit row is honest and needs no new API.
- **Creating does not auto-switch.** Write the file, then toast that switching takes effect next
  launch.

**Cancel at any step writes nothing.**

---

## Hard constraints

1. **Patch, don't rewrite.** New behaviour goes in new files. Allowed seams: `packages/paradigm/*`,
   plus `retry.ts` / `processor.ts` for the shift work.
2. **The agent loop will NOT be rewritten.** It is stateless between iterations *by design* — it
   rebuilds from SQLite every pass, which is exactly what lets multiple clients drive one session,
   which is what v3 mobile needs. Rewriting it to hold state in memory would delete v3.
3. **No rename of any storage path.** If one ever happens, its migration ships in the same commit.
4. **Never bind Zhipu to a parallel head** — single-concurrent by contract.
5. **No AI attribution in any commit, PR or tag.**

---

## Open questions

Numbering is continuous with `2026-08-13-free-tier-fallback-design.md`, which owns Q1–Q3.

| # | Question | Status |
|---|---|---|
| **Q1** | Is Zen's daily bucket per-model or shared across all default-limit free models? | **Open.** Unobservable without a real 429; **load-bearing** — it decides whether parallel heads are viable on free tiers at all. The `researcher` paradigm's three-different-models binding is the instrumentation. Do not force a 429. |
| **Q3** | How does a model swap survive the loop-step boundary? | **Open, and load-bearing for Paradigm Shift stage one.** The loop reads `lastUser.model`, not `currentModel()`, so a retry-time swap (Q2) covers the current step and `ModelSwitched` covers the next prompt — the steps in between are covered by neither. Recommendation: publish `ModelSwitched` plus one conditional at `prompt.ts:1141`, which requires amending the fallback spec's Global Constraints to allow that third seam. **Awaiting the user.** |
| — | Shape names **Court** / **Legion** | Still placeholders pending review. Does not block a plan; they are display strings. |

**Closed:** **Q2** (can the model be swapped at retry time) — proven by
`packages/opencode/test/session/retry-model-swap.test.ts`, 4 tests green. **The auto-mode
ambiguity** — resolved to the stronger reading: Gryphon composes the team itself, which is why
Paradigm Shift splits across v4–v6 and v7.

**Q4** (does `api.state.provider` list *all* providers or only credentialed ones?) — **all of
them.** Measured live under ConPTY 2026-08-18 with no `auth.json` present on the box at all: `Craft`'s
`onMount` logged `props.api.state.provider.map(p => p.id)` and got `["zai", "zhipuai-coding-plan",
"zai-coding-plan", "zhipuai", "opencode", "anthropic", "zhipu"]` — seven providers, none
credentialed, `anthropic` included. `state.provider` is the raw catalog, not `Catalog.model.available()`
(F5); the resolver's hard filter is doing real work here; a paradigm crafted against an
uncredentialed model still gets written, and only fails at use time. Section 1's three-state
absence taxonomy is confirmed live rather than assumed: the `seer` model step listed several
`anthropic`/`zai`/`zhipuai` image models as fitting (their catalog metadata claims image support)
despite the box holding no key for any of them — "exists, no credentials" is real and common, not
an edge case.

**Q4 follow-up — we cannot currently DETECT credential state, and this is a real product gap.**
Having established that uncredentialed models are offered, the obvious fix was to label them. That
was attempted and abandoned on evidence. Tracing `packages/opencode/src/provider/provider.ts`:
`Provider.key` is set only on the env/api-key branches and is **never** set for account-based auth,
which is how OpenCode Zen — the user's primary working provider — authenticates; and
`Provider.source` is unconditionally re-stamped `"config"` for any provider declared in the user's
`opencode.json`, regardless of whether its env var actually resolves. That last point also explains
the probe above: `anthropic` appeared because it is *declared* in this user's config (its entry is
literally named "no key configured yet"), not because the API conceals credential state.

Neither field is a trustworthy usable/unusable signal. A heuristic built on either would mislabel
the user's actually-working free models as unusable — a worse failure than the one it fixes. So the
code was deliberately left unchanged and the gap documented instead: **VanGio cannot presently tell
the user which of their configured providers will actually work.** For a product whose whole claim
is an honest answer about what can be done with the models you have, closing this is worth a
dedicated look — most likely a cheap live probe per provider rather than catalog introspection.

**Q5** (does `DialogSelect`'s `disabled` actually block selection?) — **yes, more than that: it
hides the row entirely.** `packages/tui/src/ui/dialog-select.tsx`'s `filtered()` memo drops every
option with `disabled === true` before building the navigable list (`grouped()`/`flat()`), so a
disabled row never renders and is never reachable by keyboard or mouse — `onSelect` cannot fire
for it because there is no row to select. Verified two ways under ConPTY 2026-08-18: (1) a
full-repaint frame of the `seer` model step (whose candidate list has both fitting and failing
entries) shows only the fitting titles, in the same order as the resolver's own ranking, with zero
occurrences anywhere of any of the disabled titles; (2) every `onSelect` observed across two full
wizard runs carried `disabled=false` — there is no code path that reaches the handler with a
disabled row. This is stronger than Section 4's stated design ("shown disabled with the reason,
not hidden") — used naively, a failing model is hidden rather than shown-and-greyed.

**Resolution: Section 4's requirement was upheld and the code changed to meet it.** Hiding was
rejected because this product's entire differentiation is an honest answer about what your models
can actually do, and a candidate that silently vanishes is the opposite — the reason string
("needs 128000 output, has 32000") teaches the user something an absent row cannot. Since the
framework offers no greyed-but-visible state for option rows, the shipped wizard **never sets
`disabled` on a model row at all.** Every candidate renders, its description carries either the
`picks` rationale or the failure reason, and selection is gated by a `blocked: Map<string, string>`
built alongside the rows and consulted in `onSelect`, which toasts the reason and refuses to
advance. Live-verified 2026-08-18: a text-only model appeared on the `seer` step reading "does not
accept image input", and pressing Enter on it raised the toast without advancing.

**Q3 does not block this spec.** It belongs to Paradigm Shift stage one, which lives in the
fallback spec; Craft and the resolver can be planned and built without it.

---

## Version mapping

| Version | Deliverable |
|---|---|
| **v4** | Paradigm templates (shipped 2026-08-17: `code-review`, `documenter`, `web-dev`, `researcher`, plus `roles.json`) + Paradigm Shift stage one (always-on model swapping) |
| **v5** | Paradigm Craft — the wizard in Section 4. `new` and `clone` |
| **v6** | AI-assisted paradigm builder — describe a goal, answer 3–5 questions, review a paradigm |
| **v7** | Paradigm Shift stage two — Gryphon composes the paradigm from the user's goal |

## Out of scope

- Rewriting the agent loop.
- A parallel "mode" subsystem — `instances` plus the existing `shift.auto` toggle covers it.
- Field-by-field TUI editing of arbitrary heads.
- `/paradigm edit` → `$EDITOR` (v5).
- Escaping the free tier. This is about degrading honestly.
- Switching off OpenCode to DeepSeek Harness (F15).
