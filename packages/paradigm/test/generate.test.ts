import { describe, expect, test } from "bun:test"
import { generateDraft, degradationNotice, type PromptFn, type Attempt } from "../src/generate"

const team = {
  name: "tiktok-shop",
  description: "Writes short-form video scripts and checks the numbers.",
  shape: "court",
  heads: [{ role: "warrior", purpose: "write the scripts" }],
  routing: [],
  discipline: {},
}

/** Answers with `structured` for the listed models, nothing for the rest. */
function transport(canDoIt: Array<string | undefined>, payload: unknown = team): {
  prompt: PromptFn
  asked: Array<string | undefined>
} {
  const asked: Array<string | undefined> = []
  const prompt: PromptFn = async ({ model }) => {
    asked.push(model)
    if (canDoIt.includes(model)) return { structured: payload }
    return { errorName: "StructuredOutputError" }
  }
  return { prompt, asked }
}

describe("generateDraft", () => {
  test("asks the king first, by omitting the model override", async () => {
    const { prompt, asked } = transport([undefined])
    const result = await generateDraft({ goal: "g", existing: [], fallbacks: ["a/b"], prompt })
    expect(result.ok).toBe(true)
    expect(asked).toEqual([undefined])
  })

  test("degrades to a fallback when the king cannot do structured output", async () => {
    // This is the measured 2026-08-27 case: nemotron-3-ultra-free emits the
    // tool call as text, hy3-free calls the tool properly.
    const { prompt, asked } = transport(["opencode/hy3-free"])
    const result = await generateDraft({
      goal: "g",
      existing: [],
      fallbacks: ["opencode/hy3-free"],
      prompt,
    })
    expect(result.ok).toBe(true)
    expect(asked).toEqual([undefined, "opencode/hy3-free"])
    if (result.ok) expect(result.attempts.map((a) => a.outcome)).toEqual(["no-structured-output", "ok"])
  })

  test("walks the fallback list in order and stops at the first that works", async () => {
    const { prompt, asked } = transport(["c/3"])
    const result = await generateDraft({
      goal: "g",
      existing: [],
      fallbacks: ["a/1", "b/2", "c/3"],
      prompt,
      maxAttempts: 9,
    })
    expect(result.ok).toBe(true)
    expect(asked).toEqual([undefined, "a/1", "b/2", "c/3"])
  })

  test("bounds a bad day - never more calls than maxAttempts", async () => {
    const { prompt, asked } = transport([])
    const result = await generateDraft({
      goal: "g",
      existing: [],
      fallbacks: ["a/1", "b/2", "c/3", "d/4", "e/5"],
      prompt,
      maxAttempts: 3,
    })
    expect(result.ok).toBe(false)
    expect(asked).toHaveLength(3)
  })

  test("reports every model that refused, so the failure names names", async () => {
    const { prompt } = transport([])
    const result = await generateDraft({
      goal: "g",
      existing: [],
      fallbacks: ["a/1"],
      prompt,
      maxAttempts: 2,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("the active king")
      expect(result.errors.join(" ")).toContain("a/1")
    }
  })

  test("a thrown transport error is an attempt, not a crash", async () => {
    const prompt: PromptFn = async ({ model }) => {
      if (model === undefined) throw new Error("connection refused")
      return { structured: team }
    }
    const result = await generateDraft({ goal: "g", existing: [], fallbacks: ["a/1"], prompt })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.attempts[0]!.outcome).toBe("failed")
      expect(result.attempts[0]!.detail).toContain("connection refused")
    }
  })

  test("a schema violation stops the search - a second opinion is the same opinion", async () => {
    const { prompt, asked } = transport([undefined, "a/1"], { nonsense: true })
    const result = await generateDraft({ goal: "g", existing: [], fallbacks: ["a/1"], prompt })
    expect(result.ok).toBe(false)
    // Only the king was asked: shopping a rejected shape around wastes 30s a go.
    expect(asked).toEqual([undefined])
    if (!result.ok) expect(result.attempts[0]!.outcome).toBe("rejected")
  })

  test("passes the goal and the taken names through to the transport", async () => {
    let seen = { system: "", text: "" }
    const prompt: PromptFn = async ({ system, text }) => {
      seen = { system, text }
      return { structured: team }
    }
    await generateDraft({ goal: "sell bras on tiktok", existing: ["gryphon"], fallbacks: [], prompt })
    expect(seen.text).toContain("sell bras on tiktok")
    expect(seen.text).toContain("gryphon")
    expect(seen.system).toContain("king")
  })

  test("carries the sanitised name out, not the raw one", async () => {
    const { prompt } = transport([undefined], { ...team, name: "BraTok Court" })
    const result = await generateDraft({ goal: "g", existing: [], fallbacks: [], prompt })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.generated.name).toBe("bratok-court")
  })
})

describe("degradationNotice", () => {
  test("says nothing when the king answered - that is the normal path", () => {
    const attempts: Attempt[] = [{ outcome: "ok" }]
    expect(degradationNotice(attempts)).toBeUndefined()
  })

  test("names who refused and who answered", () => {
    const attempts: Attempt[] = [
      { outcome: "no-structured-output", detail: "StructuredOutputError" },
      { model: "opencode/hy3-free", outcome: "ok" },
    ]
    const notice = degradationNotice(attempts)
    expect(notice).toContain("the active king")
    expect(notice).toContain("opencode/hy3-free")
  })

  test("says nothing when nothing worked - the failure path speaks for itself", () => {
    const attempts: Attempt[] = [{ outcome: "no-structured-output" }]
    expect(degradationNotice(attempts)).toBeUndefined()
  })
})
