# v6 — AI-Assisted Paradigm Builder

> Written 2026-08-27. Vocabulary follows `2026-08-17-gryphon-paradigm-design.md` and is not
> restated.
>
> **Corrected 2026-08-27, before any code was written.** Two assumptions in the first draft were
> checked against the API and both were wrong. §3's `/craft <goal>` is **not expressible** — slash
> commands dispatch with no payload. §4's `generateObject` is **not reachable** from a TUI plugin —
> it needs provider access the plugin does not have. Both replacements are better than what they
> replace; the reasoning is kept inline rather than deleted, because the dead ends are the useful
> part.

---

## 1. The whole feature in one paragraph

A user describes a goal — *"I want to make TikTok videos to sell bras"* — and gets a **draft
paradigm** in the existing Craft review step, where every v5 affordance already works. That is the
entire deliverable. **The only genuinely new thing is turning a sentence into a draft.** The
schema, the parser, the capability resolver, the live-catalog filter, the review screen, name
validation and the file writer all shipped in v4 and v5.

**Decided 2026-08-27:** the roadmap's "AI asks 3–5 clarifying questions" is **not in v6.0**. The
review step is the clarification — the user sees the whole team and edits it with machinery that
already works, rather than answering questions blind before seeing anything.

---

## 2. Verified findings this rests on

Measured 2026-08-27, not assumed. Full entries in `errors.md`.

1. **`Agent.generate` already ships this shape** — `agent.ts:369`, wired to `vangio agent create`.
   It ran twice on `nemotron-3-ultra-free` and produced well-formed output both times. Its model
   policy is `input.model ?? provider.defaultModel()` — active model, `-m` to override. **v6
   matches that contract.** A pinned generation model was considered and withdrawn.
2. **`generateObject`'s schema never reaches Zen** — `@ai-sdk/openai-compatible` defaults
   `supportsStructuredOutputs` to false and downgrades to `json_object`. It still validates
   client-side and fails loudly, so the risk that motivated pinning does not exist.
3. **Bindability comes from `vangio models`**, not models.dev and not the provider endpoint.
   `packages/paradigm/src/available.ts` already knew this — `isRunnable` filters `status` — which
   is why §4's resolver reuse is safe. It was `model-index.md` and `OVERVIEW.md` that were stale.

---

## 3. Surface — a `goal` step at the head of the Craft wizard

**`/craft <goal>` is impossible.** `useCommandSlashes` (`packages/tui/src/keymap.tsx:287`) builds
every slash entry as `onSelect: () => keymap.dispatchCommand(entry.command.name)`. The command is
dispatched **by name, with no payload**, and `run()` takes no arguments. Nothing in the TUI plugin
command API carries typed text into a handler.

**So the goal is asked for as the wizard's first step**, using the `DialogPrompt` the `name` step
already uses:

```
/craft
  └─ step "goal"   "What is this team for?  (blank = choose heads yourself)"
        ├─ blank      -> step "name"  ... the entire v5 flow, unchanged
        └─ non-blank  -> step "generating" -> step "review"
```

This keeps the spec's actual intent — **no new dialog stack** — while being strictly better than
the argument form:

- **Discoverable.** `/craft <goal>` is invisible unless documented; a prompt that asks the question
  teaches itself.
- **v5 is untouched on the blank path.** Existing behaviour is reached by pressing Enter.
- It is one more `Step` in a pure state machine that is already fully unit-tested, and one more
  explicitly painted branch in `render()` — which is what the 2026-08-18 repaint rule demands
  anyway (*a step is painted explicitly in this TUI or it is not painted at all*).

*Rejected:* `/compose` and `/assemble` — a second verb for the same destination, each needing its
own dialog stack, and neither solving the payload problem.

---

## 4. Generation — through the session API, not `generateObject`

**A TUI plugin cannot call `generateObject`.** It has no provider, no credentials and no language
model; `Agent.generate` is server-side. Adding a server endpoint would touch upstream and violate
constraint #1.

**The engine already exposes exactly what is needed over HTTP.** `SessionPromptData.body` accepts:

```ts
format?: { type: "json_schema", schema: JsonSchema, retryCount?: number }
```

and `packages/opencode/src/session/prompt.ts:1271-1341` implements it as a **`StructuredOutput`
tool with `toolChoice: "required"`**, plus a system prompt, raising a typed `StructuredOutputError`
if the model finishes without calling it. The result lands on `message.structured`.

This is **better than `generateObject` on every axis that matters here**:

- Structure is enforced by **tool calling**, which every one of the seven Zen free models supports —
  rather than by a `response_format` the provider silently drops.
- **`retryCount` is built in.** The bounded retry §5 asked for is a field, not code.
- Zero upstream files touched. It is a client call.

The call: `api.client.session.prompt({ path: { id }, body: { format, system, model?, parts } })` on
a scratch session, with `model` omitted so the session's own model — **the active king** — answers,
matching `Agent.generate`'s contract.

### The schema asks for a shape, never a model id

**This is the load-bearing decision of the spec and it survives both corrections.**

```ts
{
  name:        string    // kebab-case, re-validated by validateName()
  description: string    // one sentence
  shape:       "court" | "legion"
  heads: Array<{
    role:    string      // MUST be an id from roles.json
    purpose: string      // becomes head.role - the prose duty
  }>
  routing:    string[]
  discipline: Record<string, string>
}
```

**No `model` field exists anywhere.** Model ids are filled in afterwards by the existing resolver:
for each head's `role`, take `roles.json`'s ordered `picks`, filter by `needs` against the
credential-filtered runnable catalog (`loadCandidates` + `modelOptions`), take the first survivor.

Why this matters more than it looks:

- **It makes the stale-binding failure class unreachable.** An LLM asked for a model id will
  confidently produce `north-mini-code-free`, `ling-3.0-tiny-free` or `deepseek-v4-flash-free` —
  plausible, in its training data, none bindable. Four such bindings have died silently in this
  project already. A generator that cannot name a model cannot reproduce that bug.
- Role ids are a closed set of four, so a hallucinated role is caught by `getRole()`.
- `roles.json` stays the single source of model policy for hand-written and generated paradigms
  alike, with no second opinion.

**Prompt inputs:** the goal sentence, the `roles.json` catalog (titles, summaries, `mandatory`),
the shape rules (king mandatory, 2–7 heads, legion = king plus one repeated worker), and the
existing paradigm names to avoid.

---

## 5. Validation and repair

Layered, cheapest first. **Every layer already exists:**

| Layer | Mechanism | On failure |
|---|---|---|
| Structure | engine's `StructuredOutput` tool + `retryCount` | `StructuredOutputError` |
| Name | `validateName()` — bundled names, bad chars, collisions | fall back to the `name` step |
| Roles | `getRole(id)` per head | reject the draft |
| Shape | `canFinish()` — at least 2 heads, king in slot 0 | reject the draft |
| Bindability | `modelOptions()` against the runnable catalog | head reported by name |
| Final | `parseParadigm()` before write | refuse, keep the user on review |

**`retryCount: 1`, then fall back to the v5 blank wizard.** Never leave the user holding nothing,
and never retry unbounded — a free tier that has started refusing will refuse again, and a silent
retry loop is the failure shape this project keeps logging.

A head whose role resolves to no bindable model is **reported, not silently dropped** — the rule
v5 settled on for Craft's model list.

---

## 6. What happens after review

Nothing new. `writeParadigm()` writes `~/.config/vangio/paradigms/<name>.json`; activation writes
the marker; **a paradigm switch still requires a restart** (measured 2026-08-06, unchanged). v6
must not imply otherwise in its success text.

**One additive schema field:** generated paradigms record their `goal` sentence. Optional, ignored
by every existing consumer, and the cheapest thing that makes v7's self-improvement loop reachable
later — you cannot improve a team without knowing what it was for. Adding it after v6 ships means
every v6-era paradigm lacks it.

---

## 7. Hard constraints

1. **Everything stays inside `packages/paradigm`.** v5 shipped 12 commits with zero upstream files
   touched; v6 does the same. If a change appears to need an upstream seam, that is a signal to
   redesign, not to add a fifth seam.
2. TDD throughout, per package: `cd packages/paradigm && bun test`.
3. Live ConPTY verification of the real flow before it is called done — `--version` proves nothing.
4. No new storage path, so hard rule #5 does not fire.
5. Generation runs on the active king by default. No pinned model.

---

## 8. Open questions

1. **Reliability is unmeasured.** One successful sample on one model is not a rate. If generation
   proves flaky on weaker kings the answer is `retryCount` and the §5 fallback, not a pinned model.
2. **Scratch-session hygiene.** Generation needs a session to prompt. Whether it reuses the current
   one (pollutes the transcript) or creates and discards one (costs a round trip) is an
   implementation call to settle during Task 3, on measurement.

---

## 9. Out of scope

- Autonomous generation with no review (v7).
- Any feedback or self-improvement loop (v7; blocked on having no outcome signal at all).
- Field-by-field editing of arbitrary heads — out of scope in v5 and still is.
- Live paradigm switching without a restart.
- Clarifying questions (decided 2026-08-27; revisit in v6.1 only on evidence).
