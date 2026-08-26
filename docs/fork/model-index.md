# Model Index — what to bind each schemata head to

**Verified 2026-08-17.** Capability numbers come from the models.dev catalog; availability comes
from each provider's live endpoint, never from the catalog (see *Staleness* at the bottom — this
distinction has already bitten us twice). Rate limits come from provider docs, dated below.

**Treat this file as perishable.** Re-verify at every upstream merge and before shipping any
preset schemata.

---

## 1. What you can actually use right now

| Provider | Credential | Status |
|---|---|---|
| **OpenCode Zen** | via OpenCode account | **Working** — 7 free models |
| **Zhipu GLM** | `ZHIPU_API_KEY` (set) | **Working** — proven end to end 2026-08-14 |
| NVIDIA NIM | none | Needs signup. **The one to get.** |
| Google AI Studio | none | Needs signup |
| Groq | none | Needs signup — but see the TPM trap |
| Cerebras | none | Needs signup — 8k context cap makes it near-useless here |
| Mistral | none | Needs signup — limits undocumented |
| Anthropic | none | Config block exists, no key, paid only |

So the honest answer to "we have 2 or 3 other providers" is: **you have one.** Zhipu. Everything
else on this page is a signup away, and NVIDIA is the one that unlocks the most for the least work
— one key covers a credible fallback for every head.

---

## 2. Role → recommended binding

Roles are what a schemata head *does*. What each role actually needs from a model:

| Role | Needs most | Why |
|---|---|---|
| **king / planner** | large context, strong reasoning | holds the whole plan and every delegation result |
| **coder / implementer** | **large output ceiling** | writes whole files; a 32k output cap truncates real work |
| **reviewer / tester** | large context, reasoning | reads big diffs, needs to hold both sides |
| **researcher / scout** | speed and cheapness, low output | many small lookups; output is a few lines |
| **documenter** | large output, decent prose | writes long-form; context matters less |
| **vision / UI** | image input | almost nothing free accepts images |

### Free-only picks (today, no new accounts)

| Role | 1st choice | 2nd choice | Note |
|---|---|---|---|
| king | `opencode/nemotron-3-ultra-free` | `opencode/nemotron-3.5-lightning-free` | 1M context vs 262k |
| coder | `opencode/nemotron-3.5-lightning-free` | `zhipu/glm-4.7-flash` | 262k output is the best free ceiling anywhere |
| reviewer | `opencode/hy3-free` | `opencode/big-pickle` | 190k / 200k context, 64k / 32k out |
| researcher | `opencode/hy3-free` | `opencode/big-pickle` | no genuinely tiny free model survives — see Staleness |
| documenter | `opencode/nemotron-3.5-lightning-free` | `zhipu/glm-4.7-flash` | both 131k+ output |
| vision | `opencode/mimo-v2.5-free` | `opencode/muse-spark-1.2-contributor-free` | the only two free Zen models that accept images; the second is newer, far larger, and a contributor tier |

### With an NVIDIA key (recommended)

| Role | Pick | Context / Output |
|---|---|---|
| king | `nvidia/deepseek-ai/deepseek-v4-pro` | 1,048,576 / 393,216 |
| coder | `nvidia/qwen/qwen3-coder-480b-a35b-instruct` | 262,144 / 66,536 |
| coder (alt) | `nvidia/nvidia/nemotron-3-super-120b-a12b` | 262,144 / **262,144** |
| reviewer | `nvidia/moonshotai/kimi-k2-instruct-0905` | 262,144 / 262,144 |
| researcher | `nvidia/nvidia/nemotron-3.5-lightning-30b-a3b` | 262,144 / 262,144 |
| vision | `nvidia/moonshotai/kimi-k2.6` | 262,144 / 262,144, images |

---

## 3. Provider detail

### OpenCode Zen — 7 free models (live provider state, re-measured 2026-08-21)

All support tool calls. Two accept images.

**Three models have been retired out from under this project in two days.** `kimi-k2.5-free` and
`laguna-s-2.1-free` on 2026-08-20; **`deepseek-v4-flash-free` on 2026-08-21** — which was the
default king in `gryphon` and the configured default model. `x-preview-f-free` arrived in the same
refresh, unmeasured. Seven models every time, a different seven every time. **Assume this table is
wrong**, and prefer `needs` over pinned ids everywhere it is possible.

| Model | Context | Output | Images |
|---|---|---|---|
| `nemotron-3-ultra-free` | 1,000,000 | 128,000 | no |
| `nemotron-3.5-lightning-free` | 262,144 | 262,144 | no |
| `muse-spark-1.2-contributor-free` | 1,048,576 | 131,072 | **yes** |
| `x-preview-f-free` | — | — | — |
| `mimo-v2.5-free` | 200,000 | 32,000 | **yes** |
| `big-pickle` | 200,000 | 32,000 | no |
| `hy3-free` | 190,000 | 64,000 | no |

**Why 7 and not 27.** `GET /api/model` lists 27 Zen models and this table lists 7, and the seven
are the right number. The other 20 are `status: "deprecated"`, which `provider.ts:1663-1664`
deletes from the runtime registry — they can be listed, priced and described, and they cannot be
run. Re-measured 2026-08-20; `kimi-k2.5-free`, `mimo-v2-omni-free`, `minimax-m3-free` and
`qwen3.6-plus-free` are all in that group. Before adopting anything a catalog offers, send it one
prompt — that check is what caught `kimi-k2.5-free` in the morning and `laguna-s-2.1-free` by
evening.

**Limit shape:** per-IP daily counter, no quota header ever reaches the client. Whether the bucket
is per-model or shared across all default-limit free models is **still unresolved** (Q1 in the
fallback spec). If it is shared, running six heads in parallel on Zen drains one budget six times
faster and they all fail together — the single most important open question for parallel schemata.

**Privacy:** every Zen free model is a feedback-collection tier; data may be used for training.
Personal and hobby use only.

### Zhipu GLM — working today

| Model | Context | Output | Cost |
|---|---|---|---|
| `glm-4.7-flash` | 200,000 | 131,072 | free |
| `glm-4.5-flash` | 131,072 | 98,304 | free |

**Hard limit: one in-flight request at a time** — measured 2026-08-14 (three parallel requests gave
two 429s and one 200), and confirmed by Zhipu's docs. Fine as a sequential fallback; **must never
be bound to a head that runs in parallel.**

It is a *reasoning* model: a low `max_tokens` returns empty content because the budget is spent
thinking. Paid tier if ever needed is the GLM Coding Plan, ~$18/mo Lite list.

### NVIDIA NIM — the recommended signup

Free via the NVIDIA Developer Program: ~1,000 inference credits (≈1 credit per call), up to 5,000
more on request, **40 RPM** (200 on application), no credit card. 100 models in the catalog, 22 of
them tool-capable with ≥256k context.

**Terms are stricter than the others:** trial/evaluation use only, usage is logged, no confidential
data. Production use requires NVIDIA AI Enterprise. Fine for VanGio's personal-use posture; do not
build anything client-facing on it.

OpenCode ships a first-class `nvidia` provider plugin (injects `HTTP-Referer` / `X-Title` /
`X-BILLING-INVOKE-ORIGIN`). Provider id `nvidia`, env `NVIDIA_API_KEY`, base
`https://integrate.api.nvidia.com/v1`, npm `@ai-sdk/openai-compatible`. **Use this, not OpenRouter.**

### Google AI Studio

Free tier covers Flash-class only — Pro moved to paid in April 2026. `gemini-3-flash` /
`gemini-3.5-flash-lite`: 1,048,576 context / 65,536 output, tools, **images**. Live per-project
limits are visible only in AI Studio and vary by region and account age, so treat any published
RPM/TPD number as indicative.

Strong second vision option, and the only non-Zen free path to a 1M context window.

### Groq — fast, but read this before binding it

Free tier: 30 RPM, **6,000 tokens per minute**, 14,400 requests/day, org-wide (extra keys don't
help). Best model for our purposes is `llama-3.1-8b-instant` at 131k/131k.

**The 6,000 TPM cap is disqualifying for a coding-agent head.** One request carrying 20–50k tokens
of file context blows a full minute of budget in a single call. Groq is excellent for tiny, high-
frequency prompts and wrong for anything that reads source files. Do not bind it to a researcher
head expecting it to grep a repo.

### Cerebras — skip for now

Genuinely generous on tokens (1M/day, no card) and very fast, but the **free tier caps context at
8,192 tokens**, and the catalog shrank to `gpt-oss-120b` and `zai-glm-4.7` in 2026. 8k context
cannot hold a system prompt plus a source file. Not viable as a schemata head.

### Mistral

Free "Experiment" tier reaches all models with roughly a 1B-token monthly cap, but Mistral stopped
publishing free-tier rate numbers — they're only visible in the Admin Console, and one tracked
report cites 1 RPM. **Unverifiable from outside; do not put it in a preset schemata** until someone
holds a key and measures it.

### OpenRouter

Deliberately not indexed. It aggregates 352 models with per-model free-tier terms that change
without notice, and NVIDIA gives us the same underlying models with a first-class OpenCode plugin
and clearer terms. Revisit only if NVIDIA's credits prove too tight.

---

## 4. Staleness — the recurring failure

Free model ids get retired with **no client-visible signal**, and every catalog lags:

- `north-mini-code-free` — retired 2026-08-12. Both paradigms pointed at it; nothing caught it.
- `ling-3.0-tiny-free` — the model we *replaced it with*. Documented in `zen.mdx` at `upstream/dev`,
  and **absent from the live endpoint on 2026-08-17.** Caught only by querying the live catalog.

Two rules follow:

1. **models.dev and `zen.mdx` are authoritative for capabilities, never for availability.**
   Availability comes from `https://opencode.ai/zen/v1/models` and nothing else.
2. **Re-verify every `*-free` id in every schemata** at each upstream merge, and before publishing
   any preset. This is exactly what the `needs` + `fallback` fields in the fallback spec exist to
   survive — a retired model should degrade, not dead-end.

Reproduce the availability check with:

```sh
curl -s https://opencode.ai/zen/v1/models | tr ',' '\n' | grep -o '"id":"[^"]*free[^"]*"' | sort -u
```

---

## 5. Consequences for the schemata design

- **Six parallel heads on free tiers is not currently safe.** Zhipu is 1-concurrent by contract,
  Zen's bucket may be shared (Q1), and Groq's TPM cap rules it out. Parallel posture should default
  to off until Q1 is answered, or until heads sit on providers with independent quotas.
- **Cross-provider chains are worth more than deep single-provider chains** — a fallback that stays
  inside Zen may be worthless if the bucket is shared.
- **Images are nearly unavailable.** Exactly one free model (`mimo-v2.5-free`) accepts them. Any
  role a user marks as needing vision has one free option and otherwise needs NVIDIA or Google.
- **Output ceiling is the binding constraint for implementer roles**, not context. Several free
  models cap output at 32k, which truncates real file writes. `nemotron-3.5-lightning-free` at 262k
  is the standout and should be the default coder binding.

## Measured time-to-first-token (2026-08-26)

`bun packages/paradigm/script/latency-probe.ts --kb <n> --runs <n>` — context built from
`packages/opencode/src/session/*.ts`, timed against the provider directly so instance boot is not
counted. Gateway idle budget observed at **~123s** (two real failures, 2026-08-23).

| Model | 60KB | 250KB | 250KB, worst of 3 |
|---|---|---|---|
| `nemotron-3-ultra-free` | 6.0s | 4.9s | **11.0s** |
| `nemotron-3.5-lightning-free` | 2.7s | 3.0s | — |
| `hy3-free` | 8.2s | 26.2s | **17.0s** |

**Nothing here is close to the budget, and the probe does NOT reproduce the 2026-08-23 failure.**
That is the finding, not a footnote. Two things follow.

First, **the suspicion that a 1M-context model is a bad interactive default is not supported.**
`nemotron-3-ultra-free` is the *fastest to first token* of the three at 250KB. Whatever cost its
context window carries, it is not paid at prefill.

Second, **if prefill does not explain a 123-second silence, something time-varying does** — free-tier
queueing or provider contention are the obvious candidates, and neither is reproducible on demand.
So this table says a model is *structurally* fast enough; it cannot promise a given turn will be.
`hy3-free` is the one to watch: it is the only model whose figure moves sharply with context
(8.2s → 26.2s), and it varies run to run.

Re-measure after any binding change, and read the WORST sample, never the mean.
