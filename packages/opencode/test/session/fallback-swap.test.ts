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
    // Everything this fake registry holds is reachable - credentials are a
    // separate concern with its own describe block below.
    catalog: { model: { available: () => Effect.succeed(catalog.map((m) => ({ id: m.id, providerID: m.providerID }))) } } as any,
    events: {
      publish: (def: any, data: any) => Effect.sync(() => void published.push({ type: def?.type, ...data })),
    } as any,
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

  test("does not swap when the paradigm turned auto off", async () => {
    const { hook, streamInput } = harness({ options: { shiftAuto: false } })
    const out = await Effect.runPromise(hook(wall))
    expect(out?.swapped).toBe(false)
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
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

// The retirement path. This is the failure that actually happens: measured
// twice on 2026-08-20 alone, while the 429 the feature was designed around has
// never once been observed. It cannot ride the retry policy, because
// ProviderModelNotFoundError is not retryable and dies before any retry
// decision exists - hence a second entry point on the same machinery.
describe("FallbackSwap.rescueRetired", () => {
  function rescue(opts: { options?: Record<string, unknown>; catalog?: ReturnType<typeof model>[] }) {
    const published: any[] = []
    const catalog = opts.catalog ?? [model("opencode/hy3-free")]
    const models: Record<string, any> = {}
    for (const m of catalog) {
      models[m.providerID] = models[m.providerID] ?? { models: {} }
      models[m.providerID].models[m.id] = m
    }
    return {
      published,
      run: () =>
        Effect.runPromise(
          FallbackSwap.rescueRetired({
            sessionID: ("ses_" + Math.random().toString(36).slice(2)) as any,
            agentName: "scout",
            failed: { id: "laguna-s-2.1-free", providerID: "opencode" },
            agents: { get: () => Effect.succeed({ options: opts.options ?? {} }) } as any,
            provider: { list: () => Effect.succeed(models) } as any,
            catalog: { model: { available: () => Effect.succeed(catalog.map((m) => ({ id: m.id, providerID: m.providerID }))) } } as any,
            events: {
              publish: (def: any, data: any) => Effect.sync(() => void published.push({ type: def?.type, ...data })),
            } as any,
          }),
        ),
    }
  }

  test("returns a live substitute for a model that no longer exists", async () => {
    const { run } = rescue({})
    const rescued = await run()
    expect(String(rescued?.id)).toBe("hy3-free")
  })

  test("makes the rescue durable so the loop does not re-resolve the dead model", async () => {
    const { run, published } = rescue({})
    await run()
    expect(published).toHaveLength(1)
    expect(published[0].model.id).toBe("hy3-free")
  })

  test("returns undefined when nothing can replace it, leaving the caller to die", async () => {
    const { run, published } = rescue({ catalog: [] })
    expect(await run()).toBeUndefined()
    expect(published).toHaveLength(0)
  })

  test("respects a head that asked to be consulted instead of degraded", async () => {
    const { run } = rescue({ options: { shiftAuto: false } })
    expect(await run()).toBeUndefined()
  })

  test("honours the head's needs when rescuing, not just any live model", async () => {
    const { run } = rescue({
      options: { needs: { attachment: true } },
      catalog: [model("opencode/blind"), model("opencode/seeing", { capabilities: { toolcall: true, attachment: true } })],
    })
    expect(String((await run())?.id)).toBe("seeing")
  })
})

describe("FallbackSwap.terminalMessage for a retirement", () => {
  // "The limit resets at 00:00 UTC" would be a plain lie about a retired
  // model - the user would wait for something that is never coming back.
  test("does not promise a reset that will never come", () => {
    const message = FallbackSwap.terminalMessage("scout", 1, Date.now(), "model_gone")
    expect(message).toContain("no longer exists")
    expect(message).toContain("Rebind")
    expect(message).not.toContain("resets")
  })
})

// A model that simply does not work, with no reason anyone can parse.
// Measured 2026-08-20: zhipuai-coding-plan/glm-4.7 answers every request with
// 余额不足或无可用资源包 (no balance). Upstream calls that retryable, so it
// burned six attempts across 74 seconds and died. Counting repeats catches it
// without needing to understand a word of it.
describe("FallbackSwap.hook on a model that just keeps failing", () => {
  const noReason = { reason: undefined, error: {} as any }

  test("gives an unexplained failure real retries before giving up on it", async () => {
    const { hook, streamInput } = harness({})
    expect(await Effect.runPromise(hook({ ...noReason, attempt: 1 }))).toBeUndefined()
    expect(await Effect.runPromise(hook({ ...noReason, attempt: 2 }))).toBeUndefined()
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
  })

  test("swaps once the retries have clearly stopped helping", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook({ ...noReason, attempt: 3 }))
    expect(out?.swapped).toBe(true)
    expect(streamInput.model.id).toBe("nemotron-3.5-lightning-free")
  })

  // One model failing is a MODEL problem. Writing off its provider here would
  // discard the other six Zen models over a single blip.
  test("keeps trusting the provider after a single model fails", async () => {
    const { hook, streamInput } = harness({
      from: "zhipuai-coding-plan/glm-4.7",
      catalog: [model("zhipuai-coding-plan/glm-5.2"), model("opencode/hy3-free")],
    })
    await Effect.runPromise(hook({ ...noReason, attempt: 3 }))
    expect(streamInput.model.providerID).toBe("zhipuai-coding-plan")
    expect(streamInput.model.id).toBe("glm-5.2")
  })

  // Two different models failing the same way is a PROVIDER problem - which is
  // exactly what no balance and a bad key look like from here.
  test("writes the provider off once a second of its models fails the same way", async () => {
    const { hook, streamInput } = harness({
      from: "zhipuai-coding-plan/glm-4.7",
      catalog: [
        model("zhipuai-coding-plan/glm-5.2"),
        model("zhipuai-coding-plan/glm-5.3"),
        model("opencode/hy3-free"),
      ],
    })
    await Effect.runPromise(hook({ ...noReason, attempt: 3 }))
    expect(streamInput.model.providerID).toBe("zhipuai-coding-plan")
    await Effect.runPromise(hook({ ...noReason, attempt: 4 }))
    expect(streamInput.model.providerID).toBe("opencode")
  })

  // A wall is self-identifying, so it must not have to fail three times first.
  test("still swaps a declared wall on the very first attempt", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook({ reason: "free_tier_limit", attempt: 1, error: {} as any }))
    expect(out?.swapped).toBe(true)
    expect(streamInput.model.id).toBe("nemotron-3.5-lightning-free")
  })

  // A rate limit is about the wall, not the account - writing off the whole
  // provider there would throw away every other model on it for no reason.
  test("does not write off a provider merely for rate-limiting us", async () => {
    const { hook, streamInput } = harness({
      from: "opencode/deepseek-v4-flash-free",
      catalog: [model("opencode/hy3-free")],
    })
    const out = await Effect.runPromise(hook({ reason: "free_tier_limit", attempt: 1, error: {} as any }))
    expect(out?.swapped).toBe(true)
    expect(streamInput.model.providerID).toBe("opencode")
  })
})

// auto:false is the paradigm-shift path: do not degrade behind the user's back,
// ask instead. The trigger needs no new event type - `tui.command.execute`
// accepts any command string and the TUI dispatches it by name against the
// keymap, which is where the paradigm plugin registers its picker.
describe("FallbackSwap paradigm-shift path (auto: false)", () => {
  const off = { options: { shiftAuto: false } }

  test("opens the picker rather than choosing for the user", async () => {
    const { hook, published } = harness(off)
    await Effect.runPromise(hook(wall))
    const command = published.find((e) => e.type === "tui.command.execute")
    expect(command?.command).toBe("paradigm.list")
  })

  test("explains what happened instead of leaving the upsell to speak", async () => {
    const { hook, published } = harness(off)
    const out = await Effect.runPromise(hook(wall))
    const toast = published.find((e) => e.type === "tui.toast.show")
    expect(toast?.message).toContain("free-tier")
    // An outcome at all is what suppresses upstream's Go upsell action.
    expect(out).toBeDefined()
    expect(out?.swapped).toBe(false)
  })

  // The config hook fires once at boot, so a paradigm chosen now cannot apply
  // to the session that asked. Saying otherwise would be the exact dishonesty
  // the picker's own status row already refuses.
  test("says plainly that the switch only applies on restart", async () => {
    const { hook } = harness(off)
    const out = await Effect.runPromise(hook(wall))
    expect(out?.message).toContain("restart")
  })

  test("never swaps the model on this path", async () => {
    const { hook, streamInput, published } = harness(off)
    await Effect.runPromise(hook(wall))
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
    expect(published.find((e) => e.type === "session.next.model.switched")).toBeUndefined()
  })

  // The retry loop calls the hook on every attempt. Offering six times in
  // ninety seconds would be worse than not offering at all.
  test("offers once per session, not once per retry", async () => {
    const { hook, published } = harness(off)
    for (const attempt of [1, 2, 3, 4]) await Effect.runPromise(hook({ ...wall, attempt }))
    expect(published.filter((e) => e.type === "tui.command.execute")).toHaveLength(1)
  })

  test("offers the shift for a retirement too, where no swap is possible", async () => {
    const published: any[] = []
    await Effect.runPromise(
      FallbackSwap.rescueRetired({
        sessionID: ("ses_" + Math.random().toString(36).slice(2)) as any,
        agentName: "scout",
        failed: { id: "laguna-s-2.1-free", providerID: "opencode" },
        agents: { get: () => Effect.succeed({ options: { shiftAuto: false } }) } as any,
        provider: { list: () => Effect.succeed({}) } as any,
        catalog: { model: { available: () => Effect.succeed([]) } } as any,
        events: {
          publish: (def: any, data: any) => Effect.sync(() => void published.push({ type: def?.type, ...data })),
        } as any,
      }),
    )
    expect(published.find((e) => e.type === "tui.command.execute")?.command).toBe("paradigm.list")
    expect(published.find((e) => e.type === "tui.toast.show")?.message).toContain("no longer exists")
  })
})

// Credentials are a THIRD filter, separate from price and capability.
//
// provider.list() returns every provider opencode.json DECLARES, key or no key.
// Measured 2026-08-20: ANTHROPIC_API_KEY was unset and 17 anthropic models were
// still in that list. They were harmless only because they are paid, so
// isFree() dropped them - a declared provider whose models are FREE-priced
// would have been picked and would have failed on the first request.
//
// No local field distinguishes the two cases: Zen has neither `key` nor
// options.apiKey and works (it authenticates through an account integration),
// while anthropic looks identical and does not. Only CatalogV2's available()
// composes credentials and integrations, which is why it is the source of truth
// here - the same lesson the Craft wizard learned in ed99da81.
describe("FallbackSwap credential filtering", () => {
  function withCatalog(opts: {
    catalog: ReturnType<typeof model>[]
    credentialed: Array<{ providerID: string; id: string }>
  }) {
    const streamInput = { model: model("opencode/deepseek-v4-flash-free") as any }
    const models: Record<string, any> = {}
    for (const m of opts.catalog) {
      models[m.providerID] = models[m.providerID] ?? { models: {} }
      models[m.providerID].models[m.id] = m
    }
    const hook = FallbackSwap.hook({
      sessionID: ("ses_" + Math.random().toString(36).slice(2)) as any,
      agentName: "king",
      streamInput,
      agents: { get: () => Effect.succeed({ options: {} }) } as any,
      provider: { list: () => Effect.succeed(models) } as any,
      catalog: { model: { available: () => Effect.succeed(opts.credentialed) } } as any,
      events: { publish: () => Effect.succeed(undefined) } as any,
    })
    return { hook, streamInput }
  }

  test("will not degrade onto a provider that has no credentials", async () => {
    const { hook, streamInput } = withCatalog({
      catalog: [model("nvidia/free-but-keyless"), model("opencode/hy3-free")],
      credentialed: [{ providerID: "opencode", id: "hy3-free" }],
    })
    await Effect.runPromise(hook(wall))
    expect(streamInput.model.providerID).toBe("opencode")
    expect(streamInput.model.id).toBe("hy3-free")
  })

  test("gives up rather than picking an unreachable model", async () => {
    const { hook, streamInput } = withCatalog({
      catalog: [model("nvidia/free-but-keyless")],
      credentialed: [],
    })
    const out = await Effect.runPromise(hook(wall))
    expect(out?.swapped).toBe(false)
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
  })

  // The catalog call can fail on a half-built instance. Failing open keeps the
  // old behaviour rather than disabling the fallback entirely - a wrong pick is
  // recoverable, a fallback that never fires is not.
  test("falls back to the unfiltered list when credentials cannot be checked", async () => {
    const streamInput = { model: model("opencode/deepseek-v4-flash-free") as any }
    const hook = FallbackSwap.hook({
      sessionID: ("ses_" + Math.random().toString(36).slice(2)) as any,
      agentName: "king",
      streamInput,
      agents: { get: () => Effect.succeed({ options: {} }) } as any,
      provider: {
        list: () => Effect.succeed({ opencode: { models: { "hy3-free": model("opencode/hy3-free") } } }),
      } as any,
      catalog: { model: { available: () => Effect.die("catalog unavailable") } } as any,
      events: { publish: () => Effect.succeed(undefined) } as any,
    })
    await Effect.runPromise(hook(wall))
    expect(streamInput.model.id).toBe("hy3-free")
  })
})

// ---------------------------------------------------------------------------
// A stream that went SILENT is not the same failure as a stream that refused.
//
// Measured 2026-08-23 against Zen: `nemotron-3-ultra-free` returned
// `[504] Upstream idle timeout exceeded` after ~123 seconds having produced
// zero tokens, twice in one session. Upstream classes that with every other
// 5xx, so it retried the same model at ~2 minutes of dead air per attempt.
// PERSIST_AFTER would only have moved on the third failure of a single turn.
// The user cancelled first, which is the honest measure of the budget.
//
// The signal is duration, not zero output: a 503 back in 200ms has produced
// nothing either and genuinely deserves its retries.
describe("FallbackSwap.hook on a stream that went silent", () => {
  const dead = { reason: undefined, attempt: 1, error: {} as any }

  test("swaps on the first failure when the model was silent for minutes", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook({ ...dead, silentMs: 123_000 }))
    expect(out?.swapped).toBe(true)
    expect(streamInput.model.id).toBe("nemotron-3.5-lightning-free")
  })

  // The 503-in-200ms case. Nothing produced, but nothing stalled either.
  test("leaves a fast failure on its honest retries", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook({ ...dead, silentMs: 200 }))
    expect(out).toBeUndefined()
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
  })

  test("leaves a stream that produced output alone", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook({ ...dead, silentMs: 0 }))
    expect(out).toBeUndefined()
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
  })

  // A build that cannot report silence must behave exactly as before.
  test("unknown silence changes nothing", async () => {
    const { hook, streamInput } = harness({})
    const out = await Effect.runPromise(hook(dead))
    expect(out).toBeUndefined()
    expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
  })
})

// A stalled model has NOT retired. Saying it has is the same class of lie the
// reset-time wording already refuses to tell: the user would go rebind a
// binding that was never wrong, when the model is merely too slow right now.
describe("FallbackSwap wording for a stall", () => {
  test("the shift message does not claim a stalled model is gone", () => {
    const m = FallbackSwap.shiftMessage("king", "stalled")
    expect(m).not.toContain("no longer exists")
    expect(m).toContain("stopped responding")
  })

  test("the terminal message does not claim a stalled model is gone", () => {
    const m = FallbackSwap.terminalMessage("king", 0, Date.UTC(2026, 7, 25, 12, 0, 0), "stalled")
    expect(m).not.toContain("no longer exists")
    expect(m).toContain("stopped responding")
  })

  // A stall says nothing about the provider's credentials, so it must not
  // report a free-tier reset time either.
  test("the terminal message does not promise a reset for a stall", () => {
    const m = FallbackSwap.terminalMessage("king", 0, Date.UTC(2026, 7, 25, 12, 0, 0), "stalled")
    expect(m).not.toContain("00:00 UTC")
  })

  test("a stall with no substitute reports the stall rather than a retirement", async () => {
    const { hook } = harness({ catalog: [] })
    const out = await Effect.runPromise(
      hook({ reason: undefined, attempt: 1, error: {} as any, silentMs: 123_000 }),
    )
    expect(out?.swapped).toBe(false)
    expect(out?.message).not.toContain("no longer exists")
    expect(out?.message).toContain("stopped responding")
  })
})

// The threshold has to be forceable, for the same reason the plugin seam's
// budget is: the real failure takes ~123s to arrive, which is far too slow to
// sit inside a test and awkward to reproduce live on demand.
describe("FallbackSwap stall threshold override", () => {
  function withEnv(value: string | undefined, fn: () => Promise<void>) {
    const prev = process.env["VANGIO_STALL_AFTER_MS"]
    if (value === undefined) delete process.env["VANGIO_STALL_AFTER_MS"]
    else process.env["VANGIO_STALL_AFTER_MS"] = value
    return fn().finally(() => {
      if (prev === undefined) delete process.env["VANGIO_STALL_AFTER_MS"]
      else process.env["VANGIO_STALL_AFTER_MS"] = prev
    })
  }

  test("a lowered budget makes a short silence count as a stall", () =>
    withEnv("50", async () => {
      const { hook, streamInput } = harness({})
      // 200ms is nowhere near the 30s default, so this can only pass if the
      // override is being read.
      const out = await Effect.runPromise(
        hook({ reason: undefined, attempt: 1, error: {} as any, silentMs: 200 }),
      )
      expect(out?.swapped).toBe(true)
      expect(streamInput.model.id).toBe("nemotron-3.5-lightning-free")
    }))

  test("a junk value falls back to the shipped budget", () =>
    withEnv("not-a-number", async () => {
      const { hook, streamInput } = harness({})
      const out = await Effect.runPromise(
        hook({ reason: undefined, attempt: 1, error: {} as any, silentMs: 200 }),
      )
      expect(out).toBeUndefined()
      expect(streamInput.model.id).toBe("deepseek-v4-flash-free")
    }))
})
