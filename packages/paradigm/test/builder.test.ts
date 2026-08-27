import { describe, expect, test } from "bun:test"
import {
  GENERATED_SCHEMA,
  builderSystem,
  builderRequest,
  parseGenerated,
  toDraft,
  MAX_GENERATED_HEADS,
  type Generated,
} from "../src/builder"
import { listRoles, KING_ROLE_ID } from "../src/roles"
import { BUNDLED_NAMES, canFinish, toParadigm } from "../src/craft"
import { parseParadigm } from "../src/schema"

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

  test("rejects a name that collides with an existing paradigm", () => {
    const result = parseGenerated(ok(), { existing: ["tiktok-shop"] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join(" ")).toContain("tiktok-shop")
  })

  test("rejects a bundled name - install.ts would silently revert it", () => {
    const result = parseGenerated({ ...ok(), name: BUNDLED_NAMES[0] }, { existing: [] })
    expect(result.ok).toBe(false)
  })

  test("rejects a name the filename rules would not survive", () => {
    const result = parseGenerated({ ...ok(), name: "../escape" }, { existing: [] })
    expect(result.ok).toBe(false)
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
