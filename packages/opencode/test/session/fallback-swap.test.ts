import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { FallbackSwap } from "../../src/session/fallback-swap"
import { Fallback } from "../../src/session/fallback"

// The wiring between the paradigm's declaration and the retry seam.
//
// `Agent.Info.options` is Record<string, unknown> with no schema behind it and
// is a surface a user can hand-edit, so everything read out of it is treated as
// hostile. The stakes are specific: this code runs inside a 429 handler, where
// a thrown exception would turn a degraded model into a dead session.

describe("FallbackSwap.readDeclaration", () => {
  test("reads a well-formed declaration", () => {
    expect(
      FallbackSwap.readDeclaration({
        needs: { minOutput: 100_000, tools: true },
        fallback: ["opencode/hy3-free"],
      }),
    ).toEqual({ auto: true, needs: { minOutput: 100_000, tools: true }, fallback: ["opencode/hy3-free"] })
  })

  test("treats an absent bag as an undeclared head rather than an error", () => {
    expect(FallbackSwap.readDeclaration(undefined)).toEqual({ auto: true })
    expect(FallbackSwap.readDeclaration(null)).toEqual({ auto: true })
    expect(FallbackSwap.readDeclaration("nonsense")).toEqual({ auto: true })
    expect(FallbackSwap.readDeclaration([])).toEqual({ auto: true })
  })

  // Dropping to undefined is what sends the caller to the derived failsafe,
  // which is the right outcome - better than throwing, and better than
  // handing the resolver a chain full of holes.
  test("ignores a malformed chain instead of throwing or half-reading it", () => {
    expect(FallbackSwap.readDeclaration({ fallback: "opencode/hy3-free" }).fallback).toBeUndefined()
    expect(FallbackSwap.readDeclaration({ fallback: [123] }).fallback).toBeUndefined()
    expect(FallbackSwap.readDeclaration({ fallback: ["ok", ""] }).fallback).toBeUndefined()
  })

  test("keeps the readable half of a partly malformed needs", () => {
    const declared = FallbackSwap.readDeclaration({ needs: { minOutput: -5, tools: true } })
    expect(declared.needs).toEqual({ tools: true })
  })

  test("drops a needs with nothing readable in it", () => {
    expect(FallbackSwap.readDeclaration({ needs: { minOutput: "lots" } }).needs).toBeUndefined()
    expect(FallbackSwap.readDeclaration({ needs: 7 }).needs).toBeUndefined()
  })

  test("honours an explicit shiftAuto:false", () => {
    expect(FallbackSwap.readDeclaration({ shiftAuto: false }).auto).toBe(false)
  })

  // Auto defaults ON even on garbage. The failsafe exists to degrade rather
  // than wall, so a corrupted bag must not become a back door that silently
  // disables it.
  test("defaults auto to on for anything that is not exactly false", () => {
    expect(FallbackSwap.readDeclaration({}).auto).toBe(true)
    expect(FallbackSwap.readDeclaration({ shiftAuto: "no" }).auto).toBe(true)
    expect(FallbackSwap.readDeclaration({ shiftAuto: 0 }).auto).toBe(true)
  })
})

describe("FallbackSwap.resetsAt", () => {
  // F3/F4: Zen's daily counter is keyed on a UTC date and no header ever
  // reaches the client, so the reset time is arithmetic rather than a reading.
  test("lands on the next UTC midnight", () => {
    const noon = Date.UTC(2026, 7, 20, 12, 30, 15, 500)
    expect(FallbackSwap.resetsAt(noon).toISOString()).toBe("2026-08-21T00:00:00.000Z")
  })

  test("moves to the following day rather than returning the moment itself", () => {
    const midnight = Date.UTC(2026, 7, 20, 0, 0, 0, 0)
    expect(FallbackSwap.resetsAt(midnight).toISOString()).toBe("2026-08-21T00:00:00.000Z")
  })
})

describe("FallbackSwap.terminalMessage", () => {
  const noon = Date.UTC(2026, 7, 20, 12, 0, 0, 0)

  test("names the head, what was tried, and when the wall lifts", () => {
    const message = FallbackSwap.terminalMessage("king", 2, noon)
    expect(message).toContain("king")
    expect(message).toContain("2 substitutes tried")
    expect(message).toContain("00:00 UTC")
    expect(message).toContain("12h")
  })

  test("says so plainly when there was nothing to try", () => {
    expect(FallbackSwap.terminalMessage("scout", 0, noon)).toContain("no usable substitute found")
  })

  test("does not pluralise a single attempt", () => {
    expect(FallbackSwap.terminalMessage("king", 1, noon)).toContain("1 substitute tried")
  })

  // Never promise a reset "in 0h" - just under the wire still reads as an hour.
  test("never reports less than an hour", () => {
    const almost = Date.UTC(2026, 7, 20, 23, 59, 0, 0)
    expect(FallbackSwap.terminalMessage("king", 1, almost)).toContain("about 1h")
  })
})

// ---------------------------------------------------------------------------
// The hook itself, driven with fakes. This is as close to end to end as it can
// get without a real 429, which cannot be forced on demand (F4: the 429 is the
// only signal Zen ever sends, and there is no way to ask for one).
//
// The services are cast fakes on purpose - the point is the hook's own logic:
// the eligibility gate, reading the declaration, resolving, mutating
// streamInput, and remembering what it burned.

function model(ref: string, over: Record<string, unknown> = {}) {
  const [providerID, id] = ref.split("/") as [string, string]
  return {
    id,
    providerID,
    name: id,
    limit: { context: 200_000, output: 128_000 },
    capabilities: { toolcall: true, attachment: false },
    cost: { input: 0, output: 0 },
    ...over,
  }
}

function harness(opts: {
  options?: Record<string, unknown>
  catalog?: ReturnType<typeof model>[]
  from?: string
}) {
  const published: any[] = []
  const streamInput = { model: model(opts.from ?? "opencode/deepseek-v4-flash-free") as any }
  const catalog = opts.catalog ?? [model("opencode/nemotron-3.5-lightning-free")]
  const models: Record<string, any> = {}
  for (const m of catalog) {
    models[m.providerID] = models[m.providerID] ?? { models: {} }
    models[m.providerID].models[m.id] = m
  }

  const hook = FallbackSwap.hook({
    sessionID: ("ses_" + Math.random().toString(36).slice(2)) as any,
    agentName: "king",
    streamInput,
    agents: { get: () => Effect.succeed({ options: opts.options ?? {} }) } as any,
    provider: { list: () => Effect.succeed(models) } as any,
    events: { publish: (_def: unknown, data: unknown) => Effect.sync(() => void published.push(data)) } as any,
  })

  return { hook, streamInput, published }
}

const wall = { reason: "free_tier_limit" as const, attempt: 1, error: {} as any }

describe("FallbackSwap.hook", () => {
  test("declines anything that is not a wall, so a 503 never swaps a model", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook({ ...wall, reason: undefined }))
    expect(out).toBeUndefined()
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
  })

  test("derives a substitute for an undeclared head and installs it", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook(wall))
    expect(out?.swapped).toBe(true)
    // F2: the next attempt reads this object.
    expect(streamInput.model.id).toBe("nemotron-3.5-lightning-free")
  })

  test("publishes ModelSwitched so the swap outlives the retry", async () => {
    const { hook, published } = harness({})
    await Effect.runPromise(hook(wall))
    expect(published).toHaveLength(1)
    expect(published[0].model).toEqual({ id: "nemotron-3.5-lightning-free", providerID: "opencode" })
  })

  test("prefers what the head declared over what it would have derived", async () => {
    const { hook, streamInput } = harness({
      options: { fallback: ["opencode/hy3-free"] },
      catalog: [model("opencode/hy3-free"), model("opencode/nemotron-3.5-lightning-free")],
    })
    await Effect.runPromise(hook(wall))
    expect(streamInput.model.id).toBe("hy3-free")
  })

  test("stands aside entirely when the paradigm turned auto off", async () => {
    const { hook, streamInput, published } = harness({ options: { shiftAuto: false } })
    expect(await Effect.runPromise(hook(wall))).toBeUndefined()
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
    expect(published).toHaveLength(0)
  })

  test("walks to a new model each time rather than re-offering a burned one", async () => {
    const { hook, streamInput } = harness({
      catalog: [model("opencode/a"), model("opencode/b")],
    })
    await Effect.runPromise(hook(wall))
    const first = streamInput.model.id
    await Effect.runPromise(hook({ ...wall, attempt: 2 }))
    expect(streamInput.model.id).not.toBe(first)
  })

  test("gives a terminal message, not an upsell, when nothing can serve", async () => {
    const { hook, streamInput, published } = harness({ catalog: [] })
    const out = await Effect.runPromise(hook(wall))
    expect(out?.swapped).toBe(false)
    expect(out?.message).toContain("00:00 UTC")
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
    expect(published).toHaveLength(0)
  })

  test("stops swapping once the session has spent its cap", async () => {
    const { hook, streamInput } = harness({
      catalog: [model("opencode/a"), model("opencode/b"), model("opencode/c"), model("opencode/d")],
    })
    for (let i = 0; i < Fallback.SWAP_CAP; i++) await Effect.runPromise(hook({ ...wall, attempt: i + 1 }))
    const settled = streamInput.model.id
    const out = await Effect.runPromise(hook({ ...wall, attempt: 9 }))
    expect(out?.swapped).toBe(false)
    expect(streamInput.model.id).toBe(settled)
  })
})
