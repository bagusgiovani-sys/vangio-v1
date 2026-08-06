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
