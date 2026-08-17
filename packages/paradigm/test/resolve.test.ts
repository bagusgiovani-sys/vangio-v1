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
