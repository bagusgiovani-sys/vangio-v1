import { describe, expect, test } from "bun:test"
import {
  GENERATED_SCHEMA,
  builderSystem,
  builderRequest,
  parseGenerated,
  toDraft,
  sanitiseName,
  pickForRole,
  builderFallbacks,
  MAX_GENERATED_HEADS,
  type Generated,
} from "../src/builder"
import { listRoles, KING_ROLE_ID } from "../src/roles"
import { BUNDLED_NAMES, canFinish, toParadigm, validateName } from "../src/craft"
import { parseParadigm } from "../src/schema"
import { isFree, type CandidateModel } from "../src/resolve"

const ok = (): Generated => ({
  name: "tiktok-shop",
  description: "A team that writes short-form video scripts and checks the numbers.",
  shape: "court",
  heads: [
    { role: "warrior", purpose: "write the scripts" },
    { role: "scout", purpose: "look up what is trending" },
  ],
  routing: ["trivial lookup -> do it yourself"],
  discipline: { scout: "use liberally" },
})

describe("GENERATED_SCHEMA", () => {
  test("never offers the model a place to name a model", () => {
    // The whole point: an LLM asked for a model id will confidently invent a
    // retired one. If this string ever appears, that failure class is back.
    expect(JSON.stringify(GENERATED_SCHEMA)).not.toContain("model")
  })

  test("constrains shape to the two Craft knows about", () => {
    const shape = (GENERATED_SCHEMA as any).properties.shape
    expect(shape.enum).toEqual(["court", "legion"])
  })

  test("constrains role to exactly the non-mandatory role ids", () => {
    const role = (GENERATED_SCHEMA as any).properties.heads.items.properties.role
    const expected = listRoles()
      .filter((r) => !r.mandatory)
      .map((r) => r.id)
    expect(role.enum.sort()).toEqual(expected.sort())
  })

  test("does not let the model add a king - the king is not its decision", () => {
    const role = (GENERATED_SCHEMA as any).properties.heads.items.properties.role
    expect(role.enum).not.toContain(KING_ROLE_ID)
  })
})

describe("builderSystem", () => {
  test("names every role the model is allowed to use, with its summary", () => {
    const system = builderSystem()
    for (const role of listRoles().filter((r) => !r.mandatory)) {
      expect(system).toContain(role.id)
      expect(system).toContain(role.summary)
    }
  })

  test("states the head ceiling so the model does not propose an eighth", () => {
    expect(builderSystem()).toContain(String(MAX_GENERATED_HEADS))
  })

  test("tells the model the king already exists", () => {
    expect(builderSystem().toLowerCase()).toContain("king")
  })
})

describe("builderRequest", () => {
  test("carries the goal verbatim", () => {
    expect(builderRequest("sell bras on tiktok", [])).toContain("sell bras on tiktok")
  })

  test("lists names already taken so the model does not collide", () => {
    const request = builderRequest("anything", ["gryphon", "web-dev"])
    expect(request).toContain("gryphon")
    expect(request).toContain("web-dev")
  })
})

describe("parseGenerated", () => {
  test("accepts a well-formed shape", () => {
    const result = parseGenerated(ok(), { existing: [] })
    expect(result.ok).toBe(true)
  })

  test("rejects a non-object", () => {
    expect(parseGenerated("nope", { existing: [] })).toEqual({
      ok: false,
      errors: ["generated paradigm must be an object"],
    })
  })

  test("rejects a hallucinated role rather than letting it reach run time", () => {
    const bad = { ...ok(), heads: [{ role: "wizard", purpose: "cast spells" }] }
    const result = parseGenerated(bad, { existing: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("wizard")
  })

  test("rejects the king as a generated head - slot 0 is not the model's call", () => {
    const bad = { ...ok(), heads: [{ role: KING_ROLE_ID, purpose: "rule" }] }
    const result = parseGenerated(bad, { existing: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain(KING_ROLE_ID)
  })

  test("rejects an empty heads array - a king alone is not a team", () => {
    const result = parseGenerated({ ...ok(), heads: [] }, { existing: [] })
    expect(result.ok).toBe(false)
  })

  test("rejects more heads than the king plus six", () => {
    const heads = Array.from({ length: MAX_GENERATED_HEADS + 1 }, () => ({
      role: "scout",
      purpose: "look",
    }))
    const result = parseGenerated({ ...ok(), heads }, { existing: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain(String(MAX_GENERATED_HEADS))
  })

  test("accepts exactly the maximum", () => {
    const heads = Array.from({ length: MAX_GENERATED_HEADS }, () => ({
      role: "scout",
      purpose: "look",
    }))
    expect(parseGenerated({ ...ok(), heads }, { existing: [] }).ok).toBe(true)
  })

  test("rejects an unknown shape", () => {
    const result = parseGenerated({ ...ok(), shape: "swarm" }, { existing: [] })
    expect(result.ok).toBe(false)
  })

  test("suffixes around a collision instead of discarding a good team", () => {
    const result = parseGenerated(ok(), { existing: ["tiktok-shop"] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe("tiktok-shop-2")
  })

  test("never lands on a bundled name - install.ts would silently revert it", () => {
    const result = parseGenerated({ ...ok(), name: BUNDLED_NAMES[0] }, { existing: [] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(BUNDLED_NAMES).not.toContain(result.value.name)
      expect(result.value.name).toBe(`${BUNDLED_NAMES[0]}-2`)
    }
  })

  test("defuses a traversal shape by construction rather than by rejecting it", () => {
    const result = parseGenerated({ ...ok(), name: "../escape" }, { existing: [] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.name).toBe("escape")
      expect(result.value.name).not.toContain("/")
      expect(result.value.name).not.toContain(".")
    }
  })

  test("rejects a head with no purpose", () => {
    const bad = { ...ok(), heads: [{ role: "warrior", purpose: "" }] }
    expect(parseGenerated(bad, { existing: [] }).ok).toBe(false)
  })

  test("tolerates absent routing and discipline - they are enrichment, not structure", () => {
    const lean: any = { ...ok() }
    delete lean.routing
    delete lean.discipline
    const result = parseGenerated(lean, { existing: [] })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.routing).toEqual([])
      expect(result.value.discipline).toEqual({})
    }
  })

  test("drops non-string routing entries rather than rejecting the whole draft", () => {
    const messy: any = { ...ok(), routing: ["good", 7, null, "also good"] }
    const result = parseGenerated(messy, { existing: [] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.routing).toEqual(["good", "also good"])
  })
})

describe("toDraft", () => {
  const pickAll = (roleId: string) => `opencode/${roleId}-model`

  test("puts the king in slot 0 without being told to", () => {
    const { draft } = toDraft(ok(), pickAll)
    expect(draft.heads[0]!.role).toBe(KING_ROLE_ID)
    expect(draft.heads[0]!.model).toBe("opencode/king-model")
  })

  test("lays generated heads out from slot 1 in order", () => {
    const { draft } = toDraft(ok(), pickAll)
    expect(draft.heads[1]!.role).toBe("warrior")
    expect(draft.heads[2]!.role).toBe("scout")
  })

  test("carries name, shape and goal onto the draft", () => {
    const { draft } = toDraft(ok(), pickAll, "sell bras on tiktok")
    expect(draft.name).toBe("tiktok-shop")
    expect(draft.shape).toBe("court")
    expect(draft.goal).toBe("sell bras on tiktok")
  })

  test("produces a draft the existing wizard considers finishable", () => {
    const { draft } = toDraft(ok(), pickAll)
    expect(canFinish(draft)).toBe(true)
  })

  test("produces a paradigm the existing parser accepts", () => {
    const { draft } = toDraft(ok(), pickAll)
    const result = parseParadigm(toParadigm(draft))
    expect(result.ok).toBe(true)
  })

  test("reports a role nothing on this machine can bind, and drops that head", () => {
    const pickNoScout = (roleId: string) =>
      roleId === "scout" ? undefined : `opencode/${roleId}-model`
    const { draft, unbindable } = toDraft(ok(), pickNoScout)
    expect(unbindable).toEqual(["scout"])
    expect(Object.values(draft.heads).map((h) => h.role)).toEqual([KING_ROLE_ID, "warrior"])
  })

  test("reports an unbindable KING, because that draft cannot be rescued", () => {
    const pickNothing = () => undefined
    const { unbindable } = toDraft(ok(), pickNothing)
    expect(unbindable).toContain(KING_ROLE_ID)
  })

  test("a draft that lost every supporting head is not finishable", () => {
    const kingOnly = (roleId: string) =>
      roleId === KING_ROLE_ID ? "opencode/king-model" : undefined
    const { draft } = toDraft(ok(), kingOnly)
    expect(canFinish(draft)).toBe(false)
  })

  test("slots stay contiguous after a head is dropped, so stepBack cannot land on a hole", () => {
    const noWarrior = (roleId: string) =>
      roleId === "warrior" ? undefined : `opencode/${roleId}-model`
    const { draft } = toDraft(ok(), noWarrior)
    const slots = Object.keys(draft.heads).map(Number).sort((a, b) => a - b)
    expect(slots).toEqual([0, 1])
  })
})

describe("the generated paradigm carries its enrichment through to disk", () => {
  test("description, routing, discipline and goal all survive toParadigm", () => {
    const { draft } = toDraft(ok(), (r) => `opencode/${r}-model`, "sell bras on tiktok")
    const paradigm = toParadigm(draft)
    expect(paradigm.description).toBe(ok().description)
    expect(paradigm.routing).toEqual(ok().routing)
    expect(paradigm.discipline).toEqual(ok().discipline)
    expect(paradigm.goal).toBe("sell bras on tiktok")
  })

  test("each head keeps the purpose the model wrote for it", () => {
    const { draft } = toDraft(ok(), (r) => `opencode/${r}-model`)
    const paradigm = toParadigm(draft)
    expect(paradigm.heads["warrior"]!.role).toBe("write the scripts")
    expect(paradigm.heads["scout"]!.role).toBe("look up what is trending")
  })

  test("a hand-crafted draft still gets the v5 description, unchanged", () => {
    const paradigm = toParadigm({
      name: "manual",
      shape: "court",
      heads: { 0: { role: KING_ROLE_ID, model: "a/b" }, 1: { role: "scout", model: "c/d" } },
    })
    expect(paradigm.description).toBe("Crafted paradigm - court")
    expect(paradigm.goal).toBeUndefined()
  })
})

describe("sanitiseName", () => {
  test("rescues the shape a real model actually returned", () => {
    // hy3-free answered "BraTok Court" on 2026-08-27. The team was good; only
    // the name was unusable. Throwing the whole draft away for that is wrong.
    expect(sanitiseName("BraTok Court", [])).toBe("bratok-court")
  })

  test("rescues a longer real answer", () => {
    expect(sanitiseName("TikTok Bra Sales Video Team", [])).toBe("tiktok-bra-sales-video-team")
  })

  test("leaves an already-valid name alone", () => {
    expect(sanitiseName("bra-tiktok-video-team", [])).toBe("bra-tiktok-video-team")
  })

  test("collapses runs of punctuation into single hyphens", () => {
    expect(sanitiseName("  ---Hello___World!!!  ", [])).toBe("hello-world")
  })

  test("gives up when nothing usable survives", () => {
    expect(sanitiseName("!!!", [])).toBeUndefined()
    expect(sanitiseName("   ", [])).toBeUndefined()
  })

  test("suffixes rather than colliding with an existing paradigm", () => {
    expect(sanitiseName("My Team", ["my-team"])).toBe("my-team-2")
  })

  test("keeps counting past a taken suffix", () => {
    expect(sanitiseName("My Team", ["my-team", "my-team-2"])).toBe("my-team-3")
  })

  test("suffixes a bundled name, which install.ts would otherwise revert", () => {
    expect(sanitiseName("Gryphon", [])).toBe("gryphon-2")
  })

  test("its output always satisfies the wizard's own validator", () => {
    for (const raw of ["BraTok Court", "TikTok Bra Sales Video Team", "  ---Hello!!!  "]) {
      const name = sanitiseName(raw, [])
      expect(name).toBeDefined()
      expect(validateName(name!, [])).toBeUndefined()
    }
  })
})

describe("parseGenerated rescues a salvageable name", () => {
  test("accepts a team whose only flaw is the name, and reports the rewrite", () => {
    const result = parseGenerated({ ...ok(), name: "BraTok Court" }, { existing: [] })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.name).toBe("bratok-court")
  })

  test("still rejects a name with nothing to salvage", () => {
    const result = parseGenerated({ ...ok(), name: "!!!" }, { existing: [] })
    expect(result.ok).toBe(false)
  })
})

describe("pickForRole", () => {
  const model = (over: Partial<CandidateModel> & { id: string }): CandidateModel => ({
    providerID: "opencode",
    name: over.id,
    limit: { context: 1_000_000, output: 1_000_000 },
    capabilities: { toolcall: true, input: { image: true } },
    cost: { input: 0, output: 0 },
    ...over,
  })

  test("binds a role to the best runnable model for it", () => {
    const chosen = pickForRole("scout", [model({ id: "hy3-free" })])
    expect(chosen).toBe("opencode/hy3-free")
  })

  test("refuses a model that cannot meet the role's needs", () => {
    // A warrior needs 128k output; this one caps at 32k.
    const tiny = model({ id: "tiny", limit: { context: 200_000, output: 32_000 } })
    expect(pickForRole("warrior", [tiny])).toBeUndefined()
  })

  test("refuses a text-only model for the seer, which is defined by modality", () => {
    const blind = model({
      id: "blind",
      capabilities: { toolcall: true, input: { image: false } },
    })
    expect(pickForRole("seer", [blind])).toBeUndefined()
  })

  test("returns undefined for a role that does not exist", () => {
    expect(pickForRole("wizard", [model({ id: "any" })])).toBeUndefined()
  })

  test("returns undefined when this machine can reach nothing at all", () => {
    expect(pickForRole("scout", [])).toBeUndefined()
  })
})

describe("isFree gates what the builder may degrade onto", () => {
  const m = (id: string, input: number, output: number): CandidateModel => ({
    id,
    providerID: "p",
    name: id,
    limit: { context: 1_000_000, output: 1_000_000 },
    capabilities: { toolcall: true, input: { image: true } },
    cost: { input, output },
  })

  test("a zero-cost model is free", () => {
    expect(isFree(m("free", 0, 0))).toBe(true)
  })

  test("a model that charges for output is not free, even at zero input", () => {
    expect(isFree(m("cheap-in", 0, 3))).toBe(false)
  })

  test("a paid model is not free", () => {
    expect(isFree(m("sonnet", 3, 15))).toBe(false)
  })
})

describe("builderFallbacks", () => {
  const m = (id: string, over: Partial<CandidateModel> = {}): CandidateModel => ({
    id,
    providerID: "opencode",
    name: id,
    limit: { context: 1_000_000, output: 1_000_000 },
    capabilities: { toolcall: true, input: { image: true } },
    cost: { input: 0, output: 0 },
    ...over,
  })

  test("never offers a paid model - the builder must not spend money unasked", () => {
    const paid = m("sonnet", { providerID: "anthropic", cost: { input: 3, output: 15 } })
    expect(builderFallbacks([paid, m("hy3-free")])).toEqual(["opencode/hy3-free"])
  })

  test("puts the curated scout pick ahead of an uncurated model", () => {
    // Catalog order put the 135s model first and blew a 300s budget on
    // 2026-08-27; roles.json curation is what fixes that.
    const order = builderFallbacks([m("zzz-unknown-free"), m("hy3-free")])
    expect(order[0]).toBe("opencode/hy3-free")
  })

  test("excludes a model that cannot make tool calls, since the whole mechanism is one", () => {
    const mute = m("mute-free", { capabilities: { toolcall: false, input: { image: false } } })
    expect(builderFallbacks([mute])).toEqual([])
  })

  test("returns an empty list rather than throwing when nothing is reachable", () => {
    expect(builderFallbacks([])).toEqual([])
  })
})
