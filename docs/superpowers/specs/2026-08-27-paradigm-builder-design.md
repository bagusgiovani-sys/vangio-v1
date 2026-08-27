# v6 — AI-Assisted Paradigm Builder

> Written 2026-08-27. Vocabulary follows `2026-08-17-gryphon-paradigm-design.md` and is not
> restated. Nothing here is implemented.

---

## 1. The whole feature in one paragraph

A user types a goal — *"I want to make TikTok videos to sell bras"* — and gets a **draft paradigm**
they land inside the existing Craft review step, where every v5 affordance already works. That is
the entire deliverable. **The only genuinely new thing is turning a sentence into a draft.** The
schema, the parser, the capability resolver, the live-catalog filter, the review screen, name
validation and the file writer all shipped in v4 and v5.

---

## 2. Verified findings this rests on

Measured 2026-08-27, not assumed. Full entries in `errors.md`.

1. **`Agent.generate` already ships this exact shape** — `agent.ts:369`, wired to
   `vangio agent create`. Describe an agent, get a validated config. It ran twice on
   `nemotron-3-ultra-free` and produced well-formed output both times.
2. **Its model policy is `input.model ?? provider.defaultModel()`** — active model, `-m` to
   override. v6 matches it. A pinned generation model was considered and **withdrawn**: the risk
   it addressed does not exist (finding 3), and pinning would have hidden a dropped constraint
   behind a better model.
3. **The `json_schema` response format never reaches Zen.** `@ai-sdk/openai-compatible` defaults
   `supportsStructuredOutputs` to false and downgrades to `json_object`. **But `generateObject`
   validates client-side regardless** (`ai@6.0.168`, `dist/index.js:3443-3468`) and raises
   `NoObjectGeneratedError` on a mismatch. **A non-compliant model therefore fails loudly and
   cannot yield a malformed paradigm.** This is the property the whole design leans on.
4. **Bindability comes from `vangio models`**, not from models.dev and not from the provider
   endpoint. Two models present in both sources were unbindable because they carry
   `status: "deprecated"` and `provider.ts:1664` deletes those. See §4 — this is why the LLM is
   never allowed to name a model.

---

## 3. Surface — `/craft <goal>`, not a new command

**Recommendation: extend `/craft`, do not add a verb.**

```
/craft                      -> the v5 blank wizard, unchanged
/craft <goal sentence>      -> generate a draft, enter at the review step
/craft <goal> -m <model>    -> same, generating on an explicit model
```

Reasons, in order of weight:

- **It adds no new TUI dialog.** `errors.md` 2026-08-18 records that a step is painted explicitly
  in this TUI or it is not painted at all — a reactive `<Show>` inside one `dialog.replace()`
  advances state and never repaints, with no error and a green suite. Every new multi-step dialog
  re-enters that trap. Reusing Craft's already-working step machine avoids it entirely.
- One command to learn. `/clone` is the customise path, `/craft` is the author path, and being
  handed a draft is still authoring.
- The generated draft is a `Draft` (`craft.ts`), so `stepBack` from review lands in the existing
  per-head steps with no new code.

*Rejected:* `/compose` and `/assemble` — a second verb for the same destination, and both would
need their own dialog stack.

---

## 4. The generation call — the LLM picks the team, the resolver picks the models

**This is the load-bearing decision of the spec.**

The model is asked for a **shape**, never for model ids:

```ts
const GeneratedParadigm = Schema.Struct({
  name:        Schema.String,           // kebab-case, validated by validateName()
  description: Schema.String,           // one sentence, becomes paradigm.description
  shape:       Schema.Literals(["court", "legion"]),
  heads: Schema.Array(Schema.Struct({
    role:    Schema.String,             // MUST be an id from roles.json
    purpose: Schema.String,             // becomes head.role - the prose duty
  })),
  routing:    Schema.Array(Schema.String),
  discipline: Schema.Record(Schema.String, Schema.String),
})
```

**No `model` field exists anywhere in that schema.** Model ids are then filled in by the existing
resolver: for each head's `role`, take `roles.json`'s ordered `picks`, filter by `needs` against
the credential-filtered live catalog (the path `ed99da817b` already bound Craft's list to), and
take the first survivor.

Why this matters more than it looks:

- **It makes the entire stale-binding failure class unreachable.** An LLM asked for a model id
  will confidently produce `north-mini-code-free`, `ling-3.0-tiny-free`, or
  `deepseek-v4-flash-free` — all plausible, all in its training data, none bindable. Four such
  bindings have died silently in this project already. A generator that cannot name a model
  cannot reproduce that bug.
- Role ids are a closed set of four (`king`, `warrior`, `scout`, `seer`), so a hallucinated role
  is caught by a `getRole()` lookup rather than surviving to run time.
- It keeps `roles.json` the single source of model policy. Today the catalog decides bindings for
  hand-written paradigms; after v6 it decides them for generated ones too, with no second opinion.

**Prompt inputs:** the goal sentence, the `roles.json` catalog (titles + summaries + `mandatory`),
the shape rules (king mandatory, 2–7 heads, legion = king plus one repeated worker), and the
existing paradigm names to avoid. Temperature 0.3, matching `Agent.generate`.

---

## 5. Validation and repair

Layered, cheapest first, and **every layer already exists**:

| Layer | Mechanism | On failure |
|---|---|---|
| Structure | `generateObject` client-side validation | `NoObjectGeneratedError` |
| Name | `validateName()` — rejects bundled names, bad chars, collisions | regenerate name only |
| Roles | `getRole(id)` per head | one bounded retry |
| Shape | `canFinish()` — at least 2 heads, king in slot 0 | one bounded retry |
| Bindability | resolver against the live catalog | head reported by name, never silently dropped |
| Final | `parseParadigm()` before write | refuse, fall back to blank wizard |

**Exactly one retry, then fall back to the v5 blank wizard with the name pre-filled.** Never leave
the user holding nothing, and never retry unbounded — a free tier that has started refusing will
refuse again, and a silent retry loop is the failure shape this project keeps logging.

A head whose role resolves to no bindable model is **reported, not silently dropped** — the same
rule v5 settled on for Craft's model list, where failing models stay visible with the reason.

---

## 6. What happens after review

Nothing new. `writeParadigm()` writes `~/.config/vangio/paradigms/<name>.json`; activation still
writes the marker; **a paradigm switch still requires a restart** (measured 2026-08-06, unchanged).
v6 must not imply otherwise in its success text.

---

## 7. Hard constraints

1. **Everything stays inside `packages/paradigm`.** v5 shipped 12 commits with zero upstream files
   touched; v6 must do the same. If a change appears to need an upstream seam, that is a signal to
   redesign, not to add a fifth seam.
2. TDD throughout, per package: `cd packages/paradigm && bun test`.
3. Live ConPTY verification of the real flow before it is called done — `--version` proves nothing.
4. No new storage path, so hard rule #5 does not fire.
5. Generation runs on the active king by default; `-m` overrides. No pinned model.

---

## 8. Open questions

1. **The roadmap says "AI asks 3–5 clarifying questions". This spec does not.**
   *Recommendation: ship v6.0 without them.* The review step **is** the clarification — the user
   sees the whole team and edits it with machinery that already works, instead of answering
   questions blind before seeing anything. Each question would also be a new painted dialog step,
   re-entering the 2026-08-18 repaint trap for no information the review screen does not already
   surface. Questions are worth revisiting in v6.1 **if** review-step edit rates show users
   consistently rewriting the same field. **This is a deliberate scope deviation and needs a nod.**
2. **Should a generated paradigm record its goal sentence?** A `goal` key on the paradigm would
   make v7's self-improvement loop possible later (you cannot improve a team without knowing what
   it was for). Costs one optional schema field. *Leaning yes* — it is the cheapest thing that
   makes v7 reachable, and adding it later means every v6-era paradigm lacks it.
3. **Reliability is unmeasured.** One successful sample on one model is not a rate. If generation
   proves flaky on weaker kings, the answer is the §5 fallback, not a pinned model.

---

## 9. Out of scope

- Autonomous generation with no review (that is v7).
- Any feedback or self-improvement loop (v7; blocked on having no outcome signal at all).
- Field-by-field editing of arbitrary heads — explicitly out of scope in v5 and still is.
- Live paradigm switching without a restart.
