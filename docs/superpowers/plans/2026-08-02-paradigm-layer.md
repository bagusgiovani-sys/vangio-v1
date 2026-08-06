# Gryphon Paradigm Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "paradigm" a real, machine-readable object — a named bundle of *(heads → models → routing → cost discipline)* — that composes with Build/Plan mode instead of competing with it in the Tab cycle.

**Architecture:** A paradigm is a JSON file in `~/.config/vangio/paradigms/<name>.json`. A VanGio plugin reads the active paradigm and **compiles it down into the `agent` config entries OpenCode already resolves**, via the v1 plugin `config` hook. No upstream file is modified. Gryphon becomes paradigm #1 rather than a special-cased agent, and `premium-gryphon` becomes "gryphon with the king head swapped" instead of a cloned prompt.

**Tech Stack:** TypeScript + Bun, `@opencode-ai/plugin` v1 hook shape, new workspace package `packages/paradigm` (mirrors the existing `packages/notifier`).

---

## Verified Findings (do not re-derive — these were measured, not assumed)

These were established empirically on 2026-08-02 against this working tree. Two of them
overturn what the design docs assumed, so read them before writing any code.

| # | Finding | Evidence |
|---|---|---|
| V1 | **A v1 plugin `config` hook CAN inject agents that resolve live.** The hook receives the fully-merged config and mutating `cfg.agent[...]` produces a real agent. | Probe plugin injected `v1hook`; `vangio debug agent v1hook` returned it. Hook also observed the existing `gryphon, premium-gryphon, scout, warrior, triage, duplicate-pr`. |
| V2 | **`ctx.agent.transform` (v2 plugin API) is a TRAP right now.** A v2 plugin loads, `setup` runs, and the transform *registers without error* — but the callback never fires and the agent never appears. The v2 agent domain is not materialized on the live CLI/TUI path. | Probe v2 plugin wrote markers: `setup ran`, `transform registered OK`, but never `transform ran`. `debug agent v2probe` → not found. |
| V3 | The live config is the **v1** shape (`agent`, `model`, `provider`). The v2 schema (`agents`, `plugins`, `commands` in `packages/core/src/config.ts`) exists in parallel and is opt-in. | Live `~/.config/vangio/opencode.json` top-level keys are `$schema, agent, model, provider, small_model`. |
| V4 | **Unknown top-level config keys are silently dropped** by the v2 decoder (`onExcessProperty: "ignore"`). | `packages/core/src/config.ts:143`. This is why paradigms get their own files instead of a `paradigm:` key in `opencode.json`. |
| V5 | Agent resolution merges config entries over natives in one loop; config wins per-field. | `packages/opencode/src/agent/agent.ts:267-294`. |
| V6 | Agents with `mode: "primary"` appear in the Tab cycle; `"subagent"` does not. Tab order is alphabetical. | `agent.ts:141-265`, `list()` at `:316-326`. |
| V7 | **External plugin load failures are swallowed silently** (`Effect.ignoreCause`). A broken paradigm plugin will vanish with no error — the same failure shape as the 2026-07-18 incident where Gryphon disappeared. | `packages/core/src/config/plugin/external.ts:87`. |
| V8 | User plugins load from `~/.config/vangio/plugins/*.{ts,js}` (directory scan) as well as the config `plugins` array. | `external.ts:58-69`; the existing `vangio-notifier.js` lives there. |

**Consequence of V2:** every instinct to "use the modern v2 plugin API" is wrong for this feature
today. Build on the v1 `config` hook. Revisit only when upstream's v2 migration lands, at which
point the compile target changes but the paradigm *file format* does not — which is the main reason
the format is kept separate from the compile step.

---

## Global Constraints

- **Patch, don't rewrite.** No upstream file may be modified by Tasks 1–6. All new code lives in `packages/paradigm/`. (Hard rule #1, `docs/fork/`.)
- **Never strip OpenCode's license/attribution.**
- **No AI attribution in commits** — no `Co-Authored-By`, no "Generated with" line. Bagus Giovani is sole author. (Project policy, `.claude/CLAUDE.md`.)
- **Any rename of a storage path ships its migration in the same commit.** (Recorded lesson, `docs/fork/errors.md`.)
- **Heads are N, not 3.** Nothing in the schema may hardcode three heads. (Decision #6, session 16.)
- **Free models by default.** Default paradigm uses only Zen free models; paid models opt-in.
- **Privacy rule:** Zen free models are a feedback-collection tier. Personal use only, never client code.
- Test runner is `bun test` **per package** — root `bun test` is deliberately blocked. Typecheck with `bun typecheck` (31 packages must stay green).
- Config dir is `~/.config/vangio/`; data dir `~/.local/share/vangio/`. The *filename* `opencode.json` is deliberately NOT renamed.

---

## Scope Split — read before starting

This plan covers **the paradigm engine only**: the file format, the compiler, the default Gryphon
paradigm, and activation. It produces working, testable software on its own.

**Deliberately NOT in this plan — the status-row picker.** You chose a TUI picker in addition to the
config key and `/paradigm` command. That belongs in a **separate follow-up plan** because it has a
completely different risk profile: it touches `packages/tui/`, which is upstream-churn territory that
ships ~37 commits/day, so every file it touches becomes permanent monthly merge cost. The engine here
touches zero upstream files. Build and live with the engine first; then the picker is a thin view over
an object that already exists, and you will know from real use whether you want it.

**Open question this plan does NOT close — runtime switching.** The `config` hook runs at config-load
time, so changing the active paradigm mid-session is not obviously possible without a restart. Task 6
*verifies* the switching mechanism rather than assuming one, and ships the restart-based fallback if
runtime switching turns out not to be reachable from a v1 plugin. Do not let a task claim `/paradigm`
works until the verification in Task 6 has actually been run.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/paradigm/package.json` | Workspace package manifest (`@vangio/paradigm`), mirrors `packages/notifier`. |
| `packages/paradigm/tsconfig.json` | Typecheck config, copied from `packages/notifier`. |
| `packages/paradigm/src/schema.ts` | The paradigm type + validation. Pure, no I/O. |
| `packages/paradigm/src/compile.ts` | Pure function: paradigm → agent config entries. The heart of the feature. No I/O, fully unit-testable. |
| `packages/paradigm/src/load.ts` | Disk I/O: find paradigm files, read the active-paradigm marker. |
| `packages/paradigm/src/index.ts` | Plugin entrypoint — the v1 `{ id, server }` default export wiring `load` + `compile` into the `config` hook. |
| `packages/paradigm/test/*.test.ts` | Unit tests per module. |
| `paradigms/gryphon.json` (in repo, installed to config dir) | Gryphon expressed as data. The proof the format works. |

`schema.ts` and `compile.ts` are deliberately I/O-free so the interesting logic is testable without
touching a filesystem or booting the engine.

---

## Task 1: Paradigm schema

**Files:**
- Create: `packages/paradigm/package.json`, `packages/paradigm/tsconfig.json`, `packages/paradigm/src/schema.ts`
- Test: `packages/paradigm/test/schema.test.ts`

**Interfaces:**
- Produces: `type Head = { model: string; role: string; permission?: Record<string, unknown>; prompt?: string }`, `type Paradigm = { name: string; description?: string; king: string; heads: Record<string, Head>; routing: string[]; discipline: Record<string, string> }`, and `parseParadigm(input: unknown): { ok: true; value: Paradigm } | { ok: false; errors: string[] }`.
- `king` names which key in `heads` is the orchestrator. This is what keeps head-count open-ended (V-constraint "N heads"): there is no `king`/`warrior`/`scout` triple in the type, only a map plus a pointer.

- [x] **Step 1: Scaffold the package by copying the notifier's manifest**

Copy `packages/notifier/package.json` and `packages/notifier/tsconfig.json` to `packages/paradigm/`,
then change the `name` field to `@vangio/paradigm`. Keep every other field identical — the notifier
manifest already encodes the DOM-libs and `noUncheckedIndexedAccess` settings this repo needs
(recorded in build-progress session 12).

- [x] **Step 2: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { parseParadigm } from "../src/schema"

const valid = {
  name: "gryphon",
  king: "king",
  heads: {
    king: { model: "opencode/deepseek-v4-flash-free", role: "reason/decide/review" },
    warrior: { model: "opencode/mimo-v2.5-free", role: "implement" },
  },
  routing: ["multi-file implementation -> warrior (requires full spec)"],
  discipline: { warrior: "~60-80% of a king turn - spec required" },
}

describe("parseParadigm", () => {
  test("accepts a valid paradigm", () => {
    const result = parseParadigm(valid)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.heads.king!.model).toBe("opencode/deepseek-v4-flash-free")
  })

  test("accepts two heads and five heads alike (head count is not fixed at three)", () => {
    const two = parseParadigm(valid)
    const five = parseParadigm({
      ...valid,
      heads: {
        ...valid.heads,
        scout: { model: "opencode/north-mini-code-free", role: "lookup" },
        critic: { model: "opencode/mimo-v2.5-free", role: "review" },
        scribe: { model: "opencode/ling-3.0-flash-free", role: "document" },
      },
    })
    expect(two.ok).toBe(true)
    expect(five.ok).toBe(true)
  })

  test("rejects a king that is not present in heads", () => {
    const result = parseParadigm({ ...valid, king: "emperor" })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("emperor")
  })

  test("rejects a head with no model", () => {
    const result = parseParadigm({ ...valid, heads: { king: { role: "reason" } } })
    expect(result.ok).toBe(false)
  })

  test("rejects a non-object", () => {
    expect(parseParadigm(null).ok).toBe(false)
    expect(parseParadigm("gryphon").ok).toBe(false)
  })
})
```

- [x] **Step 3: Run the test to verify it fails**

Run: `cd packages/paradigm && bun test test/schema.test.ts`
Expected: FAIL — cannot resolve `../src/schema`.

- [x] **Step 4: Write the minimal implementation**

```ts
export type Head = {
  model: string
  role: string
  permission?: Record<string, unknown>
  prompt?: string
}

export type Paradigm = {
  name: string
  description?: string
  king: string
  heads: Record<string, Head>
  routing: string[]
  discipline: Record<string, string>
}

export type ParseResult = { ok: true; value: Paradigm } | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseParadigm(input: unknown): ParseResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ["paradigm must be an object"] }

  const name = input["name"]
  if (typeof name !== "string" || name.length === 0) errors.push("name must be a non-empty string")

  const king = input["king"]
  if (typeof king !== "string" || king.length === 0) errors.push("king must be a non-empty string")

  const rawHeads = input["heads"]
  const heads: Record<string, Head> = {}
  if (!isRecord(rawHeads) || Object.keys(rawHeads).length === 0) {
    errors.push("heads must be a non-empty object")
  } else {
    for (const [id, value] of Object.entries(rawHeads)) {
      if (!isRecord(value)) {
        errors.push(`head "${id}" must be an object`)
        continue
      }
      const model = value["model"]
      const role = value["role"]
      if (typeof model !== "string" || model.length === 0) {
        errors.push(`head "${id}" must have a model`)
        continue
      }
      if (typeof role !== "string") {
        errors.push(`head "${id}" must have a role`)
        continue
      }
      heads[id] = {
        model,
        role,
        permission: isRecord(value["permission"]) ? value["permission"] : undefined,
        prompt: typeof value["prompt"] === "string" ? value["prompt"] : undefined,
      }
    }
  }

  if (typeof king === "string" && Object.keys(heads).length > 0 && !heads[king]) {
    errors.push(`king "${king}" is not one of the defined heads`)
  }

  const routing = Array.isArray(input["routing"]) ? input["routing"].filter((r): r is string => typeof r === "string") : []
  const discipline = isRecord(input["discipline"])
    ? Object.fromEntries(Object.entries(input["discipline"]).filter(([, v]) => typeof v === "string")) as Record<string, string>
    : {}

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    value: {
      name: name as string,
      description: typeof input["description"] === "string" ? input["description"] : undefined,
      king: king as string,
      heads,
      routing,
      discipline,
    },
  }
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd packages/paradigm && bun test test/schema.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 6: Commit**

```bash
git add packages/paradigm
git commit -m "feat(paradigm): add paradigm schema with open-ended head count"
```

---

## Task 2: Compile a paradigm into agent config entries

This is the core of the feature and the one place a mistake is expensive. It is a pure function so
it can be tested exhaustively without booting anything.

**Files:**
- Create: `packages/paradigm/src/compile.ts`
- Test: `packages/paradigm/test/compile.test.ts`

**Interfaces:**
- Consumes: `Paradigm`, `Head` from `../src/schema` (Task 1).
- Produces: `compileParadigm(paradigm: Paradigm, options?: { primaries?: string[] }): Record<string, AgentEntry>` where `type AgentEntry = { mode?: string; model?: string; description?: string; prompt?: string; permission?: Record<string, unknown> }`.

**Compile rules (this is the spec — implement exactly):**
1. Every **non-king** head becomes a `mode: "subagent"` entry keyed by the head id, carrying that head's model and permission. Subagents stay out of the Tab cycle (V6) and are reachable as `@name`.
2. The **king** head does NOT become its own primary agent. That is the bug being fixed — it is what put Gryphon in the Tab cycle as a peer of Build and Plan. Instead the king's model and the paradigm doctrine are applied to each **existing primary** (`build` and `plan` by default). This is what makes "Plan mode, Gryphon-orchestrated" expressible.
3. Doctrine text (heads, routing, discipline) is rendered once and appended to each primary's prompt.
4. Nothing else is touched.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { compileParadigm } from "../src/compile"
import type { Paradigm } from "../src/schema"

const gryphon: Paradigm = {
  name: "gryphon",
  king: "king",
  heads: {
    king: { model: "opencode/deepseek-v4-flash-free", role: "reason/decide/review" },
    warrior: { model: "opencode/mimo-v2.5-free", role: "implement" },
    scout: { model: "opencode/north-mini-code-free", role: "lookup", permission: { edit: "deny" } },
  },
  routing: ["grep across 3+ files -> scout", "multi-file implementation -> warrior (requires full spec)"],
  discipline: { scout: "~10% of a king turn - use liberally" },
}

describe("compileParadigm", () => {
  const out = compileParadigm(gryphon)

  test("non-king heads become subagents", () => {
    expect(out["warrior"]!.mode).toBe("subagent")
    expect(out["warrior"]!.model).toBe("opencode/mimo-v2.5-free")
    expect(out["scout"]!.mode).toBe("subagent")
    expect(out["scout"]!.permission).toEqual({ edit: "deny" })
  })

  test("the king does NOT become its own primary agent", () => {
    // This is the whole point: a paradigm must not occupy a Tab slot.
    expect(out["king"]).toBeUndefined()
    expect(out["gryphon"]).toBeUndefined()
  })

  test("the king's model is applied to build and plan", () => {
    expect(out["build"]!.model).toBe("opencode/deepseek-v4-flash-free")
    expect(out["plan"]!.model).toBe("opencode/deepseek-v4-flash-free")
  })

  test("doctrine is appended to every primary", () => {
    for (const primary of ["build", "plan"]) {
      const prompt = out[primary]!.prompt!
      expect(prompt).toContain("grep across 3+ files -> scout")
      expect(prompt).toContain("~10% of a king turn")
      expect(prompt).toContain("@warrior")
    }
  })

  test("primaries are overridable", () => {
    const only = compileParadigm(gryphon, { primaries: ["build"] })
    expect(only["build"]).toBeDefined()
    expect(only["plan"]).toBeUndefined()
  })

  test("a two-head paradigm compiles without a scout", () => {
    const pair = compileParadigm({
      ...gryphon,
      heads: { king: gryphon.heads["king"]!, warrior: gryphon.heads["warrior"]! },
    })
    expect(pair["warrior"]!.mode).toBe("subagent")
    expect(pair["scout"]).toBeUndefined()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd packages/paradigm && bun test test/compile.test.ts`
Expected: FAIL — cannot resolve `../src/compile`.

- [x] **Step 3: Write the minimal implementation**

```ts
import type { Head, Paradigm } from "./schema"

export type AgentEntry = {
  mode?: string
  model?: string
  description?: string
  prompt?: string
  permission?: Record<string, unknown>
}

export const DEFAULT_PRIMARIES = ["build", "plan"]

export function renderDoctrine(paradigm: Paradigm): string {
  const lines: string[] = []
  lines.push(`PARADIGM: ${paradigm.name}`)
  if (paradigm.description) lines.push(paradigm.description)
  lines.push("")
  lines.push("YOUR HEADS:")
  for (const [id, head] of Object.entries(paradigm.heads)) {
    const marker = id === paradigm.king ? "(your own mind)" : `@${id}`
    lines.push(`- ${id} ${marker} [${head.model}]: ${head.role}`)
  }
  if (paradigm.routing.length > 0) {
    lines.push("")
    lines.push("ROUTING RULES:")
    paradigm.routing.forEach((rule, index) => lines.push(`${index + 1}. ${rule}`))
  }
  const discipline = Object.entries(paradigm.discipline)
  if (discipline.length > 0) {
    lines.push("")
    lines.push("TOKEN DISCIPLINE:")
    for (const [id, note] of discipline) lines.push(`- ${id}: ${note}`)
  }
  return lines.join("\n")
}

function subagentEntry(id: string, head: Head, paradigm: Paradigm): AgentEntry {
  const entry: AgentEntry = {
    mode: "subagent",
    model: head.model,
    description: `${paradigm.name} paradigm - ${head.role}`,
  }
  if (head.prompt) entry.prompt = head.prompt
  if (head.permission) entry.permission = head.permission
  return entry
}

export function compileParadigm(
  paradigm: Paradigm,
  options: { primaries?: string[] } = {},
): Record<string, AgentEntry> {
  const result: Record<string, AgentEntry> = {}

  for (const [id, head] of Object.entries(paradigm.heads)) {
    if (id === paradigm.king) continue
    result[id] = subagentEntry(id, head, paradigm)
  }

  const king = paradigm.heads[paradigm.king]
  if (!king) return result

  const doctrine = renderDoctrine(paradigm)
  for (const primary of options.primaries ?? DEFAULT_PRIMARIES) {
    result[primary] = { model: king.model, prompt: doctrine }
  }

  return result
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd packages/paradigm && bun test test/compile.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add packages/paradigm
git commit -m "feat(paradigm): compile a paradigm into agent config entries"
```

---

## Task 3: Load paradigms and the active marker from disk

**Files:**
- Create: `packages/paradigm/src/load.ts`
- Test: `packages/paradigm/test/load.test.ts`

**Interfaces:**
- Consumes: `parseParadigm`, `Paradigm` from `./schema`.
- Produces: `listParadigms(dir: string): Promise<{ paradigms: Record<string, Paradigm>; errors: string[] }>` and `readActiveName(statePath: string): Promise<string | undefined>` and `writeActiveName(statePath: string, name: string): Promise<void>`.

**Path contract (fixed here so later tasks agree):**
- Paradigm files: `~/.config/vangio/paradigms/*.json`
- Active marker: `~/.local/share/vangio/paradigm-active` (plain text, one name)

Both directories are created on demand. `writeActiveName` writes the marker file and its parent
directory together, so activation never half-succeeds.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { listParadigms, readActiveName, writeActiveName } from "../src/load"

let dir: string
beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), "paradigm-")) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

const good = {
  name: "gryphon", king: "king",
  heads: { king: { model: "m/king", role: "reason" }, warrior: { model: "m/war", role: "implement" } },
  routing: [], discipline: {},
}

describe("listParadigms", () => {
  test("loads valid paradigm files keyed by name", async () => {
    const p = path.join(dir, "paradigms")
    await mkdir(p, { recursive: true })
    await writeFile(path.join(p, "gryphon.json"), JSON.stringify(good))
    const result = await listParadigms(p)
    expect(Object.keys(result.paradigms)).toEqual(["gryphon"])
    expect(result.errors).toEqual([])
  })

  test("reports invalid files as errors instead of throwing", async () => {
    const p = path.join(dir, "paradigms")
    await mkdir(p, { recursive: true })
    await writeFile(path.join(p, "broken.json"), "{ not json")
    await writeFile(path.join(p, "bad.json"), JSON.stringify({ name: "bad" }))
    const result = await listParadigms(p)
    expect(Object.keys(result.paradigms)).toEqual([])
    expect(result.errors.length).toBe(2)
  })

  test("returns empty when the directory does not exist", async () => {
    const result = await listParadigms(path.join(dir, "nope"))
    expect(result.paradigms).toEqual({})
    expect(result.errors).toEqual([])
  })
})

describe("active marker", () => {
  test("round-trips a name", async () => {
    const marker = path.join(dir, "state", "paradigm-active")
    expect(await readActiveName(marker)).toBeUndefined()
    await writeActiveName(marker, "gryphon")
    expect(await readActiveName(marker)).toBe("gryphon")
  })

  test("trims whitespace and ignores an empty marker", async () => {
    const marker = path.join(dir, "state", "paradigm-active")
    await writeActiveName(marker, "  gryphon\n")
    expect(await readActiveName(marker)).toBe("gryphon")
    await writeActiveName(marker, "   ")
    expect(await readActiveName(marker)).toBeUndefined()
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd packages/paradigm && bun test test/load.test.ts`
Expected: FAIL — cannot resolve `../src/load`.

- [x] **Step 3: Write the minimal implementation**

```ts
import { readdir, readFile, mkdir, writeFile } from "fs/promises"
import path from "path"
import { parseParadigm, type Paradigm } from "./schema"

export async function listParadigms(
  dir: string,
): Promise<{ paradigms: Record<string, Paradigm>; errors: string[] }> {
  const paradigms: Record<string, Paradigm> = {}
  const errors: string[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return { paradigms, errors }
  }

  for (const entry of entries.filter((e) => e.endsWith(".json")).sort()) {
    const file = path.join(dir, entry)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(file, "utf8"))
    } catch (error) {
      errors.push(`${entry}: not valid JSON (${(error as Error).message})`)
      continue
    }
    const parsed = parseParadigm(raw)
    if (!parsed.ok) {
      errors.push(`${entry}: ${parsed.errors.join("; ")}`)
      continue
    }
    paradigms[parsed.value.name] = parsed.value
  }

  return { paradigms, errors }
}

export async function readActiveName(statePath: string): Promise<string | undefined> {
  try {
    const value = (await readFile(statePath, "utf8")).trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export async function writeActiveName(statePath: string, name: string): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(statePath, `${name.trim()}\n`, "utf8")
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd packages/paradigm && bun test test/load.test.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add packages/paradigm
git commit -m "feat(paradigm): load paradigm files and the active marker"
```

---

## Task 4: The plugin entrypoint

**Files:**
- Create: `packages/paradigm/src/index.ts`
- Test: `packages/paradigm/test/index.test.ts`

**Interfaces:**
- Consumes: `listParadigms`, `readActiveName` (Task 3); `compileParadigm` (Task 2).
- Produces: a default export `{ id: "vangio-paradigm", server: () => Promise<Hooks> }` and a testable `applyParadigm(cfg, deps)` seam.

**Why the plugin is v1-shaped:** finding V1/V2 above. The v2 `ctx.agent.transform` registers and then
silently does nothing on the live path. Do not "modernize" this without re-running the probe.

**Merge semantics:** the compiled entries must **not** clobber a user's hand-written agent config.
Existing keys in `cfg.agent[id]` win over compiled values, so someone who has pinned a model by hand
keeps it. The compiled doctrine is *appended* to any existing prompt rather than replacing it.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { applyParadigm } from "../src/index"
import type { Paradigm } from "../src/schema"

const gryphon: Paradigm = {
  name: "gryphon", king: "king",
  heads: {
    king: { model: "m/king", role: "reason" },
    warrior: { model: "m/war", role: "implement" },
  },
  routing: ["multi-file -> warrior"], discipline: {},
}

const deps = { paradigms: { gryphon }, errors: [] as string[], active: "gryphon" }

describe("applyParadigm", () => {
  test("injects subagents and applies the king model to primaries", async () => {
    const cfg: any = { agent: {} }
    await applyParadigm(cfg, deps)
    expect(cfg.agent.warrior.mode).toBe("subagent")
    expect(cfg.agent.build.model).toBe("m/king")
    expect(cfg.agent.build.prompt).toContain("multi-file -> warrior")
  })

  test("does nothing when no paradigm is active", async () => {
    const cfg: any = { agent: {} }
    await applyParadigm(cfg, { ...deps, active: undefined })
    expect(cfg.agent).toEqual({})
  })

  test("does nothing when the active paradigm is unknown", async () => {
    const cfg: any = { agent: {} }
    await applyParadigm(cfg, { ...deps, active: "does-not-exist" })
    expect(cfg.agent).toEqual({})
  })

  test("a hand-written model wins over the compiled one", async () => {
    const cfg: any = { agent: { warrior: { model: "m/pinned" } } }
    await applyParadigm(cfg, deps)
    expect(cfg.agent.warrior.model).toBe("m/pinned")
    expect(cfg.agent.warrior.mode).toBe("subagent")
  })

  test("doctrine is appended to an existing prompt, not replacing it", async () => {
    const cfg: any = { agent: { build: { prompt: "KEEP ME" } } }
    await applyParadigm(cfg, deps)
    expect(cfg.agent.build.prompt).toContain("KEEP ME")
    expect(cfg.agent.build.prompt).toContain("multi-file -> warrior")
  })

  test("tolerates a config with no agent key at all", async () => {
    const cfg: any = {}
    await applyParadigm(cfg, deps)
    expect(cfg.agent.warrior.mode).toBe("subagent")
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd packages/paradigm && bun test test/index.test.ts`
Expected: FAIL — `applyParadigm` is not exported.

- [x] **Step 3: Write the minimal implementation**

```ts
import os from "os"
import path from "path"
import { compileParadigm, type AgentEntry } from "./compile"
import { listParadigms, readActiveName } from "./load"
import type { Paradigm } from "./schema"

export const PARADIGM_DIR = path.join(os.homedir(), ".config", "vangio", "paradigms")
export const ACTIVE_MARKER = path.join(os.homedir(), ".local", "share", "vangio", "paradigm-active")

export type ApplyDeps = {
  paradigms: Record<string, Paradigm>
  errors: string[]
  active: string | undefined
}

export async function applyParadigm(cfg: any, deps: ApplyDeps): Promise<void> {
  for (const error of deps.errors) console.error(`vangio-paradigm: ${error}`)
  if (!deps.active) return
  const paradigm = deps.paradigms[deps.active]
  if (!paradigm) {
    console.error(`vangio-paradigm: active paradigm "${deps.active}" not found`)
    return
  }

  const compiled = compileParadigm(paradigm)
  cfg.agent = cfg.agent ?? {}

  for (const [id, entry] of Object.entries(compiled) as [string, AgentEntry][]) {
    const existing = cfg.agent[id] ?? {}
    const merged: Record<string, unknown> = { ...entry, ...existing }
    if (entry.prompt) {
      merged["prompt"] = existing.prompt ? `${existing.prompt}\n\n${entry.prompt}` : entry.prompt
    }
    cfg.agent[id] = merged
  }
}

export default {
  id: "vangio-paradigm",
  server: async () => ({
    config: async (cfg: any) => {
      const { paradigms, errors } = await listParadigms(PARADIGM_DIR)
      const active = await readActiveName(ACTIVE_MARKER)
      await applyParadigm(cfg, { paradigms, errors, active })
    },
  }),
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `cd packages/paradigm && bun test test/index.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Run the whole package suite and typecheck**

Run: `cd packages/paradigm && bun test` then from the repo root `bun typecheck`
Expected: all paradigm tests pass; typecheck reports 32 successful (31 existing + `@vangio/paradigm`).

- [x] **Step 6: Commit**

```bash
git add packages/paradigm
git commit -m "feat(paradigm): add plugin entrypoint compiling the active paradigm"
```

---

## Task 5: Express Gryphon as data, and make premium a head swap

This is the task that pays off the original complaint: `premium-gryphon` stops being a copy-pasted
clone and becomes one field.

**Files:**
- Create: `paradigms/gryphon.json`, `paradigms/premium-gryphon.json`
- Test: `packages/paradigm/test/gryphon.test.ts`

**Interfaces:**
- Consumes: `parseParadigm` (Task 1), `compileParadigm` (Task 2).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import path from "path"
import { parseParadigm } from "../src/schema"
import { compileParadigm } from "../src/compile"

const root = path.join(import.meta.dir, "..", "..", "..", "paradigms")
async function load(name: string) {
  const parsed = parseParadigm(JSON.parse(await readFile(path.join(root, `${name}.json`), "utf8")))
  if (!parsed.ok) throw new Error(parsed.errors.join("; "))
  return parsed.value
}

describe("shipped paradigms", () => {
  test("gryphon is valid and uses only free models", async () => {
    const gryphon = await load("gryphon")
    expect(gryphon.king).toBe("king")
    for (const head of Object.values(gryphon.heads)) {
      expect(head.model).toContain("free")
    }
  })

  test("scout cannot edit", async () => {
    const gryphon = await load("gryphon")
    expect(gryphon.heads["scout"]!.permission).toEqual({ edit: "deny" })
  })

  test("gryphon does not occupy a Tab slot", async () => {
    const compiled = compileParadigm(await load("gryphon"))
    expect(compiled["gryphon"]).toBeUndefined()
    expect(Object.entries(compiled).filter(([, e]) => e.mode === "subagent").length).toBe(2)
  })

  test("premium differs from gryphon ONLY in the king head", async () => {
    const free = await load("gryphon")
    const paid = await load("premium-gryphon")
    expect(paid.heads["king"]!.model).not.toBe(free.heads["king"]!.model)
    // every other head must be byte-identical - that is the point of a head swap
    for (const id of Object.keys(free.heads)) {
      if (id === "king") continue
      expect(paid.heads[id]).toEqual(free.heads[id])
    }
    expect(paid.routing).toEqual(free.routing)
    expect(paid.discipline).toEqual(free.discipline)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/paradigm && bun test test/gryphon.test.ts`
Expected: FAIL — `paradigms/gryphon.json` does not exist.

- [ ] **Step 3: Write `paradigms/gryphon.json`**

```json
{
  "name": "gryphon",
  "description": "One beast with three heads. A strong model reasons, a cheaper model implements, the cheapest looks things up.",
  "king": "king",
  "heads": {
    "king": {
      "model": "opencode/deepseek-v4-flash-free",
      "role": "plan, decide, implement carefully, review critically"
    },
    "warrior": {
      "model": "opencode/mimo-v2.5-free",
      "role": "implement fully-specified chunks - exact files, changes, and verification steps"
    },
    "scout": {
      "model": "opencode/north-mini-code-free",
      "role": "fast factual lookups - where is X defined, which file does Y",
      "permission": { "edit": "deny" }
    }
  },
  "routing": [
    "trivial lookup (< 2 file reads) -> do it yourself",
    "grep across 3+ files -> @scout",
    "small edit (< 5 lines, 1 file, well understood) -> do it yourself",
    "multi-file implementation, new logic, needs testing -> @warrior with a complete spec",
    "ambiguous architecture question -> keep it, think harder, do NOT guess"
  ],
  "discipline": {
    "scout": "under 10% of a king turn - use liberally",
    "warrior": "60-80% of a king turn - only with a complete spec",
    "self": "3+ reasoning turns on one task -> consider delegating; 5+ turns with no concrete output -> stop and ask the user"
  }
}
```

- [ ] **Step 4: Write `paradigms/premium-gryphon.json`**

Copy `gryphon.json` verbatim, then change exactly two things: `name` to `premium-gryphon`, and the
`king` head's `model` to `anthropic/claude-sonnet-4-20250514`. Every other field — including all of
`warrior`, `scout`, `routing`, and `discipline` — must stay byte-identical, because the test asserts
it. Update `description` to note it is the paid king.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/paradigm && bun test test/gryphon.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add paradigms packages/paradigm
git commit -m "feat(paradigm): express gryphon as data; premium is a king-head swap"
```

---

## Task 6: Activate end-to-end, and VERIFY the switching mechanism

Nothing before this point has proved the feature works in the real engine. Unit tests cannot catch
finding V7 (plugins fail silently). This task is the gate.

**Files:**
- Create: `packages/paradigm/script/install.ts` (bundles the plugin and installs the paradigm files)
- Modify: `docs/fork/build-progress.md`, `docs/fork/errors.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the install script**

It must do three things, and print what it did:
1. `Bun.build` `packages/paradigm/src/index.ts` into `~/.config/vangio/plugins/vangio-paradigm.js`, `target: "node"`, `format: "esm"`, bundling dependencies. Mirror `packages/notifier`'s existing bundling approach exactly — the notifier had to default-export `{ id, server }` and the same applies here.
2. Copy `paradigms/*.json` into `~/.config/vangio/paradigms/`.
3. Write `gryphon` into `~/.local/share/vangio/paradigm-active`.

- [ ] **Step 2: Run the install script**

Run: `bun run packages/paradigm/script/install.ts`
Expected: prints the bundled plugin path, the copied paradigm files, and the active marker.

- [ ] **Step 3: Verify the plugin actually loaded — do not skip this**

Run: `bun run packages/opencode/src/index.ts debug agent warrior`
Expected: JSON for `warrior` showing `"mode": "subagent"` and the MiMo model.

Then: `bun run packages/opencode/src/index.ts debug agent build`
Expected: `build` carries the DeepSeek model and a prompt containing `ROUTING RULES`.

**If either returns "not found" or lacks the paradigm fields, the plugin silently failed to load
(finding V7). Do not proceed and do not report success.** Debug by adding a `console.error` at the
top of `server()` and re-running — that is how the probe in the research phase distinguished "did not
load" from "loaded but had no effect".

- [ ] **Step 4: Verify Gryphon has LEFT the Tab cycle**

Remove the now-redundant `gryphon` and `premium-gryphon` entries from the `agent` block of
`~/.config/vangio/opencode.json` (back the file up first — it is not version-controlled). Keep
`warrior` and `scout` only if you want hand-pinned overrides; the paradigm supplies them otherwise.

Then launch the TUI under the ConPTY harness per `.claude/skills/verify/SKILL.md` and assert:
- Tab cycles **Build → Plan** only.
- The status row shows the DeepSeek model.
- `@warrior` and `@scout` are still reachable as subagents.

`--version` is NOT proof — it exits before the TUI module graph loads (errors.md 2026-07-20).

- [ ] **Step 5: Determine whether runtime switching is reachable**

This is a genuine open question, not a formality. Try, in order:
1. Change the active marker (`echo premium-gryphon > ~/.local/share/vangio/paradigm-active`) and check whether a **running** session picks it up, or whether it needs a restart.
2. Check whether the v1 `config` hook re-fires on config reload by adding a temporary `console.error` counter.

Record the honest answer in `docs/fork/build-progress.md`:
- If a restart is required, ship that as the documented behaviour for now and note that `/paradigm` as a live switch is **not yet implemented**.
- Do **not** write a `/paradigm` command that appears to work but silently requires a restart.

- [ ] **Step 6: Update the docs**

- `docs/fork/build-progress.md`: new session row recording what shipped, and resolve open decisions #3 and #5 from `vangio-gryphon-issue.md`.
- `docs/fork/errors.md`: add a watchlist entry for finding V2 — "`ctx.agent.transform` registers but never fires on the live path; re-run the probe after every upstream merge, because when upstream's v2 migration lands the compile target must move from `cfg.agent` to the v2 agent domain."

- [ ] **Step 7: Commit and push**

```bash
git add packages/paradigm paradigms docs/fork
git commit -m "feat(paradigm): activate the paradigm layer and verify end to end"
git push origin dev
```

---

## Self-Review

**Spec coverage.** Decision #1 (schema *and* philosophy) → Tasks 1–2: structured heads plus prose
doctrine rendered into the prompt. #2 (Tab switches mode, paradigm is separate) → Task 2 rule 2 and
Task 6 step 4, which assert the king never becomes a primary. #4 (compile down) → Task 4, on the
verified v1 `config` hook. #6 (N heads) → Task 1 tests two and five heads; Task 2 tests a two-head
compile. #3 (selection mechanism) → partially: the config-file half ships in Tasks 3–6; the
`/paradigm` live switch is honestly gated behind Task 6 step 5 rather than assumed, and the status-row
picker is split into a follow-up plan. #5 (sequencing) → this plan runs before v3 finishes, per your
choice; nothing here touches the notifier.

**Known gap, stated rather than hidden.** You asked for a status-row picker. This plan does not build
it, for the scope reason given above. If you want it in this pass instead of a follow-up, say so and
it becomes Tasks 7–9 — but it is the only part of the feature that would put VanGio code into
`packages/tui`, and that is a recurring monthly cost rather than a one-time one.

**Placeholder scan.** No TBDs. Every code step has real code. Task 5 step 4 and Task 6 step 1 describe
edits rather than pasting full content — deliberate, because step 4 is "copy this file and change two
named fields" (pasting it invites drift from the file the test compares against) and step 1 mirrors an
existing script in the repo.

**Type consistency.** `Paradigm`, `Head`, `AgentEntry`, `ApplyDeps` are defined once and used with the
same shape throughout. `compileParadigm(paradigm, options?)`, `listParadigms(dir)`,
`readActiveName(statePath)`, `writeActiveName(statePath, name)`, `applyParadigm(cfg, deps)` keep their
signatures across tasks. Path constants `PARADIGM_DIR` and `ACTIVE_MARKER` are defined in Task 4 and
consumed by Task 6's install script.
