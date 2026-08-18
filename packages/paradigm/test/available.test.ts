import { describe, expect, test } from "bun:test"
import { loadCandidates, toCandidate, type SdkModel } from "../src/available"
import type { CandidateModel } from "../src/resolve"

function sdkModel(over: Partial<SdkModel> & { id: string }): SdkModel {
  return {
    providerID: "opencode",
    name: over.id,
    limit: { context: 200_000, output: 128_000 },
    capabilities: { tools: true, input: ["text"] },
    cost: [{ input: 0, output: 0 }],
    ...over,
  }
}

describe("toCandidate", () => {
  test("carries the identity fields across unchanged", () => {
    const candidate = toCandidate(
      sdkModel({ id: "deepseek-v4-flash-free", name: "DeepSeek V4 Flash (free)" }),
    )
    expect(candidate.id).toBe("deepseek-v4-flash-free")
    expect(candidate.providerID).toBe("opencode")
    expect(candidate.name).toBe("DeepSeek V4 Flash (free)")
    expect(candidate.limit).toEqual({ context: 200_000, output: 128_000 })
  })

  test("reads tool support from the capabilities flag the v2 payload spells 'tools'", () => {
    expect(toCandidate(sdkModel({ id: "a", capabilities: { tools: true, input: ["text"] } })).capabilities.toolcall).toBe(
      true,
    )
    expect(
      toCandidate(sdkModel({ id: "b", capabilities: { tools: false, input: ["text"] } })).capabilities.toolcall,
    ).toBe(false)
  })

  // The v2 payload lists input modalities as strings; the resolver asks a
  // boolean question. mimo-v2.5-free really does report
  // ["text", "image", "audio", "video"] (measured against a live /api/model).
  test("treats an input list containing 'image' as image support", () => {
    const seer = toCandidate(
      sdkModel({ id: "mimo-v2.5-free", capabilities: { tools: true, input: ["text", "image", "audio", "video"] } }),
    )
    expect(seer.capabilities.input.image).toBe(true)
  })

  test("treats an input list without 'image' as no image support", () => {
    expect(toCandidate(sdkModel({ id: "text-only" })).capabilities.input.image).toBe(false)
  })

  test("flattens the single cost entry the common case carries", () => {
    const paid = toCandidate(sdkModel({ id: "sonnet", providerID: "anthropic", cost: [{ input: 3, output: 15 }] }))
    expect(paid.cost).toEqual({ input: 3, output: 15 })
  })

  // Measured 2026-08-18: zhipu/glm-4.7-flash comes back from /api/model with
  // cost: []. resolve.isFree() calls zero free, and this keeps that behaviour
  // rather than crashing on cost[0].
  test("reads a missing cost array as free", () => {
    expect(toCandidate(sdkModel({ id: "glm-4.7-flash", providerID: "zhipu", cost: [] })).cost).toEqual({
      input: 0,
      output: 0,
    })
  })

  test("prefers the untiered base price when a model is priced in context tiers", () => {
    const tiered = toCandidate(
      sdkModel({
        id: "tiered",
        cost: [
          { tier: { type: "context", size: 200_000 }, input: 6, output: 30 },
          { input: 3, output: 15 },
        ],
      }),
    )
    expect(tiered.cost).toEqual({ input: 3, output: 15 })
  })
})

const zen = sdkModel({ id: "deepseek-v4-flash-free" })

function configured(): CandidateModel[] {
  return [
    {
      id: "claude-sonnet-4-20250514",
      providerID: "anthropic",
      name: "Claude Sonnet 4",
      limit: { context: 200_000, output: 64_000 },
      capabilities: { toolcall: true, input: { image: true } },
      cost: { input: 3, output: 15 },
    },
  ]
}

describe("loadCandidates", () => {
  test("returns the reachable models, converted, and no warning", async () => {
    const result = await loadCandidates({
      available: async () => [zen],
      configured,
    })
    expect(result.models.map((model) => model.id)).toEqual(["deepseek-v4-flash-free"])
    expect(result.warning).toBeUndefined()
  })

  test("falls back to the configured models when the server cannot be asked", async () => {
    const result = await loadCandidates({
      available: async () => {
        throw new Error("connect ECONNREFUSED")
      },
      configured,
    })
    expect(result.models.map((model) => model.id)).toEqual(["claude-sonnet-4-20250514"])
  })

  test("says out loud that a fallback list is unverified, and why", async () => {
    const result = await loadCandidates({
      available: async () => {
        throw new Error("connect ECONNREFUSED")
      },
      configured,
    })
    expect(result.warning).toContain("credentials")
    expect(result.warning).toContain("connect ECONNREFUSED")
  })

  // Nothing reachable is a real answer on a machine with no keys, not a
  // failure. Falling back here would print exactly the unusable models this
  // whole change exists to stop offering.
  test("keeps an empty answer empty rather than falling back to unusable models", async () => {
    const result = await loadCandidates({
      available: async () => [],
      configured,
    })
    expect(result.models).toEqual([])
    expect(result.warning).toBeUndefined()
  })
})
