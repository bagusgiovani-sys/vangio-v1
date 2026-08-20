import { describe, expect, test } from "bun:test"
import { applyParadigm } from "../src/index"
import type { Paradigm } from "../src/schema"

const gryphon: Paradigm = {
  name: "gryphon",
  king: "king",
  heads: {
    king: { model: "m/king", role: "reason" },
    warrior: { model: "m/war", role: "implement" },
  },
  routing: ["multi-file -> warrior"],
  discipline: {},
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

// The clobber: `{ ...entry, ...existing }` is a SHALLOW spread, so a user who
// sets agent.build.options in opencode.json for any unrelated reason replaces
// the paradigm's options wholesale and the fallback chain silently disappears.
// Verified against remeda/JS semantics before the fix:
//   { ...{options:{fallback:['a']}}, ...{options:{other:1}} } -> {options:{other:1}}
// The same function already special-cases `prompt` for exactly this reason.
describe("applyParadigm options merge", () => {
  const declared: Paradigm = {
    ...gryphon,
    heads: {
      ...gryphon.heads,
      king: { ...gryphon.heads.king!, fallback: ["m/spare"], needs: { minOutput: 1000 } },
    },
  }
  const declaredDeps = { paradigms: { gryphon: declared }, errors: [] as string[], active: "gryphon" }

  test("keeps the paradigm's fallback when the user sets unrelated options", async () => {
    const cfg: any = { agent: { build: { options: { reasoningEffort: "high" } } } }
    await applyParadigm(cfg, declaredDeps)
    expect(cfg.agent.build.options.fallback).toEqual(["m/spare"])
    expect(cfg.agent.build.options.reasoningEffort).toBe("high")
  })

  test("lets the user override one declared key without dropping the rest", async () => {
    const cfg: any = { agent: { build: { options: { fallback: ["m/mine"] } } } }
    await applyParadigm(cfg, declaredDeps)
    expect(cfg.agent.build.options.fallback).toEqual(["m/mine"])
    expect(cfg.agent.build.options.needs).toEqual({ minOutput: 1000 })
  })

  test("does not invent an options bag where neither side has one", async () => {
    const cfg: any = { agent: {} }
    await applyParadigm(cfg, deps)
    expect(cfg.agent.build.options).toBeUndefined()
  })

  test("still lets user config win on the scalar keys it always won on", async () => {
    const cfg: any = { agent: { build: { model: "m/user-choice" } } }
    await applyParadigm(cfg, declaredDeps)
    expect(cfg.agent.build.model).toBe("m/user-choice")
  })
})
