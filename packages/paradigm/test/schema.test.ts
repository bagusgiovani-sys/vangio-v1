import { describe, expect, test } from "bun:test"
import { parseParadigm, shiftAuto } from "../src/schema"

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

function withKing(extra: Record<string, unknown>) {
  return { ...valid, heads: { ...valid.heads, king: { ...valid.heads.king, ...extra } } }
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

  // Stage one of the free-tier fallback (docs/superpowers/specs/2026-08-13).
  // `needs` is the head's intent and `fallback` is the ordered chain the static
  // resolver walks. Both optional: every paradigm on disk predates them.
  describe("fallback declaration", () => {
    test("accepts a paradigm with neither field, unchanged", () => {
      const result = parseParadigm(valid)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.heads.king!.needs).toBeUndefined()
        expect(result.value.heads.king!.fallback).toBeUndefined()
      }
    })

    test("carries an ordered fallback chain across verbatim", () => {
      const result = parseParadigm(withKing({
        fallback: ["opencode/nemotron-3.5-lightning-free", "opencode/nemotron-3-ultra-free"],
      }))
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.value.heads.king!.fallback).toEqual([
          "opencode/nemotron-3.5-lightning-free",
          "opencode/nemotron-3-ultra-free",
        ])
    })

    // A silently dropped entry is the invisible staleness the spec objects to:
    // the chain would look longer than it is and fail at the worst moment.
    test("rejects a fallback that is not an array of non-empty strings", () => {
      expect(parseParadigm(withKing({ fallback: "opencode/hy3-free" })).ok).toBe(false)
      expect(parseParadigm(withKing({ fallback: [123] })).ok).toBe(false)
      expect(parseParadigm(withKing({ fallback: [""] })).ok).toBe(false)
    })

    test("names the offending head in a fallback error", () => {
      const result = parseParadigm(withKing({ fallback: [123] }))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.errors.join(" ")).toContain("king")
    })

    test("accepts an empty fallback chain as a deliberate 'do not swap this head'", () => {
      const result = parseParadigm(withKing({ fallback: [] }))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.heads.king!.fallback).toEqual([])
    })

    test("carries needs across, keeping only the fields it understands", () => {
      const result = parseParadigm(withKing({
        needs: { minOutput: 100000, tools: true, attachment: false, invented: "ignored" },
      }))
      expect(result.ok).toBe(true)
      if (result.ok)
        expect(result.value.heads.king!.needs).toEqual({ minOutput: 100000, tools: true, attachment: false })
    })

    test("rejects a needs whose values are the wrong type", () => {
      expect(parseParadigm(withKing({ needs: { minOutput: "lots" } })).ok).toBe(false)
      expect(parseParadigm(withKing({ needs: { tools: "yes" } })).ok).toBe(false)
      expect(parseParadigm(withKing({ needs: [] })).ok).toBe(false)
    })

    // minOutput is the field that decides whether a substitute can do the job
    // at all - five of the seven free models cap output at 32k - so a zero or
    // negative budget is a typo, not a preference.
    test("rejects a minOutput that is not a positive number", () => {
      expect(parseParadigm(withKing({ needs: { minOutput: 0 } })).ok).toBe(false)
      expect(parseParadigm(withKing({ needs: { minOutput: -1 } })).ok).toBe(false)
    })
  })

  describe("shift toggle", () => {
    test("defaults to auto when the paradigm says nothing", () => {
      const result = parseParadigm(valid)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shift).toBeUndefined()
        expect(shiftAuto(result.value)).toBe(true)
      }
    })

    test("honours an explicit auto: false", () => {
      const result = parseParadigm({ ...valid, shift: { auto: false } })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.shift).toEqual({ auto: false })
        expect(shiftAuto(result.value)).toBe(false)
      }
    })

    test("rejects a shift that is not an object with a boolean auto", () => {
      expect(parseParadigm({ ...valid, shift: { auto: "yes" } }).ok).toBe(false)
      expect(parseParadigm({ ...valid, shift: true }).ok).toBe(false)
    })
  })
})
