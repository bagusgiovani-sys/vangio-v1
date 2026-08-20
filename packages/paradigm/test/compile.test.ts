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

// Option B of the fallback channel decision (2026-08-20): a head's declaration
// travels to the session layer inside the agent entry's `options` bag, which
// Agent.Info already carries as Record<string, unknown>. Written explicitly
// rather than relying on the config schema's unknown-key sweep - that sweep is
// a DECODE transform, and the paradigm plugin's config hook fires after decode.
describe("compileParadigm fallback declaration", () => {
  const declared: Paradigm = {
    ...gryphon,
    heads: {
      ...gryphon.heads,
      king: {
        ...gryphon.heads.king!,
        needs: { minOutput: 100_000, tools: true },
        fallback: ["opencode/nemotron-3.5-lightning-free"],
      },
      warrior: {
        ...gryphon.heads.warrior!,
        fallback: ["opencode/hy3-free"],
      },
    },
  }

  test("carries a subagent head's chain into its agent options", () => {
    const out = compileParadigm(declared)
    expect(out["warrior"]!.options).toEqual({ fallback: ["opencode/hy3-free"] })
  })

  test("carries the king's chain onto every primary it becomes", () => {
    const out = compileParadigm(declared)
    for (const primary of ["build", "plan"]) {
      expect(out[primary]!.options).toEqual({
        needs: { minOutput: 100_000, tools: true },
        fallback: ["opencode/nemotron-3.5-lightning-free"],
      })
    }
  })

  test("omits options entirely for a head that declares nothing", () => {
    const out = compileParadigm(declared)
    expect(out["scout"]!.options).toBeUndefined()
  })

  // Every bundled preset today declares neither field, so this is the case
  // that actually ships - it must not start emitting empty bags.
  test("leaves an undeclared paradigm's entries exactly as they were", () => {
    const out = compileParadigm(gryphon)
    for (const entry of Object.values(out)) expect(entry.options).toBeUndefined()
  })
})

describe("compileParadigm shift toggle", () => {
  test("carries an explicit auto:false to every head so the seam can honour it", () => {
    const out = compileParadigm({ ...gryphon, shift: { auto: false } })
    expect(out["build"]!.options).toEqual({ shiftAuto: false })
    expect(out["warrior"]!.options).toEqual({ shiftAuto: false })
  })

  test("stays silent when auto is on, which is the default everywhere else", () => {
    const out = compileParadigm({ ...gryphon, shift: { auto: true } })
    expect(out["build"]!.options).toBeUndefined()
  })
})
