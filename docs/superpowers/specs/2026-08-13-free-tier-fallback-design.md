# Free-Tier Fallback — Design

> **Status: STAGE ONE BUILT AND SHIPPED, 2026-08-20. Q2 and Q3 are ANSWERED; Q1 is still open.**
> Both modes now work: `auto: true` degrades a head by itself, `auto: false` opens the picker and
> explains. Three failure kinds route into it — a declared wall, a retirement (`model_gone`, which
> never reaches the retry policy and needed its own entry point), and a model that simply keeps
> failing. Everything below is the design as written; where implementation corrected it, the
> correction is marked inline.
> F2 is proven, but only for the
> span it actually covers, which is narrower than this document originally assumed — read F10
> before writing a plan: a swap that is not also persisted reverts on the next loop step.
> **Q3 was decided and built on 2026-08-20** (option 1, with one correction to how it is gated —
> see Q3). The durable half now exists, so `auto: true` is unblocked and Shift stage one can be
> planned. What remains unbuilt is everything that *publishes* a swap: the schema fields, the
> `StaticResolver`, and the retry-seam wiring that calls `switchModel`.

**Goal:** When a paradigm head's model hits its free-tier wall, VanGio Code performs a
**paradigm shift** instead of showing OpenCode's "subscribe to Go" upsell. The head degrades to
another model that can still do its job, or — if the user has turned auto off — VanGio asks
which paradigm to switch to.

**Non-goal:** escaping the free tier. This is about degrading honestly, not about getting more
tokens than Zen gives away.

---

## Verified Findings

Measured on 2026-08-13 against this working tree and, for F7, against a live install. Several
of these overturn assumptions made earlier in the same session, so read them before writing code.

| # | Finding | Evidence |
|---|---|---|
| F1 | **The upsell is a deliberate, multi-surface funnel.** `retryable()` mints an action with `reason: "free_tier_limit"`, a "subscribe" label and a link to `opencode.ai/go`. A dialog consumes it with a 24-hour re-show timer and a persisted "don't show again" flag, gated to providers `opencode`/`opencode-go`. It will not be fixed upstream. | `packages/opencode/src/session/retry.ts:76-88`; `packages/app/src/pages/session/usage-exceeded-dialogs.tsx:11-34` |
| F2 | **The model CAN be swapped between retry attempts — PROVEN (2026-08-17).** `llm.stream(streamInput)` is called *inside* the effect wrapped by `Effect.retry`, so it is re-evaluated on every attempt, re-reading `streamInput.model`. The `set` callback fires on each retry decision, before the delay, with `streamInput` in lexical scope. Mutating `streamInput.model` there changes the model the next attempt goes out on; `set` also sees `action.reason`, so the swap can be gated on `free_tier_limit`; and successive failures keep swapping, so a chain can be walked. Four tests reproduce the processor's exact wiring. | `packages/opencode/test/session/retry-model-swap.test.ts`; `src/session/llm.ts:35-48`; `src/session/processor.ts:627, 640, 660-673` |
| F3 | **Zen's free limit is a per-IP daily counter whose bucketing depends on server config we cannot see.** If a model carries an explicit `rateLimit`, the Redis key is `YYYYMMDD` + **the first two characters of the model id**; otherwise it is `YYYYMMDD` alone, i.e. **one budget shared by every default-limit free model**. Keyed on IP, not account. A grace period gives 2× the daily limit while lifetime count < `dailyLimit × 7`. The numbers live in the `ZEN_LIMITS` SST secret. | `packages/console/app/src/routes/zen/util/ipRateLimiter.ts:19,23,37-39`; `infra/console.ts:271` |
| F4 | **No quota telemetry ever reaches the client.** Zen's handler copies only `content-type` and `cache-control` onto the response. There is no remaining/limit/reset header to read. The 429 is the only signal. | `packages/console/app/src/routes/zen/util/handler.ts:300-306` |
| F5 | The *keyed* limiter is a different mechanism entirely: per-**minute** bucket (`yyyyMMddHHmm`, 60s expiry), default 1000. Do not conflate it with F3. | `packages/console/app/src/routes/zen/util/keyRateLimiter.ts:15,16-20,33` |
| F6 | **Free models are retired without any client-visible signal, and the catalog lags.** `north-mini-code-free` was removed from Zen's published roster on 2026-08-12; both paradigms still bound scout to it and every layer accepted it. models.dev carries 26 `opencode` ids ending `-free` while Zen publishes 8. **models.dev is not authoritative for availability.** | upstream `1f94d8a3c8`; `packages/web/src/content/docs/zen.mdx` @ upstream/dev; `packages/paradigm/src/schema.ts:43-52` |
| F7 | **OmniRoute cannot back a live resolver today.** Installed and run on this machine (v3.8.48): 1321 packages, **2.53 GB**, 9 minutes. Server binds **`0.0.0.0`** (not localhost) and logs that the management password is the well-known default `CHANGEME`. `/v1/models` answers unauthenticated with 99 models across 7 real pools — but `providers list` reports **"No providers configured"**, `/api/free-tier/summary` returns **401**, and `quota` returns `{"error":"No quota data"}`. Two keyless models tested: `aug/claude-haiku-4.5` returned HTTP 200 with an **empty stream, 0 tokens**; `ddgw/gpt-4o-mini` returned **503**. Its catalog advertises `oc/deepseek-v4-flash-free` at 1M context / 384k output; Zen and models.dev both say **200k / 128k**. `omniroute stop` leaves an orphan `server-ws.mjs` holding the port with a 4 GB heap allowance. | measured 2026-08-13, this machine |
| F8 | `omniroute setup-opencode` hard-codes `~/.config/opencode/opencode.json` with no path override — the wrong directory for VanGio, which reads `~/.config/vangio/`. It does support `--dry-run`, so its output can be inspected and placed by hand. | `omniroute setup-opencode --help`, v3.8.48 |
| F9 | **The 2026-08-06 live-switch blocker does not apply here.** That blocker is in the *config* layer: the v1 `config` hook fires once at boot, so the active-paradigm marker cannot change live. F2 is in the *session* layer and never re-resolves agent config. Option C's strategic cost is sidestepped entirely. | `docs/superpowers/plans/2026-08-06-paradigm-picker-options.md:18-29` |
| F10 | **An F2 swap lasts ONE loop step and is then thrown away.** The agent loop is `while (true)` in `SessionPrompt.loop`. Every iteration re-reads the messages **from the database**, derives `lastUser` from them, re-resolves `const model = getModel(lastUser.model.providerID, lastUser.model.modelID, …)`, and hands `handle.process({ … model … })` a **brand-new object literal**. Nothing carries the mutated `streamInput` across the step boundary. So a swap survives the remaining retry attempts of the current turn and dies at the next tool-call round-trip — where the loop re-issues the *dead* model and eats another 429 plus its backoff, every step, for the rest of the turn. **This is the finding that reshapes the design: `auto: true` needs a durable write, not just the F2 mutation.** | `packages/opencode/src/session/prompt.ts:1088, 1092-1096, 1141, 1272-1286` |
| F11 | **A durable, session-scoped model override already exists — do not build one.** `SessionEvent.ModelSwitched` is a first-class event: `V2Session.switchModel` publishes it, the projector writes it to the `session.model` JSON column, and `currentModel()` reads that column *first*, ahead of the last user message and the global default. It is also already **announced in the transcript** — `message-updater` appends a `SessionMessage.ModelSwitched` (`type: "model-switched"`) message for it. That is the spec's "honest provenance" divider, already built and already rendered. | `packages/core/src/session.ts:402-416`; `packages/core/src/session/projector.ts:339-349`; `packages/core/src/session/message-updater.ts:114-124`; `packages/core/src/session/sql.ts:52-56`; `packages/opencode/src/session/prompt.ts:614-632` |
| F12 | **`ModelSwitched` alone is not sufficient either.** The loop reads `lastUser.model` (prompt.ts:1141), **not** `currentModel()`. `currentModel()` is only consulted when a *new* prompt arrives without an explicit model (prompt.ts:469, 646). So publishing `ModelSwitched` mid-turn changes the model for the **next user prompt**, not for the remaining steps of the turn that is currently failing. F2 covers the current step; F11 covers the next prompt; **neither covers the steps in between.** | `packages/opencode/src/session/prompt.ts:469, 646, 1141` |

**Consequence of F7:** every instinct to make OmniRoute the quota backend is premature. It is a
plausible future substrate, not a usable one today, and its capability metadata is wrong for the
one provider we can independently check. Build the static resolver; keep the interface open.

**Consequence of F3:** a Zen-only fallback chain may be worthless. See Q1.

---

## Global Constraints

- **Patch, don't rewrite.** New behaviour lives in new files. The only upstream files this design
  may touch are `retry.ts`, `processor.ts` and `prompt.ts`, at the three seams named in F1, F2 and
  F10, and the diff must stay small enough to re-apply by hand at every upstream merge.
  **The third seam was added 2026-08-20 by the Q3 decision** and is deliberately the narrowest of
  the three: one import, one baseline read before the loop, one conditional at the model
  resolution (`prompt.ts:1141`), and the variant on the assistant message that has to travel with
  it. All of the logic lives in `packages/opencode/src/session/switched-model.ts`; the upstream
  file gains no branching it does not already have. If a merge ever moves the model resolution,
  `test/session/switched-model.test.ts` still passes while the feature silently dies — so treat
  that seam, not the test, as the thing to re-check by hand.
- **Session-scoped only.** The paradigm file on disk is never written by a fallback. A bad
  afternoon of 429s must not silently rewrite standing configuration.
- **Honest provenance.** A model swap is always announced in the transcript. Silently changing
  which model wrote which code is the exact dishonesty the VanGio premise objects to.
- **No new required dependency.** A fresh install works with zero extra processes running.
  OmniRoute, if used at all, is documented and optional.
- **Free models by default.** Fallback targets are free unless the user opts into paid.
- **Privacy.** Zen free models are a feedback-collection tier — personal use only. Any future
  live resolver must not send prompt content to a quota service.
- Tests run per package (`cd packages/<name> && bun test`); typecheck with `bun typecheck`.
- No AI attribution in commits. Sole author: Bagus Giovani.

---

## Architecture — the resolver seam

The central decision is that a head's fallback is **a question, not a list**:

> *given this head, the model that just died, and why — what should it run instead?*

```ts
type FallbackReason = "free_tier_limit" | "account_rate_limit" | "model_gone"

type Resolution = {
  model: Provider.Model   // resolved, not an id string — see below
  source: "static" | "live"
  note: string            // human-readable; rendered in the transcript divider
}

interface Resolver {
  resolve(input: {
    head: string                 // "king" | "warrior" | "scout" | ...
    failed: Provider.Model
    reason: FallbackReason
    needs: HeadNeeds
    exhausted: ReadonlySet<string>  // model ids already dead this session
  }): Effect.Effect<Resolution | undefined>
}
```

`model` must be a resolved `Provider.Model`, not an id — F2 shows `streamInput.model` is a
resolved object. The resolver therefore needs the provider registry, which makes it impure and
means it lives beside the registry rather than inside `packages/paradigm`.

Two implementations behind one interface:

- **`StaticResolver`** — walks the head's declared `fallback` list, skipping ids already in
  `exhausted` and ids the registry cannot resolve (F6: a retired model resolves to nothing).
  Zero dependencies. Ships first.
- **`LiveResolver`** — asks a quota source what actually has budget and filters by `needs`.
  **Deferred**, per F7. The interface exists so this slots in without a rewrite.

`packages/paradigm` keeps its I/O-free split: the *declaration* (`needs`, `fallback`) is parsed
and validated there; the *resolution* happens in the new module that can see the registry.

## Schema extension

Two optional fields per head. `parseParadigm` currently ignores unknown keys, so old paradigm
files stay valid and a file with these fields still loads on a build without the feature.

```json
"king": {
  "model": "opencode/deepseek-v4-flash-free",
  "role": "plan, decide, implement carefully, review critically",
  "needs": { "minOutput": 100000, "tools": true, "attachment": false },
  "fallback": [
    "opencode/nemotron-3.5-lightning-free",
    "opencode/nemotron-3-ultra-free"
  ]
}
```

`needs` is the head's *intent* — what the role actually requires. It is what makes the live
resolver possible later, and it is worth declaring even while only the static resolver exists,
because it documents why the fallback list is ordered the way it is. `minOutput` matters most:
five of the eight current free models cap output at 32k, and a king that writes files needs
more.

## Behaviour — the two modes

A paradigm-level toggle, default **on**:

```json
"shift": { "auto": true }
```

**auto: true — head swap.** The resolver runs inside the `set` callback (F2). On a resolution,
`streamInput.model` is mutated so the next *attempt* uses the substitute — and, because that
mutation dies at the next loop step (F10), the swap must **also** be made durable for the
session. Use the mechanism that already exists (F11): publish `SessionEvent.ModelSwitched`, which
writes the `session.model` column and appends a `model-switched` message to the transcript. That
message **is** the announcement the "Honest provenance" constraint asks for — it does not need to
be built. The paradigm on disk is still never written; the next launch is back to normal, because
the override lives on the session row, not in config.

The remaining gap is that the loop reads `lastUser.model` rather than the session row (F12). See
Q3 — that is the one unresolved design decision left in this document.

Two edits are needed on the `retry.ts` side of the seam, and they are the whole of the upstream
diff there:

1. **Suppress the upsell when a swap succeeded.** F1's action object is what the dialog keys off.
   If a substitute was resolved, `retryable()` must return the retry *without* the
   `reason: "free_tier_limit"` action, so no surface has anything to render. If no substitute was
   resolved, the action is still suppressed — the terminal message below replaces it. VanGio never
   emits the Go upsell.
2. **Collapse the delay on a successful swap.** `delay()` honours `retry-after`, which for a Zen
   daily limit is the seconds remaining until UTC midnight (F3/F4). Waiting that long on a model
   we are no longer using is nonsense, so a swapped retry uses the normal initial backoff instead
   of the header value.

**auto: false — paradigm shift.** No swap. VanGio emits an event carrying the reason, which opens
the **existing picker** (shipped 2026-08-06) pre-filtered and pre-explained: *"king's model hit its
free limit; pick a paradigm."* The picker's existing honesty requirement stands — it applies on
restart, and it must say so. This path needs no new mechanism at all; it is the picker plus a
trigger.

**BUILT 2026-08-20, and "no new mechanism" turned out to be literally true.** The trigger is
`tui.command.execute`, whose `command` field accepts any string and which the TUI dispatches by
name against the keymap (`tui/src/app.tsx:987`) — the same keymap the paradigm plugin registers
`paradigm.list` on. So the server opens a plugin's dialog through a channel that already existed,
with no new event type and no schema change. A `tui.toast.show` carries the explanation. The offer
fires **once per session**: the retry loop calls the hook on every attempt, and offering six times
in ninety seconds would be worse than not offering at all. Verified by live A/B on one paradigm
bound to a retired model — `auto: false` died without swapping, `auto: true` degraded and
answered, only the toggle differing.

## Error handling

- **Resolver returns `undefined`** (chain exhausted): do **not** fall through to upstream's
  behaviour, or the upsell returns. Emit VanGio's own terminal message — which head died, what was
  tried, and when the wall lifts. The reset time is computable client-side: seconds to the next
  UTC midnight, the same arithmetic as `getRetryAfterDay` (`ipRateLimiter.ts:52-54`).
- **Loop protection:** every swapped-from model id joins `exhausted` for the session and is never
  returned again. A hard cap on swaps per session (proposed: 3) prevents walking a long chain
  collecting 429s — which is exactly what happens if Q1 resolves to "shared bucket."
- **Resolution that fails immediately:** if the substitute also 429s on its first attempt, it is
  added to `exhausted` and the resolver is asked again. The cap applies.
- **Registry miss:** a `fallback` entry naming a retired model (F6) is skipped silently during
  resolution, but logged once per session so the staleness is visible rather than invisible.

## Testing

- `parseParadigm` accepts/rejects the new fields; old files without them still parse. Pure, in
  `packages/paradigm/test/schema.test.ts`.
- `StaticResolver` unit tests against a fake registry: skips exhausted, skips unresolvable,
  respects order, returns `undefined` on an empty chain. Pure.
- Loop protection: a chain where every entry 429s terminates at the cap, not infinitely.
- **Proof of F2 — DONE.** `packages/opencode/test/session/retry-model-swap.test.ts` reproduces the
  processor's retry wiring against the real `SessionRetry.policy` and asserts the next attempt
  goes out on the mutated model. It turned out not to need the ConPTY harness: the claim is about
  `Effect.retry` re-evaluating a closure, which is exactly what a unit test can pin down. Keep it
  — it is also the regression guard for the monthly upstream merge. If upstream ever hoists the
  model read above `Effect.retry`, this goes red instead of the feature silently dying.
- **DONE 2026-08-20 — the end-to-end run proving a swap survives a tool-call round trip** (F10).
  It did not need ConPTY after all: the HTTP API reaches every part of the path the TUI would,
  so the run is a script against `vangio serve` rather than a terminal harness. One turn on
  `deepseek-v4-flash-free`, switched mid-flight through `POST /api/session/:id/model`, produced
  six assistant messages — one on deepseek, five on `nemotron-3.5-lightning-free`. See Q3.
- `SwitchedModel.switched` unit tests pin the gate itself: unchanged row, moved model, moved
  provider, moved variant, first write onto an empty row, and `"default"`/absent variant read as
  the same. Pure, in `packages/opencode/test/session/switched-model.test.ts`.
- **A caveat for whoever runs the suite next:** `test/session` is not deterministic on this
  machine. Measured the same day, clean `dev` gave `prompt.test.ts` 40 pass / 4 fail while the
  patched tree gave 41 / 3, and `revert-compact.test.ts` went 8/0, then 6/2, then 8/0 on repeat
  runs of identical code. Compare a *baseline on stashed changes* before reading anything into a
  red line here, and check whether the file even references the code under test —
  `revert-compact` and `snapshot-tool-race` never touch `SessionPrompt`; they are the Windows
  git-snapshot timing class.

## Scope split

**In scope:** the schema fields, `StaticResolver`, the two modes, the terminal message, loop
protection, and whichever Q3 option is chosen for durability.

**Dropped from scope as already-built (F11):** the transcript divider. `SessionMessage.ModelSwitched`
is emitted, persisted and rendered today; publishing the event gets the announcement for free.
**Dropped as done (F2):** the runtime proof.

**Not in scope, deliberately:**
- `LiveResolver` and any OmniRoute integration (F7 — no usable backend today).
- The flagship's use of the same capability data. It inherits this interface; it does not
  live here.
- Anything touching agent-config resolution (F9 — not needed, and gated on the upstream-tracking
  decision).

## Open questions

- **Q1 — Is Zen's daily bucket per-model or shared?** (F3.) Unanswerable without hitting the wall,
  and F4 means there is no cheaper signal. **Resolution:** instrument it rather than force it — on
  the next genuine 429, immediately issue one minimal request to each of the other seven free
  models and record which also 429. One real limit-hit answers it completely. If the bucket is
  shared, the static Zen-only chain is near-worthless and the feature's value rests entirely on
  non-Zen fallback targets, which today means paid models or nothing.
- **Q2 — Does the F2 swap actually work at runtime?** **ANSWERED YES, 2026-08-17**, at the retry
  layer, by `packages/opencode/test/session/retry-model-swap.test.ts` (4 tests, green). The
  mutation is picked up on the next attempt, the `free_tier_limit` reason is visible to `set` so
  the swap can be gated, and a chain can be walked across successive failures. **But see F10:
  the answer is yes for one loop step, not for the turn.** The end-to-end ConPTY run is still
  worth doing once the durable half of Q3 exists — there is nothing meaningful for it to observe
  until then.

- **Q3 — ANSWERED YES to option (1), 2026-08-20. How does a swap survive the loop-step
  boundary?** (F10/F11/F12.) F2 covers the
  current step, `ModelSwitched` covers the next prompt, and the steps in between are covered by
  neither. Three candidates, none yet chosen:
  1. **Publish `ModelSwitched` and teach the loop to prefer it.** One extra line at prompt.ts:1141
     to consult `currentModel()` when the session row disagrees with `lastUser.model`. Reuses
     F11 wholesale — durable, event-sourced, already rendered in the transcript. Cost: a third
     upstream seam, in the agent loop, which the Global Constraints above currently forbid.
  2. **Rewrite the persisted user message's `model`.** Zero prompt.ts changes — the loop's
     DB re-read at :1092 would pick it up on its own. Cost: it edits history, so the transcript
     would claim the user's turn was always sent to the fallback model. Conflicts with
     "Honest provenance" unless paired with an explicit `ModelSwitched` marker.
  3. **Ship `auto: false` only.** The paradigm-shift path needs no seam at all (it is the
     existing picker plus a trigger), and it sidesteps F10 entirely. Smallest diff by far;
     costs the automatic degradation that motivated the feature.
  **Recommendation: (1).** It is the only option that is both durable and honest, it reuses a
  mechanism that already exists end to end rather than inventing one, and the "third seam"
  objection is weaker than it looks — the change is a single conditional at a stable call site,
  far smaller than the `retry.ts` edits already budgeted. The Global Constraints section should
  be amended to name prompt.ts:1141 as an allowed seam.

  **DECIDED 2026-08-20: option (1), built, and the Global Constraints are amended.**
  `packages/opencode/src/session/switched-model.ts` holds the logic; `prompt.ts` gains an import,
  a baseline read before the loop, the conditional, and the assistant message's `variant` (which
  has to travel with the model it is paired against, or a swap leaves the old model's variant on
  the new model's message).

  **One correction to the recommendation above, and it matters.** "Consult `currentModel()` when
  the session row disagrees with `lastUser.model`" is the wrong gate. It reads the row as a quiet
  fallback slot that is normally empty, and it is not: `createUserMessage` writes it on *every*
  user message via `Session.setAgentModel` (prompt.ts:672-689). Measured on this machine's DB,
  every session carries one. Under the simple rule, a row holding an agent's configured model —
  or anything left from an earlier turn — would beat the model the current turn was actually sent
  with, silently, on a path with no test coverage. The gate that ships is **"changed since this
  turn began"**: the loop reads the row once before its first step and only defers to a row that
  moved after that. That also makes the feature's intent exact, because a mid-turn move is
  precisely the event worth honouring.

  **Proven live, 2026-08-20**, which is the end-to-end run the Testing section lists as still
  owed. One turn, sent on `deepseek-v4-flash-free`, switched mid-flight via the real publish path
  (`POST /api/session/:id/model` → `switchModel` → `ModelSwitched` → projector → row). Six
  assistant messages: the first on deepseek finishing `tool-calls`, then **five consecutive steps
  on `nemotron-3.5-lightning-free`**. F10's "dies at the next tool-call round trip" is closed.

  **Known consequence, accepted:** an override that cannot be resolved now fails the *current*
  turn rather than only the next prompt, with the same `Model not found` error `lastUser.model`
  would produce. Deliberately not special-cased — the resolver is specified to skip ids the
  registry cannot resolve (see Architecture), so a bad id should never reach the row.

## Current free roster (re-measured 2026-08-20, evening)

The seven Zen models a fallback chain may actually name. All support tool calls. Only
`mimo-v2.5-free` accepts images.

| Model | Context | Output | Images |
|---|---|---|---|
| `nemotron-3-ultra-free` | 1,000,000 | 128,000 | no |
| `nemotron-3.5-lightning-free` | 262,144 | 262,144 | no |
| `muse-spark-1.2-contributor-free` | 1,048,576 | 131,072 | **yes** |
| `deepseek-v4-flash-free` | 200,000 | 128,000 | no |
| `mimo-v2.5-free` | 200,000 | 32,000 | **yes** |
| `big-pickle` | 200,000 | 32,000 | no |
| `hy3-free` | 190,000 | 64,000 | no |

**`ling-3.0-tiny-free` was in the 2026-08-13 version of this table and is gone from this one.**
It is still in the catalog and still described with plausible limits — it is `status:
"deprecated"`, which the provider registry deletes outright (`provider.ts:1663-1664`), so a chain
that fell back to it would swap one dead model for another. Twenty of the twenty-seven Zen models
`GET /api/model` returns are in that state. **`StaticResolver` must filter on `status`, not just
on "does the registry resolve it"** — and F6's warning stands with a sharper edge: the catalog
listing a model, with capabilities and a price, is not evidence it can be run. Send it one prompt.

**This table lost a row four hours after it was written.** `laguna-s-2.1-free` was in the morning
version, went `status: deprecated` the same day, and took four presets' scout binding down with
it. "Perishable" is not a figure of speech here and "re-check at every merge" is too slow — the
right defence is `needs`, which describes the role and never rots, not a pinned id that does.
