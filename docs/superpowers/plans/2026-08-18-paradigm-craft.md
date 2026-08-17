# Paradigm Craft (v5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user author a new paradigm from inside the TUI — naming it, choosing heads, and picking a model per head from a list hard-filtered against the live catalog — and write it to `~/.config/vangio/paradigms/<name>.json`.

**Architecture:** Three new pure modules in `packages/paradigm/src` (`roles.ts`, `resolve.ts`, `craft.ts`) carry all logic and are unit-tested without a running TUI. `tui.tsx` becomes a thin renderer that switches on a step value and calls `api.ui.dialog.replace()`. This mirrors the existing `picker.ts` / `picker.test.ts` / `tui.tsx` split exactly.

**Tech Stack:** TypeScript, Bun (test runner + bundler), SolidJS (TUI rendering), OpenCode plugin TUI API.

**Spec:** `docs/superpowers/specs/2026-08-17-gryphon-paradigm-design.md`

## Global Constraints

- **Patch, don't rewrite.** New behaviour goes in new files. The only allowed seams in this plan are `packages/paradigm/*`. **No file outside `packages/paradigm/` may be modified.**
- **No rename of any storage path.** `~/.config/vangio/paradigms/`, the `paradigm-active` marker and `packages/paradigm` all keep their names. If a rename ever happens, its migration ships in the same commit.
- **No permission control on the king head, ever.** `compileParadigm` emits only `{model, prompt}` for the king (`packages/paradigm/src/compile.ts:59-65`), so a king `permission` block parses clean and does nothing.
- **Never bind Zhipu to a parallel head** — single-concurrent by contract.
- **No AI attribution in any commit message, PR body, or tag.** Bagus Giovani is the sole author.
- **Tests run per package:** `cd packages/paradigm && bun test`. Root `bun test` is deliberately blocked.
- **Typecheck from the repo root:** `bun typecheck`.
- **Commit and push to `origin/dev` at every task boundary.**

## Known limitation carried into this plan

The spec says `allowPaid: false` must "fail closed" on unknown pricing. **That is not implementable from the plugin side and this plan does not attempt it.** `packages/core/src/plugin/models-dev.ts:13-20` normalises absent cost data to `{input: 0, output: 0}`, so by the time a model reaches the SDK a genuinely free model and an unpriced one are byte-identical. Failing closed would therefore reject *every* free model. Task 2 implements `cost === 0` means free and documents the gap in-code. Closing it properly needs the raw models.dev payload before normalisation, which is not reachable from a plugin.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/paradigm/roles.json` | **Exists.** Curated role catalog data. |
| `packages/paradigm/src/roles.ts` | **Create.** Types for the catalog + typed accessors. |
| `packages/paradigm/src/resolve.ts` | **Create.** The resolver: capability hard-filter + ranking. Pure, no TUI, no SDK import. |
| `packages/paradigm/src/craft.ts` | **Create.** Wizard state machine: `Draft`, `Step`, `nextStep`, `validateName`, `toParadigm`. Pure. |
| `packages/paradigm/src/load.ts` | **Modify.** Add `writeParadigm`. |
| `packages/paradigm/src/tui.tsx` | **Modify.** Add the Craft renderer and the `paradigm.craft` command. |
| `packages/paradigm/test/roles.test.ts` | **Create.** |
| `packages/paradigm/test/resolve.test.ts` | **Create.** |
| `packages/paradigm/test/craft.test.ts` | **Create.** |
| `packages/paradigm/test/load.test.ts` | **Modify.** Add `writeParadigm` coverage. |

---

### Task 1: Role catalog types and loader

**Files:**
- Create: `packages/paradigm/src/roles.ts`
- Test: `packages/paradigm/test/roles.test.ts`

**Interfaces:**
- Consumes: `packages/paradigm/roles.json` (already committed)
- Produces: `type Needs`, `type Pick`, `type Role`, `type RoleCatalog`, `const ROLES: RoleCatalog`, `listRoles(): Role[]`, `getRole(id: string): Role | undefined`, `KING_ROLE_ID = "king"`

- [ ] **Step 1: Write the failing test**

```ts
// packages/paradigm/test/roles.test.ts
import { describe, expect, test } from "bun:test"
import { ROLES, listRoles, getRole, KING_ROLE_ID } from "../src/roles"

describe("role catalog", () => {
  test("exposes exactly the four archetypes", () => {
    expect(listRoles().map((r) => r.id).sort()).toEqual(["king", "scout", "seer", "warrior"])
  })

  test("king is the only mandatory role", () => {
    expect(listRoles().filter((r) => r.mandatory).map((r) => r.id)).toEqual([KING_ROLE_ID])
  })

  test("every role carries needs and at least one pick", () => {
    for (const role of listRoles()) {
      expect(role.needs).toBeDefined()
      expect(role.picks.length).toBeGreaterThan(0)
      for (const pick of role.picks) {
        expect(pick.model.length).toBeGreaterThan(0)
        expect(pick.why.length).toBeGreaterThan(0)
      }
    }
  })

  test("seer is the only role requiring an image attachment", () => {
    const withImage = listRoles().filter((r) => r.needs.attachment?.includes("image"))
    expect(withImage.map((r) => r.id)).toEqual(["seer"])
  })

  test("warrior demands the highest output floor", () => {
    const warrior = getRole("warrior")
    const scout = getRole("scout")
    expect(warrior!.needs.minOutput!).toBeGreaterThan(scout!.needs.minOutput!)
  })

  test("getRole returns undefined for an unknown id", () => {
    expect(getRole("bishop")).toBeUndefined()
  })

  test("ROLES.version is a number", () => {
    expect(typeof ROLES.version).toBe("number")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/paradigm && bun test test/roles.test.ts`
Expected: FAIL — `Cannot find module '../src/roles'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/paradigm/src/roles.ts
import catalog from "../roles.json"

/** The four capability axes a head can require. Mirrors the spec's Section 1. */
export type Needs = {
  minContext?: number
  minOutput?: number
  tools?: boolean
  /** Modality names, e.g. ["image"]. */
  attachment?: string[]
}

export type Pick = {
  model: string
  why: string
}

export type Role = {
  id: string
  title: string
  summary: string
  mandatory: boolean
  needs: Needs
  picks: Pick[]
}

export type RoleCatalog = {
  version: number
  roles: Role[]
}

export const KING_ROLE_ID = "king"

/**
 * roles.json is bundled and read in place - deliberately NOT copied into
 * ~/.config/vangio/, so a reinstall can never overwrite user edits.
 */
export const ROLES: RoleCatalog = {
  version: (catalog as { version: number }).version,
  roles: Object.entries((catalog as { roles: Record<string, Omit<Role, "id">> }).roles).map(
    ([id, role]) => ({ id, ...role }),
  ),
}

export function listRoles(): Role[] {
  return ROLES.roles
}

export function getRole(id: string): Role | undefined {
  return ROLES.roles.find((role) => role.id === id)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/paradigm && bun test test/roles.test.ts`
Expected: PASS — 7 tests

If `import catalog from "../roles.json"` errors under `tsc`, add `"resolveJsonModule": true` to `packages/paradigm/tsconfig.json` `compilerOptions` and re-run.

- [ ] **Step 5: Verify typecheck and the plugin bundle still build**

Run: `cd ../.. && bun typecheck`
Expected: 32/32 successful

Run: `bun run packages/paradigm/script/install.ts`
Expected: `bundled ... vangio-paradigm-tui.js` with no error (confirms the JSON import survives bundling)

- [ ] **Step 6: Commit**

```bash
git add packages/paradigm/src/roles.ts packages/paradigm/test/roles.test.ts packages/paradigm/tsconfig.json
git commit -m "feat(paradigm): expose the role catalog as typed data

roles.json becomes reachable from code as a typed catalog with per-role
needs and ranked picks. Read in place rather than copied to config, so a
reinstall cannot overwrite user edits."
git push origin dev
```

---

### Task 2: The resolver

**Files:**
- Create: `packages/paradigm/src/resolve.ts`
- Test: `packages/paradigm/test/resolve.test.ts`

**Interfaces:**
- Consumes: `Needs`, `Pick` from `./roles`
- Produces: `type CandidateModel`, `type ModelChoice`, `modelRef(m: CandidateModel): string`, `checkNeeds(needs: Needs, model: CandidateModel): string | undefined`, `modelOptions(input: { needs: Needs; picks: Pick[]; models: CandidateModel[]; allowPaid?: boolean }): ModelChoice[]`

`CandidateModel` is a **structural** type the SDK `Model` satisfies. Do not import from `@opencode-ai/sdk` — keeping `packages/paradigm` free of that dependency is what makes the resolver portable.

- [ ] **Step 1: Write the failing test**

```ts
// packages/paradigm/test/resolve.test.ts
import { describe, expect, test } from "bun:test"
import { modelOptions, checkNeeds, modelRef, type CandidateModel } from "../src/resolve"

function model(over: Partial<CandidateModel> & { id: string }): CandidateModel {
  return {
    providerID: "opencode",
    name: over.id,
    limit: { context: 200_000, output: 128_000 },
    capabilities: { toolcall: true, input: { image: false } },
    cost: { input: 0, output: 0 },
    ...over,
  }
}

const big = model({ id: "lightning", limit: { context: 262_144, output: 262_144 } })
const small = model({ id: "mimo", limit: { context: 200_000, output: 32_000 } })
const seer = model({
  id: "mimo-vision",
  capabilities: { toolcall: true, input: { image: true } },
})
const paid = model({ id: "sonnet", providerID: "anthropic", cost: { input: 3, output: 15 } })

describe("modelRef", () => {
  test("joins provider and id the way paradigm files spell it", () => {
    expect(modelRef(big)).toBe("opencode/lightning")
  })
})

describe("checkNeeds", () => {
  test("returns undefined when every need is met", () => {
    expect(checkNeeds({ minOutput: 128_000 }, big)).toBeUndefined()
  })

  test("reports the output shortfall in both numbers", () => {
    expect(checkNeeds({ minOutput: 128_000 }, small)).toBe("needs 128000 output, has 32000")
  })

  test("reports a context shortfall", () => {
    expect(checkNeeds({ minContext: 500_000 }, big)).toBe("needs 500000 context, has 262144")
  })

  test("reports a missing tool-call capability", () => {
    const noTools = model({ id: "n", capabilities: { toolcall: false, input: { image: false } } })
    expect(checkNeeds({ tools: true }, noTools)).toBe("does not support tool calls")
  })

  test("reports a missing image modality", () => {
    expect(checkNeeds({ attachment: ["image"] }, big)).toBe("does not accept image input")
  })

  test("accepts a model that does have the image modality", () => {
    expect(checkNeeds({ attachment: ["image"] }, seer)).toBeUndefined()
  })

  test("reports only the first failure so the row stays readable", () => {
    expect(checkNeeds({ minContext: 999_999, minOutput: 999_999 }, small)).toBe(
      "needs 999999 context, has 200000",
    )
  })
})

describe("modelOptions", () => {
  const picks = [
    { model: "opencode/lightning", why: "262k output" },
    { model: "opencode/mimo", why: "the only one that sees" },
  ]

  test("fitting models come first, ranked by picks order", () => {
    const options = modelOptions({
      needs: { minOutput: 32_000 },
      picks,
      models: [small, big],
    })
    expect(options.map((o) => o.model)).toEqual(["opencode/lightning", "opencode/mimo"])
    expect(options.every((o) => !o.disabled)).toBe(true)
  })

  test("a pick's why becomes the row description", () => {
    const options = modelOptions({ needs: {}, picks, models: [big] })
    expect(options[0]?.description).toBe("262k output")
  })

  test("failing models are listed last, disabled, with the reason as description", () => {
    const options = modelOptions({
      needs: { minOutput: 128_000 },
      picks,
      models: [small, big],
    })
    expect(options.map((o) => o.model)).toEqual(["opencode/lightning", "opencode/mimo"])
    expect(options[0]?.disabled).toBe(false)
    expect(options[1]?.disabled).toBe(true)
    expect(options[1]?.description).toBe("needs 128000 output, has 32000")
  })

  test("models absent from picks still appear, ranked after picked ones by headroom", () => {
    const other = model({ id: "zzz", limit: { context: 900_000, output: 500_000 } })
    const options = modelOptions({ needs: {}, picks, models: [other, big] })
    expect(options[0]?.model).toBe("opencode/lightning")
    expect(options[1]?.model).toBe("opencode/zzz")
  })

  test("allowPaid false removes paid models entirely", () => {
    const options = modelOptions({ needs: {}, picks: [], models: [big, paid], allowPaid: false })
    expect(options.map((o) => o.model)).toEqual(["opencode/lightning"])
  })

  test("allowPaid defaults to true", () => {
    const options = modelOptions({ needs: {}, picks: [], models: [big, paid] })
    expect(options.map((o) => o.model)).toContain("anthropic/sonnet")
  })

  test("an empty model list yields no options rather than throwing", () => {
    expect(modelOptions({ needs: {}, picks, models: [] })).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/paradigm && bun test test/resolve.test.ts`
Expected: FAIL — `Cannot find module '../src/resolve'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/paradigm/src/resolve.ts
import type { Needs, Pick } from "./roles"

/**
 * A structural subset of the SDK's Model that this package can consume without
 * importing @opencode-ai/sdk. Keeping paradigm free of that dependency is what
 * makes the resolver portable to another runtime - it only ever needs someone
 * to hand it a list of these.
 */
export type CandidateModel = {
  id: string
  providerID: string
  name: string
  limit: { context: number; output: number }
  capabilities: { toolcall: boolean; input: { image: boolean } }
  cost: { input: number; output: number }
}

export type ModelChoice = {
  model: string
  title: string
  description?: string
  disabled: boolean
}

/** Paradigm files spell a model as "provider/id". One place, so it cannot drift. */
export function modelRef(model: CandidateModel): string {
  return `${model.providerID}/${model.id}`
}

/**
 * Returns the FIRST unmet need as a human sentence, or undefined if the model
 * fits. First-only on purpose: the string lands in a dialog row, and a list of
 * four failures there is unreadable.
 */
export function checkNeeds(needs: Needs, model: CandidateModel): string | undefined {
  if (needs.minContext !== undefined && model.limit.context < needs.minContext) {
    return `needs ${needs.minContext} context, has ${model.limit.context}`
  }
  if (needs.minOutput !== undefined && model.limit.output < needs.minOutput) {
    return `needs ${needs.minOutput} output, has ${model.limit.output}`
  }
  if (needs.tools === true && !model.capabilities.toolcall) {
    return "does not support tool calls"
  }
  if (needs.attachment?.includes("image") && !model.capabilities.input.image) {
    return "does not accept image input"
  }
  return undefined
}

/**
 * KNOWN GAP: a genuinely free model and one whose pricing was never published
 * are indistinguishable here. models-dev normalises absent cost data to zero
 * (packages/core/src/plugin/models-dev.ts:13-20), so "cost is zero" is the only
 * signal available and this treats it as free. Failing closed instead would
 * reject every free model, which is worse. Closing this properly needs the raw
 * models.dev payload, which a plugin cannot reach.
 */
function isFree(model: CandidateModel): boolean {
  return model.cost.input === 0 && model.cost.output === 0
}

export function modelOptions(input: {
  needs: Needs
  picks: Pick[]
  models: CandidateModel[]
  allowPaid?: boolean
}): ModelChoice[] {
  const allowPaid = input.allowPaid ?? true
  const pickIndex = new Map(input.picks.map((pick, index) => [pick.model, index]))
  const pickWhy = new Map(input.picks.map((pick) => [pick.model, pick.why]))

  const rows = input.models
    .filter((model) => allowPaid || isFree(model))
    .map((model) => {
      const ref = modelRef(model)
      const failure = checkNeeds(input.needs, model)
      return {
        ref,
        model,
        failure,
        rank: pickIndex.get(ref) ?? Number.MAX_SAFE_INTEGER,
        headroom: model.limit.context + model.limit.output,
      }
    })

  rows.sort((a, b) => {
    // Fitting models always outrank failing ones.
    if (!a.failure !== !b.failure) return a.failure ? 1 : -1
    // Then curated order, which is the whole point of picks.
    if (a.rank !== b.rank) return a.rank - b.rank
    // Then capability headroom, biggest first.
    if (a.headroom !== b.headroom) return b.headroom - a.headroom
    return a.ref.localeCompare(b.ref)
  })

  return rows.map((row) => ({
    model: row.ref,
    title: row.model.name,
    description: row.failure ?? pickWhy.get(row.ref),
    disabled: row.failure !== undefined,
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/paradigm && bun test test/resolve.test.ts`
Expected: PASS — 16 tests

- [ ] **Step 5: Run the whole package suite and typecheck**

Run: `cd packages/paradigm && bun test`
Expected: PASS, no regressions (45 tests: 38 existing + 7 from Task 1, plus 16 here)

Run: `cd ../.. && bun typecheck`
Expected: 32/32 successful

- [ ] **Step 6: Commit**

```bash
git add packages/paradigm/src/resolve.ts packages/paradigm/test/resolve.test.ts
git commit -m "feat(paradigm): add the capability resolver

Hard-filters models against a role's needs and ranks the survivors by
curated pick order, then by capability headroom. Failing models are kept in
the list and marked disabled with the reason, so a user can see what was
rejected and why rather than wondering where a model went.

Takes an injected model list rather than reaching into the catalog, which
keeps it testable with fixtures and portable to any runtime that can supply
one.

Documents in-code that a free model and an unpriced one are
indistinguishable after models-dev normalises absent cost data to zero."
git push origin dev
```

---

### Task 3: Name validation and paradigm writing

**Files:**
- Create: `packages/paradigm/src/craft.ts` (partial — `validateName` only)
- Modify: `packages/paradigm/src/load.ts` (append `writeParadigm`)
- Test: `packages/paradigm/test/craft.test.ts` (partial)
- Test: `packages/paradigm/test/load.test.ts` (append)

**Interfaces:**
- Consumes: `Paradigm` from `./schema`
- Produces: `BUNDLED_NAMES: string[]`, `validateName(name: string, existing: string[]): string | undefined`, `writeParadigm(dir: string, paradigm: Paradigm): Promise<string>`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/paradigm/test/craft.test.ts
import { describe, expect, test } from "bun:test"
import { validateName, BUNDLED_NAMES } from "../src/craft"

describe("validateName", () => {
  test("accepts a simple lowercase name", () => {
    expect(validateName("my-team", [])).toBeUndefined()
  })

  test("rejects an empty name", () => {
    expect(validateName("", [])).toBe("Name cannot be empty")
  })

  test("rejects whitespace-only", () => {
    expect(validateName("   ", [])).toBe("Name cannot be empty")
  })

  test("rejects uppercase and spaces so the filename stays predictable", () => {
    expect(validateName("My Team", [])).toBe("Use lowercase letters, numbers and hyphens only")
  })

  test("rejects path separators", () => {
    expect(validateName("../escape", [])).toBe("Use lowercase letters, numbers and hyphens only")
  })

  test("rejects a name already in use", () => {
    expect(validateName("mine", ["mine"])).toBe('"mine" already exists')
  })

  test("rejects every bundled preset name, because install.ts would overwrite it", () => {
    for (const name of BUNDLED_NAMES) {
      expect(validateName(name, [])).toBe(`"${name}" is a bundled preset - clone it instead`)
    }
  })

  test("lists the six bundled presets", () => {
    expect([...BUNDLED_NAMES].sort()).toEqual([
      "code-review",
      "documenter",
      "gryphon",
      "premium-gryphon",
      "researcher",
      "web-dev",
    ])
  })
})
```

```ts
// packages/paradigm/test/load.test.ts — APPEND to the existing file.
// Add these imports to the ones already at the top of the file:
//   import { mkdtemp, readFile, rm } from "fs/promises"
//   import { tmpdir } from "os"
//   import path from "path"
//   import { writeParadigm, listParadigms } from "../src/load"
//   import type { Paradigm } from "../src/schema"

describe("writeParadigm", () => {
  const sample: Paradigm = {
    name: "my-team",
    description: "a test",
    king: "king",
    heads: { king: { model: "opencode/x", role: "lead" } },
    routing: ["a -> b"],
    discipline: { self: "be brief" },
  }

  test("writes a file that listParadigms can read back", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "craft-"))
    try {
      const file = await writeParadigm(dir, sample)
      expect(file).toBe(path.join(dir, "my-team.json"))
      const { paradigms, errors } = await listParadigms(dir)
      expect(errors).toEqual([])
      expect(paradigms["my-team"]?.king).toBe("king")
      expect(paradigms["my-team"]?.routing).toEqual(["a -> b"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("writes readable indented JSON ending in a newline", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "craft-"))
    try {
      await writeParadigm(dir, sample)
      const raw = await readFile(path.join(dir, "my-team.json"), "utf8")
      expect(raw.endsWith("\n")).toBe(true)
      expect(raw).toContain('\n  "name": "my-team"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("creates the directory when it does not exist", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "craft-"))
    const dir = path.join(base, "nested", "paradigms")
    try {
      await writeParadigm(dir, sample)
      const { paradigms } = await listParadigms(dir)
      expect(Object.keys(paradigms)).toEqual(["my-team"])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/paradigm && bun test test/craft.test.ts test/load.test.ts`
Expected: FAIL — `Cannot find module '../src/craft'` and `writeParadigm is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/paradigm/src/craft.ts
/**
 * The Paradigm Craft wizard, as a state machine rather than a dialog stack.
 * api.ui.dialog.replace() swaps the top of the stack and leaves depth at 1
 * (measured under ConPTY 2026-08-17), so transitions are ours to drive anyway.
 * Everything here is pure so it can be tested without a running TUI.
 */

/**
 * install.ts copies paradigms/*.json over config on every install, so a
 * user file with one of these names is silently reverted. Refusing the name at
 * creation is the only place this can actually be enforced.
 */
export const BUNDLED_NAMES = [
  "gryphon",
  "premium-gryphon",
  "code-review",
  "documenter",
  "web-dev",
  "researcher",
]

const NAME_PATTERN = /^[a-z0-9-]+$/

export function validateName(name: string, existing: string[]): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "Name cannot be empty"
  if (!NAME_PATTERN.test(trimmed)) return "Use lowercase letters, numbers and hyphens only"
  if (BUNDLED_NAMES.includes(trimmed)) return `"${trimmed}" is a bundled preset - clone it instead`
  if (existing.includes(trimmed)) return `"${trimmed}" already exists`
  return undefined
}
```

```ts
// packages/paradigm/src/load.ts — APPEND at the end of the file.

/** Writes a paradigm as <dir>/<name>.json and returns the path written. */
export async function writeParadigm(dir: string, paradigm: Paradigm): Promise<string> {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${paradigm.name}.json`)
  await writeFile(file, `${JSON.stringify(paradigm, null, 2)}\n`, "utf8")
  return file
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/paradigm && bun test test/craft.test.ts test/load.test.ts`
Expected: PASS — 8 craft tests plus the existing load tests and 3 new ones

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `cd packages/paradigm && bun test`
Expected: PASS, no regressions

Run: `cd ../.. && bun typecheck`
Expected: 32/32 successful

- [ ] **Step 6: Commit**

```bash
git add packages/paradigm/src/craft.ts packages/paradigm/src/load.ts packages/paradigm/test/craft.test.ts packages/paradigm/test/load.test.ts
git commit -m "feat(paradigm): validate paradigm names and write paradigm files

Name validation refuses the six bundled preset names outright. install.ts
copies those filenames over config on every install, so a user file sharing
one would be silently reverted - refusing at creation is the only place that
can be caught.

writeParadigm rounds out load.ts so a crafted paradigm can be persisted and
read straight back by listParadigms."
git push origin dev
```

---

### Task 4: The wizard state machine

**Files:**
- Modify: `packages/paradigm/src/craft.ts` (append)
- Test: `packages/paradigm/test/craft.test.ts` (append)

**Interfaces:**
- Consumes: `validateName` from `./craft`; `Role`, `getRole`, `KING_ROLE_ID` from `./roles`; `Paradigm`, `Head` from `./schema`
- Produces: `type Shape = "court" | "legion"`, `type Draft`, `type Step`, `emptyDraft(): Draft`, `firstStep(): Step`, `nextStep(draft: Draft, step: Step, answer: string): { draft: Draft; step: Step }`, `stepBack(draft: Draft, step: Step): Step`, `toParadigm(draft: Draft): Paradigm`

`Step` is a discriminated union on `kind`:
`{ kind: "name" } | { kind: "shape" } | { kind: "role"; slot: number } | { kind: "model"; slot: number } | { kind: "review" } | { kind: "done" }`

Slot 0 is always the king. Slots 1..n are the other heads.

- [ ] **Step 1: Write the failing test**

```ts
// packages/paradigm/test/craft.test.ts — APPEND.
// Add to the imports at the top of the file:
//   import { emptyDraft, firstStep, nextStep, stepBack, toParadigm, type Draft, type Step } from "../src/craft"

describe("wizard state machine", () => {
  function run(answers: string[]): { draft: Draft; step: Step } {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of answers) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    return { draft, step }
  }

  test("starts by asking for a name", () => {
    expect(firstStep()).toEqual({ kind: "name" })
  })

  test("name then asks for shape", () => {
    const { draft, step } = run(["my-team"])
    expect(draft.name).toBe("my-team")
    expect(step).toEqual({ kind: "shape" })
  })

  test("court asks for the king's role slot first", () => {
    const { draft, step } = run(["my-team", "court"])
    expect(draft.shape).toBe("court")
    expect(step).toEqual({ kind: "model", slot: 0 })
  })

  test("slot 0 is always the king, so its role is not asked", () => {
    const { draft } = run(["my-team", "court"])
    expect(draft.heads[0]?.role).toBe("king")
  })

  test("after the king's model, court asks for the next head's role", () => {
    const { step } = run(["my-team", "court", "opencode/ultra"])
    expect(step).toEqual({ kind: "role", slot: 1 })
  })

  test("choosing a role then asks for that slot's model", () => {
    const { draft, step } = run(["my-team", "court", "opencode/ultra", "warrior"])
    expect(draft.heads[1]?.role).toBe("warrior")
    expect(step).toEqual({ kind: "model", slot: 1 })
  })

  test("answering done at a role slot goes to review", () => {
    const { step } = run(["my-team", "court", "opencode/ultra", "warrior", "opencode/light", "done"])
    expect(step).toEqual({ kind: "review" })
  })

  test("review confirms to done", () => {
    const { step } = run([
      "my-team", "court", "opencode/ultra", "warrior", "opencode/light", "done", "confirm",
    ])
    expect(step).toEqual({ kind: "done" })
  })

  test("a king alone cannot reach review - at least two heads are required", () => {
    const { step } = run(["my-team", "court", "opencode/ultra", "done"])
    expect(step).toEqual({ kind: "role", slot: 1 })
  })

  test("a court stops offering more heads after six below the king", () => {
    const answers = ["my-team", "court", "opencode/ultra"]
    for (let i = 0; i < 6; i++) answers.push("scout", `opencode/s${i}`)
    const { draft, step } = run(answers)
    expect(Object.keys(draft.heads).length).toBe(7)
    expect(step).toEqual({ kind: "review" })
  })

  test("legion asks the king's model, one role, its model, then a count", () => {
    const { draft, step } = run(["my-team", "legion", "opencode/ultra", "scout", "opencode/hy3"])
    expect(draft.shape).toBe("legion")
    expect(step).toEqual({ kind: "review" })
    expect(draft.heads[1]?.role).toBe("scout")
  })

  test("stepBack from shape returns to name", () => {
    expect(stepBack(emptyDraft(), { kind: "shape" })).toEqual({ kind: "name" })
  })

  test("stepBack from a model slot returns to that slot's role, except the king", () => {
    const draft = emptyDraft()
    expect(stepBack(draft, { kind: "model", slot: 2 })).toEqual({ kind: "role", slot: 2 })
    expect(stepBack(draft, { kind: "model", slot: 0 })).toEqual({ kind: "shape" })
  })

  test("stepBack from name stays at name - there is nowhere to go", () => {
    expect(stepBack(emptyDraft(), { kind: "name" })).toEqual({ kind: "name" })
  })
})

describe("toParadigm", () => {
  function built(): Draft {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of [
      "my-team", "court", "opencode/ultra", "warrior", "opencode/light", "scout", "opencode/hy3", "done",
    ]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    return draft
  }

  test("produces a paradigm that parseParadigm accepts", async () => {
    const { parseParadigm } = await import("../src/schema")
    const result = parseParadigm(toParadigm(built()))
    expect(result.ok).toBe(true)
  })

  test("names the king head 'king' and points king at it", () => {
    const p = toParadigm(built())
    expect(p.king).toBe("king")
    expect(p.heads["king"]?.model).toBe("opencode/ultra")
  })

  test("names duplicate roles with a numeric suffix", () => {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of [
      "my-team", "court", "opencode/ultra", "scout", "opencode/a", "scout", "opencode/b", "done",
    ]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    const p = toParadigm(draft)
    expect(Object.keys(p.heads).sort()).toEqual(["king", "scout-1", "scout-2"])
  })

  test("carries the role summary into each head's role text", () => {
    const p = toParadigm(built())
    expect(p.heads["warrior"]?.role.length).toBeGreaterThan(0)
  })

  test("denies edit on scout and seer heads but never sets permission on the king", () => {
    const p = toParadigm(built())
    expect(p.heads["scout"]?.permission).toEqual({ edit: "deny" })
    expect(p.heads["king"]?.permission).toBeUndefined()
    expect(p.heads["warrior"]?.permission).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/paradigm && bun test test/craft.test.ts`
Expected: FAIL — `emptyDraft is not a function`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/paradigm/src/craft.ts — APPEND.
import { getRole, KING_ROLE_ID } from "./roles"
import type { Head, Paradigm } from "./schema"

export type Shape = "court" | "legion"

export type DraftHead = {
  role: string
  model?: string
}

export type Draft = {
  name?: string
  shape?: Shape
  /** Slot 0 is always the king. */
  heads: Record<number, DraftHead>
  instances?: number
}

export type Step =
  | { kind: "name" }
  | { kind: "shape" }
  | { kind: "role"; slot: number }
  | { kind: "model"; slot: number }
  | { kind: "review" }
  | { kind: "done" }

/** King plus six. Matches the approved shape rule: minimum 2 heads, up to 6 below the king. */
export const MAX_HEADS = 7

export function emptyDraft(): Draft {
  return { heads: {} }
}

export function firstStep(): Step {
  return { kind: "name" }
}

function headCount(draft: Draft): number {
  return Object.keys(draft.heads).length
}

export function nextStep(draft: Draft, step: Step, answer: string): { draft: Draft; step: Step } {
  const next: Draft = { ...draft, heads: { ...draft.heads } }

  switch (step.kind) {
    case "name":
      next.name = answer.trim()
      return { draft: next, step: { kind: "shape" } }

    case "shape":
      next.shape = answer === "legion" ? "legion" : "court"
      // Slot 0 is the king in both shapes, and its role is never asked.
      next.heads[0] = { role: KING_ROLE_ID }
      return { draft: next, step: { kind: "model", slot: 0 } }

    case "role": {
      // "done" is only offered once the minimum is met, but guard anyway.
      if (answer === "done") {
        if (headCount(next) >= 2) return { draft: next, step: { kind: "review" } }
        return { draft: next, step }
      }
      next.heads[step.slot] = { role: answer }
      return { draft: next, step: { kind: "model", slot: step.slot } }
    }

    case "model": {
      const head = next.heads[step.slot]
      if (head) next.heads[step.slot] = { ...head, model: answer }

      // A legion has exactly two slots: the king and the repeated worker.
      if (next.shape === "legion" && step.slot === 1) {
        return { draft: next, step: { kind: "review" } }
      }
      if (headCount(next) >= MAX_HEADS) {
        return { draft: next, step: { kind: "review" } }
      }
      return { draft: next, step: { kind: "role", slot: step.slot + 1 } }
    }

    case "review":
      return { draft: next, step: { kind: "done" } }

    default:
      return { draft: next, step }
  }
}

export function stepBack(_draft: Draft, step: Step): Step {
  switch (step.kind) {
    case "name":
      return { kind: "name" }
    case "shape":
      return { kind: "name" }
    case "role":
      return { kind: "model", slot: step.slot - 1 }
    case "model":
      return step.slot === 0 ? { kind: "shape" } : { kind: "role", slot: step.slot }
    case "review":
      return { kind: "role", slot: 1 }
    default:
      return step
  }
}

/**
 * Head ids are the role name, suffixed only when a role repeats, so the common
 * case reads as "warrior" rather than "warrior-1".
 */
function headIds(draft: Draft): Map<number, string> {
  const slots = Object.keys(draft.heads)
    .map(Number)
    .sort((a, b) => a - b)
  const counts = new Map<string, number>()
  for (const slot of slots) {
    const role = draft.heads[slot]!.role
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  const ids = new Map<number, string>()
  for (const slot of slots) {
    const role = draft.heads[slot]!.role
    if ((counts.get(role) ?? 0) === 1) {
      ids.set(slot, role)
      continue
    }
    const n = (seen.get(role) ?? 0) + 1
    seen.set(role, n)
    ids.set(slot, `${role}-${n}`)
  }
  return ids
}

export function toParadigm(draft: Draft): Paradigm {
  const ids = headIds(draft)
  const heads: Record<string, Head> = {}

  for (const [slotKey, draftHead] of Object.entries(draft.heads)) {
    const slot = Number(slotKey)
    const id = ids.get(slot)!
    const role = getRole(draftHead.role)
    const head: Head = {
      model: draftHead.model ?? "",
      role: role?.summary ?? draftHead.role,
    }
    // Advisory heads are locked read-only. NEVER set permission on the king -
    // compileParadigm drops it silently, so offering it would be a lie.
    if (draftHead.role !== KING_ROLE_ID && (draftHead.role === "scout" || draftHead.role === "seer")) {
      head.permission = { edit: "deny" }
    }
    heads[id] = head
  }

  return {
    name: draft.name ?? "",
    description: `Crafted paradigm - ${draft.shape ?? "court"}`,
    king: ids.get(0) ?? KING_ROLE_ID,
    heads,
    routing: [],
    discipline: {},
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/paradigm && bun test test/craft.test.ts`
Expected: PASS — all craft tests

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `cd packages/paradigm && bun test`
Expected: PASS, no regressions

Run: `cd ../.. && bun typecheck`
Expected: 32/32 successful

- [ ] **Step 6: Commit**

```bash
git add packages/paradigm/src/craft.ts packages/paradigm/test/craft.test.ts
git commit -m "feat(paradigm): add the Craft wizard state machine

Models the wizard as transitions over a draft rather than as a dialog
stack, because replace swaps the top of the stack and leaves depth at one -
the transitions were always ours to drive.

Slot zero is always the king and its role is never asked. Court walks role
then model per slot up to six heads below the king; legion asks one worker
role and stops. Head ids take a numeric suffix only when a role repeats.

Never sets permission on the king head: compileParadigm drops it silently,
so writing one would be a lie."
git push origin dev
```

---

### Task 5: The TUI renderer and command

**Files:**
- Modify: `packages/paradigm/src/tui.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–4, plus `listParadigms`, `writeParadigm` from `./load`, `PARADIGM_DIR` from `./index`
- Produces: a `paradigm.craft` command with `slashName: "craft"`

There is no unit test for this task — it is the SolidJS rendering layer, and all its logic lives in the tested modules. It is verified by a live ConPTY run.

- [ ] **Step 1: Add the Craft component**

Insert immediately above `const tui: TuiPlugin = async (api) => {` in `packages/paradigm/src/tui.tsx`:

```tsx
function Craft(props: { api: TuiPluginApi }) {
  const [draft, setDraft] = createSignal<Draft>(emptyDraft())
  const [step, setStep] = createSignal<Step>(firstStep())
  const [existing, setExisting] = createSignal<string[]>([])
  const [error, setError] = createSignal<string | undefined>(undefined)
  const DialogSelect = props.api.ui.DialogSelect
  const DialogPrompt = props.api.ui.DialogPrompt

  onMount(() => {
    void listParadigms(PARADIGM_DIR).then(({ paradigms }) => setExisting(Object.keys(paradigms)))
  })

  // api.state.provider is already loaded and synchronous, so the model step
  // needs no await and no loading state.
  const candidates = (): CandidateModel[] =>
    props.api.state.provider.flatMap((provider) =>
      Object.values(provider.models).map((model) => model as unknown as CandidateModel),
    )

  const advance = (answer: string) => {
    const result = nextStep(draft(), step(), answer)
    setDraft(result.draft)
    setStep(result.step)
    if (result.step.kind === "done") finish(result.draft)
  }

  const back = () => setStep(stepBack(draft(), step()))

  const finish = (final: Draft) => {
    props.api.ui.dialog.clear()
    void writeParadigm(PARADIGM_DIR, toParadigm(final))
      .then(() => {
        props.api.ui.toast({
          title: "Paradigm",
          message: `Created "${final.name}". Use /paradigm to switch - it applies when you restart VanGio.`,
        })
      })
      .catch((err: unknown) => {
        props.api.ui.toast({
          variant: "error",
          title: "Paradigm",
          message: `Could not write paradigm: ${err instanceof Error ? err.message : String(err)}`,
        })
      })
  }

  const BACK_ROW = { title: "← Back", value: "__back__", description: "return to the previous step" }

  const withBack = <T extends { title: string; value: string; description?: string }>(rows: T[]) =>
    [BACK_ROW as unknown as T, ...rows]

  const onRow = (value: string) => (value === "__back__" ? back() : advance(value))

  return (
    <Show when={step()} keyed>
      {(current) => {
        if (current.kind === "name") {
          return (
            <DialogPrompt
              title="New paradigm - name"
              placeholder="lowercase, numbers and hyphens"
              description={() => <text>{error() ?? "This becomes the filename."}</text>}
              onConfirm={(value) => {
                const problem = validateName(value, existing())
                if (problem) {
                  setError(problem)
                  return
                }
                setError(undefined)
                advance(value)
              }}
            />
          )
        }

        if (current.kind === "shape") {
          return (
            <DialogSelect
              title="New paradigm - shape"
              options={withBack([
                { title: "Court", value: "court", description: "distinct roles, order matters" },
                { title: "Legion", value: "legion", description: "interchangeable workers in parallel" },
              ])}
              onSelect={(option) => onRow(String(option.value))}
            />
          )
        }

        if (current.kind === "role") {
          const rows = listRoles()
            .filter((role) => !role.mandatory)
            .map((role) => ({ title: role.title, value: role.id, description: role.summary }))
          const done =
            Object.keys(draft().heads).length >= 2
              ? [{ title: "Done - no more heads", value: "done", description: "go to review" }]
              : []
          return (
            <DialogSelect
              title={`New paradigm - head ${current.slot} role`}
              options={withBack([...rows, ...done])}
              onSelect={(option) => onRow(String(option.value))}
            />
          )
        }

        if (current.kind === "model") {
          const head = draft().heads[current.slot]
          const role = head ? getRole(head.role) : undefined
          const rows = modelOptions({
            needs: role?.needs ?? {},
            picks: role?.picks ?? [],
            models: candidates(),
          }).map((choice) => ({
            title: choice.title,
            value: choice.model,
            description: choice.description,
            disabled: choice.disabled,
          }))
          return (
            <DialogSelect
              title={`New paradigm - model for ${role?.title ?? head?.role ?? "head"}`}
              placeholder="Search models"
              options={withBack(rows)}
              onSelect={(option) => {
                const row = rows.find((r) => r.value === String(option.value))
                // Belt and braces: Q5 (does `disabled` block selection?) is unproven.
                if (row?.disabled) return
                onRow(String(option.value))
              }}
            />
          )
        }

        if (current.kind === "review") {
          const p = toParadigm(draft())
          const summary = Object.entries(p.heads)
            .map(([id, head]) => `${id}: ${head.model}`)
            .join(", ")
          return (
            <DialogSelect
              title={`Create "${p.name}"?`}
              options={withBack([
                { title: "Create", value: "confirm", description: summary },
              ])}
              onSelect={(option) => onRow(String(option.value))}
            />
          )
        }

        return null
      }}
    </Show>
  )
}
```

- [ ] **Step 2: Extend the imports at the top of `tui.tsx`**

Replace the existing import block (lines 13–17) with:

```tsx
import type { TuiPluginApi, TuiPlugin } from "@opencode-ai/plugin/tui"
import { createSignal, onMount, Show } from "solid-js"
import { ACTIVE_MARKER, PARADIGM_DIR } from "./index"
import { listParadigms, readActiveName, writeActiveName, writeParadigm } from "./load"
import { pickerOptions, statusLabel, switchNotice, type PickerOption } from "./picker"
import { getRole, listRoles } from "./roles"
import { modelOptions, type CandidateModel } from "./resolve"
import {
  emptyDraft,
  firstStep,
  nextStep,
  stepBack,
  toParadigm,
  validateName,
  type Draft,
  type Step,
} from "./craft"
```

- [ ] **Step 3: Register the command**

In `api.keymap.registerLayer({ commands: [...] })`, add this entry after the existing `paradigm.list` entry:

```tsx
      {
        name: "paradigm.craft",
        title: "Craft paradigm",
        desc: "Create a new paradigm - choose heads and a model for each",
        category: "VanGio",
        namespace: "palette",
        slashName: "craft",
        run() {
          api.ui.dialog.replace(() => <Craft api={api} />)
        },
      },
```

and change the `bindings` line to:

```tsx
    bindings: api.tuiConfig.keybinds.gather("paradigm.palette", ["paradigm.list", "paradigm.craft"]),
```

- [ ] **Step 4: Typecheck and build**

Run: `cd packages/paradigm && bun test`
Expected: PASS, no regressions

Run: `cd ../.. && bun typecheck`
Expected: 32/32 successful

Run: `bun run packages/paradigm/script/install.ts`
Expected: `bundled ... vangio-paradigm-tui.js` with no error

- [ ] **Step 5: Verify live under ConPTY**

`--version` is NOT proof. Follow `.claude/skills/verify`:

- Harness host must be **node**, not bun.
- Answer the terminal capability queries (XTVERSION, DA1, DSR, kitty, DECRQM 2026, XTWINOPS 14/16).
- `pty.spawn` needs the absolute bun path `C:\Users\kodec\.bun\bin\bun.exe`; use `cols: 140, rows: 35`.
- Wait **45s** for full startup before sending input.
- **Invoke via the command palette (`ctrl+t` = `\x14`), typing `craft` at ~130ms per character.** Typing a slash command fast submits it to the LLM as chat and produces a false negative — this cost a run on 2026-08-17.

Drive the full flow: name → shape → king model → role → model → done → confirm. Then assert:

```bash
cat ~/.config/vangio/paradigms/spike-team.json
```

Expected: a valid paradigm file whose `king` head has no `permission` key.

Then confirm it loads:

```bash
cd "C:/Exodus/Projects/VanGio-AI Agent/vangio-v1" && bun run -e '
import { listParadigms } from "./packages/paradigm/src/load"
const r = await listParadigms(process.env.USERPROFILE + "/.config/vangio/paradigms")
console.log(Object.keys(r.paradigms), r.errors)
'
```

Expected: the new name in the list, `errors` empty.

- [ ] **Step 6: Answer Q4 and Q5 while the harness is up**

Both are open questions in the spec and this is the cheapest place to settle them.

- **Q4** — does `api.state.provider` list *all* providers or only credentialed ones? Temporarily log `props.api.state.provider.map((p) => p.id)` from `Craft`'s `onMount` to a probe file and compare against providers you hold no key for (e.g. `anthropic`).
- **Q5** — does `DialogSelect`'s `disabled` actually block selection? Try to select a disabled model row and see whether `onSelect` fires.

Record both answers in `docs/superpowers/specs/2026-08-17-gryphon-paradigm-design.md`, moving them out of Open Questions. Remove the probe logging before committing.

- [ ] **Step 7: Clean up and commit**

```bash
git add packages/paradigm/src/tui.tsx docs/superpowers/specs/2026-08-17-gryphon-paradigm-design.md
git commit -m "feat(paradigm): add the Craft wizard to the TUI

Adds /craft, which walks name, shape, a role and model per head, and a
review, then writes the paradigm to the schemata directory. The dialog layer
only renders - every transition and the whole model filter live in tested
modules.

Model rows come from the resolver, hard-filtered against the role's needs.
Failing models stay in the list marked disabled with the reason rather than
disappearing, and selection is refused in the handler too, since whether the
disabled flag blocks selection on its own was unproven.

Verified under ConPTY end to end: the wizard runs, the file is written, and
listParadigms reads it back with no errors."
git push origin dev
```

---

## Self-Review

**Spec coverage.** Section 1 data model → Tasks 1, 4 (`roles.ts`, `toParadigm`). Section 2 TUI surface → Task 5 (`/craft`; `/paradigm` already exists; `/paradigm edit` is out of scope per the spec). Section 3 resolver → Task 2, placed at authoring time inside the TUI per the spec. Section 4 wizard → Tasks 3, 4, 5. Q4 and Q5 → Task 5 Step 6.

**Not covered, deliberately:** `/paradigm clone` — the spec scopes v5 as `new` **and** `clone`, and this plan ships only `new`. Clone is a small follow-on once `Draft` exists (seed `emptyDraft()` from an existing paradigm and start at `{kind:"shape"}`), but it is not in these tasks. **Flagged as a known gap against the spec.** Paradigm Shift stage one is out of scope here — it belongs to the fallback spec.

**Schema extensions not implemented:** the spec's `parallel: { posture, may }`, `needsOverride` and `instances` are not written by this plan, because `parseParadigm` does not accept them yet and the Global Constraints forbid touching anything outside `packages/paradigm/`. They are additive and belong with Paradigm Shift. `toParadigm` emits only fields today's parser accepts, which is why the round-trip test in Task 4 passes.

**Type consistency checked:** `Needs` and `Pick` are defined in Task 1 and consumed unchanged in Tasks 2 and 5. `CandidateModel` is defined in Task 2 and used in Task 5. `Draft`/`Step` are defined in Task 4 and used in Task 5. `KING_ROLE_ID` is defined once in Task 1 and used in Task 4. `modelOptions`, `validateName`, `emptyDraft`, `firstStep`, `nextStep`, `stepBack`, `toParadigm`, `writeParadigm` all keep the same names across tasks.
