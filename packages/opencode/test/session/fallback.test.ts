import { describe, expect, test } from "bun:test"
import { Fallback } from "../../src/session/fallback"

// StaticResolver, stage one of docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md.
//
// The decision is deliberately pure and takes a synchronous `lookup`, so the
// whole of it can be tested against a fake registry. The Effect adapter that
// reaches the real provider registry is the seam's problem, not this file's.

type Fake = Fallback.Judgeable & { name: string }

function model(ref: string, over: Partial<Fallback.Judgeable> = {}): Fake {
  const [providerID, id] = ref.split("/") as [string, string]
  return {
    id,
    providerID,
    name: id,
    limit: { output: 128_000 },
    capabilities: { toolcall: true, attachment: false },
    ...over,
  }
}

/** A registry holding exactly the models it is given, and nothing else. */
function registry(...models: Fake[]) {
  const byRef = new Map(models.map((m) => [m.providerID + "/" + m.id, m]))
  return (providerID: string, modelID: string) => byRef.get(providerID + "/" + modelID)
}

const failed = model("opencode/deepseek-v4-flash-free")

function attempt(over: Partial<Parameters<typeof Fallback.resolveStatic<Fake>>[0]> = {}) {
  return Fallback.resolveStatic<Fake>({
    head: "king",
    failed,
    reason: "free_tier_limit",
    chain: [],
    exhausted: new Set<string>(),
    swapsUsed: 0,
    lookup: registry(),
    ...over,
  })
}

describe("Fallback.splitRef", () => {
  test("splits a provider-qualified id", () => {
    expect(Fallback.splitRef("opencode/hy3-free")).toEqual({ providerID: "opencode", modelID: "hy3-free" })
  })

  // Model ids contain dots and dashes but the provider half never contains a
  // slash, so only the FIRST slash separates - "zhipuai-coding-plan/glm-5.3".
  test("splits on the first slash only", () => {
    expect(Fallback.splitRef("a/b/c")).toEqual({ providerID: "a", modelID: "b/c" })
  })

  test("rejects anything that is not provider/model", () => {
    expect(Fallback.splitRef("hy3-free")).toBeUndefined()
    expect(Fallback.splitRef("/hy3-free")).toBeUndefined()
    expect(Fallback.splitRef("opencode/")).toBeUndefined()
    expect(Fallback.splitRef("")).toBeUndefined()
  })
})

describe("Fallback.resolveStatic", () => {
  test("returns nothing for a head that declares no chain", () => {
    expect(attempt({ chain: [] }).resolution).toBeUndefined()
  })

  test("returns the first entry that resolves", () => {
    const lightning = model("opencode/nemotron-3.5-lightning-free")
    const ultra = model("opencode/nemotron-3-ultra-free")
    const out = attempt({
      chain: ["opencode/nemotron-3.5-lightning-free", "opencode/nemotron-3-ultra-free"],
      lookup: registry(lightning, ultra),
    })
    expect(out.resolution?.model.id).toBe("nemotron-3.5-lightning-free")
    expect(out.resolution?.source).toBe("static")
  })

  test("walks the chain in declared order, not registry order", () => {
    const lightning = model("opencode/nemotron-3.5-lightning-free")
    const ultra = model("opencode/nemotron-3-ultra-free")
    const out = attempt({
      chain: ["opencode/nemotron-3-ultra-free", "opencode/nemotron-3.5-lightning-free"],
      lookup: registry(lightning, ultra),
    })
    expect(out.resolution?.model.id).toBe("nemotron-3-ultra-free")
  })

  test("skips a model already burned this session and takes the next", () => {
    const lightning = model("opencode/nemotron-3.5-lightning-free")
    const ultra = model("opencode/nemotron-3-ultra-free")
    const out = attempt({
      chain: ["opencode/nemotron-3.5-lightning-free", "opencode/nemotron-3-ultra-free"],
      exhausted: new Set(["opencode/nemotron-3.5-lightning-free"]),
      lookup: registry(lightning, ultra),
    })
    expect(out.resolution?.model.id).toBe("nemotron-3-ultra-free")
    expect(out.skipped).toContainEqual({ entry: "opencode/nemotron-3.5-lightning-free", why: "exhausted" })
  })

  // F6, sharpened by the 2026-08-20 finding: a retired OR deprecated model is
  // simply absent from the registry. Skipping has to be visible, because an
  // invisible skip is how a chain quietly becomes shorter than it looks.
  test("skips an entry the registry cannot resolve and records why", () => {
    const ultra = model("opencode/nemotron-3-ultra-free")
    const out = attempt({
      chain: ["opencode/kimi-k2.5-free", "opencode/nemotron-3-ultra-free"],
      lookup: registry(ultra),
    })
    expect(out.resolution?.model.id).toBe("nemotron-3-ultra-free")
    expect(out.skipped).toContainEqual({ entry: "opencode/kimi-k2.5-free", why: "unresolvable" })
  })

  test("skips a malformed chain entry rather than resolving nonsense", () => {
    const ultra = model("opencode/nemotron-3-ultra-free")
    const out = attempt({ chain: ["nemotron-3-ultra-free", "opencode/nemotron-3-ultra-free"], lookup: registry(ultra) })
    expect(out.resolution?.model.id).toBe("nemotron-3-ultra-free")
    expect(out.skipped).toContainEqual({ entry: "nemotron-3-ultra-free", why: "malformed" })
  })

  test("never offers the model that just died, even if the chain names it", () => {
    const out = attempt({
      chain: ["opencode/deepseek-v4-flash-free"],
      lookup: registry(failed),
    })
    expect(out.resolution).toBeUndefined()
    expect(out.skipped).toContainEqual({ entry: "opencode/deepseek-v4-flash-free", why: "exhausted" })
  })

  describe("needs", () => {
    test("skips a model whose output ceiling is below what the head needs", () => {
      const small = model("opencode/laguna-s-2.1-free", { limit: { output: 32_000 } })
      const big = model("opencode/nemotron-3.5-lightning-free", { limit: { output: 262_144 } })
      const out = attempt({
        chain: ["opencode/laguna-s-2.1-free", "opencode/nemotron-3.5-lightning-free"],
        needs: { minOutput: 100_000 },
        lookup: registry(small, big),
      })
      expect(out.resolution?.model.id).toBe("nemotron-3.5-lightning-free")
      expect(out.skipped).toContainEqual({ entry: "opencode/laguna-s-2.1-free", why: "needs" })
    })

    test("skips a model that cannot call tools when the head needs tools", () => {
      const blind = model("opencode/a", { capabilities: { toolcall: false, attachment: false } })
      const able = model("opencode/b")
      const out = attempt({ chain: ["opencode/a", "opencode/b"], needs: { tools: true }, lookup: registry(blind, able) })
      expect(out.resolution?.model.id).toBe("b")
    })

    test("skips a model that cannot see attachments when the head needs them", () => {
      const blind = model("opencode/a")
      const seer = model("opencode/b", { capabilities: { toolcall: true, attachment: true } })
      const out = attempt({
        chain: ["opencode/a", "opencode/b"],
        needs: { attachment: true },
        lookup: registry(blind, seer),
      })
      expect(out.resolution?.model.id).toBe("b")
    })

    // needs: { tools: false } states the head does not require tools. It must
    // not be read as "reject models that have them".
    test("treats a false need as no requirement rather than a prohibition", () => {
      const able = model("opencode/a")
      const out = attempt({ chain: ["opencode/a"], needs: { tools: false, attachment: false }, lookup: registry(able) })
      expect(out.resolution?.model.id).toBe("a")
    })
  })

  test("returns nothing when every entry is skipped, and reports all of them", () => {
    const small = model("opencode/laguna-s-2.1-free", { limit: { output: 32_000 } })
    const out = attempt({
      chain: ["opencode/gone", "opencode/laguna-s-2.1-free"],
      needs: { minOutput: 100_000 },
      lookup: registry(small),
    })
    expect(out.resolution).toBeUndefined()
    expect(out.skipped).toHaveLength(2)
  })

  // Loop protection. If Q1 resolves to "one shared Zen bucket", every entry in
  // a Zen-only chain 429s in turn, and without a cap this walks the whole chain
  // collecting 429s and their backoffs.
  describe("the swap cap", () => {
    test("stops resolving once the session has spent its swaps", () => {
      const ultra = model("opencode/nemotron-3-ultra-free")
      const out = attempt({
        chain: ["opencode/nemotron-3-ultra-free"],
        swapsUsed: Fallback.SWAP_CAP,
        lookup: registry(ultra),
      })
      expect(out.resolution).toBeUndefined()
      expect(out.capped).toBe(true)
    })

    test("still resolves on the last swap the cap allows", () => {
      const ultra = model("opencode/nemotron-3-ultra-free")
      const out = attempt({
        chain: ["opencode/nemotron-3-ultra-free"],
        swapsUsed: Fallback.SWAP_CAP - 1,
        lookup: registry(ultra),
      })
      expect(out.resolution?.model.id).toBe("nemotron-3-ultra-free")
      expect(out.capped).toBeFalsy()
    })
  })

  // The note is what the model-switched divider shows, so it has to say which
  // head degraded, away from what, toward what, and why.
  test("writes a note naming the head, both models and the reason", () => {
    const ultra = model("opencode/nemotron-3-ultra-free")
    const out = attempt({ chain: ["opencode/nemotron-3-ultra-free"], lookup: registry(ultra) })
    const note = out.resolution!.note
    expect(note).toContain("king")
    expect(note).toContain("deepseek-v4-flash-free")
    expect(note).toContain("nemotron-3-ultra-free")
    expect(note).toContain("free tier limit")
  })
})

// ---------------------------------------------------------------------------
// The failsafe. Decided 2026-08-20: when the declared chain yields nothing -
// never declared, silently lost, or walked to the end - VanGio does not give
// up and show a wall. It derives a substitute from what the registry actually
// holds. This is what makes the feature work at all right now, because not one
// of the six bundled presets declares a `fallback`.

const zen = (id: string, over: Partial<Fallback.Judgeable> = {}) => model("opencode/" + id, over)

function catalogue(...models: Fake[]) {
  return () => models
}

function resolve(over: Partial<Parameters<typeof Fallback.resolve<Fake>>[0]> = {}) {
  return Fallback.resolve<Fake>({
    head: "king",
    failed,
    reason: "free_tier_limit",
    chain: [],
    exhausted: new Set<string>(),
    swapsUsed: 0,
    lookup: registry(),
    catalog: catalogue(),
    ...over,
  })
}

describe("Fallback.resolve - declared first, derived as the failsafe", () => {
  test("prefers a working declared entry and never touches the catalog", () => {
    const declared = zen("nemotron-3-ultra-free")
    const other = zen("hy3-free")
    const out = resolve({
      chain: ["opencode/nemotron-3-ultra-free"],
      lookup: registry(declared),
      catalog: catalogue(other),
    })
    expect(out.resolution?.model.id).toBe("nemotron-3-ultra-free")
    expect(out.resolution?.source).toBe("static")
  })

  test("derives one when the head declares no chain at all", () => {
    const spare = zen("hy3-free")
    const out = resolve({ chain: [], catalog: catalogue(spare) })
    expect(out.resolution?.model.id).toBe("hy3-free")
    expect(out.resolution?.source).toBe("derived")
    expect(out.derivedBecause).toBe("undeclared")
  })

  // The clobber failsafe: a chain that silently vanished looks exactly like one
  // that was never written, and both must still degrade rather than wall.
  test("derives one when the chain is missing entirely", () => {
    const spare = zen("hy3-free")
    const out = resolve({ chain: undefined, catalog: catalogue(spare) })
    expect(out.resolution?.source).toBe("derived")
    expect(out.derivedBecause).toBe("undeclared")
  })

  test("derives one when every declared entry was skipped", () => {
    const spare = zen("hy3-free")
    const out = resolve({
      chain: ["opencode/kimi-k2.5-free"],
      lookup: registry(),
      catalog: catalogue(spare),
    })
    expect(out.resolution?.model.id).toBe("hy3-free")
    expect(out.derivedBecause).toBe("exhausted")
    // The declared skips are still reported - deriving must not hide staleness.
    expect(out.skipped).toContainEqual({ entry: "opencode/kimi-k2.5-free", why: "unresolvable" })
  })

  test("never derives the model that just died, nor anything already burned", () => {
    const burned = zen("hy3-free")
    const out = resolve({
      exhausted: new Set(["opencode/hy3-free"]),
      catalog: catalogue(failed as Fake, burned),
    })
    expect(out.resolution).toBeUndefined()
  })

  test("only derives models that meet what the head needs", () => {
    const small = zen("laguna-s-2.1-free", { limit: { output: 32_000 } })
    const big = zen("nemotron-3.5-lightning-free", { limit: { output: 262_144 } })
    const out = resolve({ needs: { minOutput: 100_000 }, catalog: catalogue(small, big) })
    expect(out.resolution?.model.id).toBe("nemotron-3.5-lightning-free")
  })

  // Global Constraint: fallback targets are free unless the user opts in.
  test("will not spend money on its own", () => {
    const paid = model("anthropic/claude-sonnet-5", { cost: { input: 3, output: 15 } })
    expect(resolve({ catalog: catalogue(paid) }).resolution).toBeUndefined()
    expect(resolve({ catalog: catalogue(paid), allowPaid: true }).resolution?.model.id).toBe("claude-sonnet-5")
  })

  // Matches resolve.isFree()'s existing reading elsewhere in the fork: absent
  // pricing is free, rather than a reason to crash or to refuse.
  test("reads a model with no published price as free", () => {
    const unpriced = zen("hy3-free")
    expect(resolve({ catalog: catalogue(unpriced) }).resolution?.model.id).toBe("hy3-free")
  })

  // F3/Q1: a Zen daily limit may be ONE bucket shared by every default-limit
  // free model, so the next Zen model can hit the same wall immediately.
  // Leaving the walled provider is the safer first move.
  test("prefers a different provider to the one that just hit a wall", () => {
    const sameProvider = zen("nemotron-3.5-lightning-free", { limit: { output: 262_144 } })
    const elsewhere = model("zhipu/glm-4.7-flash", { limit: { output: 131_072 } })
    const out = resolve({ catalog: catalogue(sameProvider, elsewhere) })
    expect(out.resolution?.model.providerID).toBe("zhipu")
  })

  test("falls back to the same provider when nowhere else can serve", () => {
    const sameProvider = zen("nemotron-3.5-lightning-free")
    const out = resolve({ catalog: catalogue(sameProvider) })
    expect(out.resolution?.model.id).toBe("nemotron-3.5-lightning-free")
  })

  test("takes the largest output ceiling among equally good providers", () => {
    const small = model("zhipu/a", { limit: { output: 32_000 } })
    const large = model("zhipu/b", { limit: { output: 131_072 } })
    const out = resolve({ catalog: catalogue(small, large) })
    expect(out.resolution?.model.id).toBe("b")
  })

  test("breaks a dead tie deterministically rather than by catalog order", () => {
    const first = model("zhipu/b")
    const second = model("zhipu/a")
    expect(resolve({ catalog: catalogue(first, second) }).resolution?.model.id).toBe("a")
    expect(resolve({ catalog: catalogue(second, first) }).resolution?.model.id).toBe("a")
  })

  test("gives up honestly when the catalog holds nothing usable", () => {
    const out = resolve({ catalog: catalogue() })
    expect(out.resolution).toBeUndefined()
    expect(out.derivedBecause).toBe("undeclared")
  })

  test("respects the swap cap before deriving anything", () => {
    const spare = zen("hy3-free")
    const out = resolve({ swapsUsed: Fallback.SWAP_CAP, catalog: catalogue(spare) })
    expect(out.resolution).toBeUndefined()
    expect(out.capped).toBe(true)
  })

  // Honest provenance: the transcript should not imply the user chose this.
  test("says in the note that the substitute was not declared", () => {
    const spare = zen("hy3-free")
    const note = resolve({ catalog: catalogue(spare) }).resolution!.note
    expect(note).toContain("king")
    expect(note).toContain("hy3-free")
    expect(note).toContain("not declared")
  })
})
