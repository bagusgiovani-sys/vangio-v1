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
