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
