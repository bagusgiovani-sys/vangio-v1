# Free-Tier Fallback — Design

> **Status: DESIGN, not yet planned.** One gating finding (F2) is read-verified but not
> runtime-proven, and one question (Q1) is still open. Do not let an implementation plan claim
> the auto path works until Task 1 of that plan has actually been run.

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
| F2 | **The model CAN be swapped between retry attempts.** `LLM.StreamInput` carries `model: Provider.Model`. `llm.stream(streamInput)` is called *inside* the effect wrapped by `Effect.retry`, so it is re-evaluated on every attempt, re-reading `streamInput.model`. The `set` callback fires on each retry decision, before the delay, with `streamInput` in lexical scope. Mutating `streamInput.model` there changes the model used by the next attempt. **Read-verified only — not yet runtime-proven.** | `packages/opencode/src/session/llm.ts:35-48`; `packages/opencode/src/session/processor.ts:627, 640, 660-673` |
| F3 | **Zen's free limit is a per-IP daily counter whose bucketing depends on server config we cannot see.** If a model carries an explicit `rateLimit`, the Redis key is `YYYYMMDD` + **the first two characters of the model id**; otherwise it is `YYYYMMDD` alone, i.e. **one budget shared by every default-limit free model**. Keyed on IP, not account. A grace period gives 2× the daily limit while lifetime count < `dailyLimit × 7`. The numbers live in the `ZEN_LIMITS` SST secret. | `packages/console/app/src/routes/zen/util/ipRateLimiter.ts:19,23,37-39`; `infra/console.ts:271` |
| F4 | **No quota telemetry ever reaches the client.** Zen's handler copies only `content-type` and `cache-control` onto the response. There is no remaining/limit/reset header to read. The 429 is the only signal. | `packages/console/app/src/routes/zen/util/handler.ts:300-306` |
| F5 | The *keyed* limiter is a different mechanism entirely: per-**minute** bucket (`yyyyMMddHHmm`, 60s expiry), default 1000. Do not conflate it with F3. | `packages/console/app/src/routes/zen/util/keyRateLimiter.ts:15,16-20,33` |
| F6 | **Free models are retired without any client-visible signal, and the catalog lags.** `north-mini-code-free` was removed from Zen's published roster on 2026-08-12; both paradigms still bound scout to it and every layer accepted it. models.dev carries 26 `opencode` ids ending `-free` while Zen publishes 8. **models.dev is not authoritative for availability.** | upstream `1f94d8a3c8`; `packages/web/src/content/docs/zen.mdx` @ upstream/dev; `packages/paradigm/src/schema.ts:43-52` |
| F7 | **OmniRoute cannot back a live resolver today.** Installed and run on this machine (v3.8.48): 1321 packages, **2.53 GB**, 9 minutes. Server binds **`0.0.0.0`** (not localhost) and logs that the management password is the well-known default `CHANGEME`. `/v1/models` answers unauthenticated with 99 models across 7 real pools — but `providers list` reports **"No providers configured"**, `/api/free-tier/summary` returns **401**, and `quota` returns `{"error":"No quota data"}`. Two keyless models tested: `aug/claude-haiku-4.5` returned HTTP 200 with an **empty stream, 0 tokens**; `ddgw/gpt-4o-mini` returned **503**. Its catalog advertises `oc/deepseek-v4-flash-free` at 1M context / 384k output; Zen and models.dev both say **200k / 128k**. `omniroute stop` leaves an orphan `server-ws.mjs` holding the port with a 4 GB heap allowance. | measured 2026-08-13, this machine |
| F8 | `omniroute setup-opencode` hard-codes `~/.config/opencode/opencode.json` with no path override — the wrong directory for VanGio, which reads `~/.config/vangio/`. It does support `--dry-run`, so its output can be inspected and placed by hand. | `omniroute setup-opencode --help`, v3.8.48 |
| F9 | **The 2026-08-06 live-switch blocker does not apply here.** That blocker is in the *config* layer: the v1 `config` hook fires once at boot, so the active-paradigm marker cannot change live. F2 is in the *session* layer and never re-resolves agent config. Option C's strategic cost is sidestepped entirely. | `docs/superpowers/plans/2026-08-06-paradigm-picker-options.md:18-29` |

**Consequence of F7:** every instinct to make OmniRoute the quota backend is premature. It is a
plausible future substrate, not a usable one today, and its capability metadata is wrong for the
one provider we can independently check. Build the static resolver; keep the interface open.

**Consequence of F3:** a Zen-only fallback chain may be worthless. See Q1.

---

## Global Constraints

- **Patch, don't rewrite.** New behaviour lives in new files. The only upstream files this design
  may touch are `retry.ts` and `processor.ts`, at the two seams named in F1 and F2, and the diff
  must stay small enough to re-apply by hand at every upstream merge.
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
`streamInput.model` is mutated and a divider is written into the transcript naming the old model,
the new model, and the reason. The session continues. The paradigm on disk is untouched; the next
launch is back to normal.

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
- **Runtime proof of F2** — the one test that cannot be a unit test. Under the ConPTY harness
  (`.claude/skills/verify/SKILL.md`), force a `FreeUsageLimitError`, mutate `streamInput.model` in
  `set`, and confirm the next attempt goes out on the new model. `--version` is not proof.

## Scope split

**In scope:** the schema fields, `StaticResolver`, the two modes, the transcript divider, the
terminal message, loop protection, and the F2 runtime proof.

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
- **Q2 — Does the F2 swap actually work at runtime?** Read-verified only. Gates the whole auto
  path. If it fails, `auto: true` is removed and only the paradigm-shift path ships.

## Current free roster (2026-08-13)

Capability data from models.dev, cross-checked against `zen.mdx` at upstream/dev. All eight
support tool calls. Only `mimo-v2.5-free` accepts images.

| Model | Context | Output | Images |
|---|---|---|---|
| `nemotron-3-ultra-free` | 1,000,000 | 128,000 | no |
| `nemotron-3.5-lightning-free` | 262,144 | 262,144 | no |
| `ling-3.0-tiny-free` | 262,144 | 32,768 | no |
| `laguna-s-2.1-free` | 256,000 | 32,000 | no |
| `deepseek-v4-flash-free` | 200,000 | 128,000 | no |
| `mimo-v2.5-free` | 200,000 | 32,000 | **yes** |
| `big-pickle` | 200,000 | 32,000 | no |
| `hy3-free` | 190,000 | 64,000 | no |

Treat this table as perishable (F6). Re-check it against `zen.mdx` at every upstream merge.
