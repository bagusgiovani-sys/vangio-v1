/**
 * StaticResolver - which model a head should run instead, once the one it was
 * bound to has hit a wall.
 *
 * Stage one of docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md.
 * The spec frames a head's fallback as a question rather than a list:
 *
 *   given this head, the model that just died, and why - what should it run
 *   instead?
 *
 * A static answer walks the head's declared `fallback` chain. A live answer
 * would ask a quota source what still has budget; F7 says no usable backend
 * exists today, so only the static one is built. Both answer the same question,
 * which is why the question is the exported shape and the chain walk is an
 * implementation of it.
 *
 * WHY THIS IS PURE AND TAKES A SYNCHRONOUS `lookup`. The spec puts resolution
 * beside the provider registry because a resolution must be a RESOLVED model,
 * not an id (F2: `streamInput.model` is an object). But the registry is the
 * only impure part, so it enters as a function. Everything that decides - order,
 * exhaustion, capability matching, the cap - is then testable against a fake
 * registry with no Effect runtime at all.
 *
 * WHAT "UNRESOLVABLE" COVERS. F6 noted that a retired model is simply absent
 * from the registry. Measured 2026-08-20, deprecated models are absent for the
 * same reason: `provider.ts:1663-1664` deletes them regardless of any flag, and
 * twenty of the twenty-seven Zen models the catalog advertises are in that
 * state. So one check covers both, and neither is silent - every skip is
 * reported so a chain cannot quietly become shorter than it looks.
 */

export namespace Fallback {
  export type Reason = "free_tier_limit" | "account_rate_limit" | "model_gone" | "stalled"

  /** What the head's role requires, as declared in the paradigm file. */
  export type Needs = {
    minOutput?: number
    tools?: boolean
    attachment?: boolean
  }

  /**
   * The part of `Provider.Model` a chain has to judge. Declared structurally so
   * this module does not import the provider registry it is deliberately
   * independent of; the real `Provider.Model` satisfies it.
   */
  export type Judgeable = {
    id: string
    providerID: string
    limit: { output: number }
    capabilities: { toolcall: boolean; attachment: boolean }
    /**
     * Absent means models.dev published no price, which the fork already reads
     * as free everywhere else (see resolve.isFree()'s KNOWN GAP note). Keep
     * that reading rather than refusing to consider the model.
     */
    cost?: { input: number; output: number }
  }

  /**
   * Enough to identify the model that died. Deliberately NOT a Judgeable: a
   * retired model cannot be resolved into one, and the resolver only ever reads
   * the identity (to refuse handing it back) and the provider (to prefer
   * leaving it). Asking for more would force callers to invent it.
   */
  export type Ref = { id: string; providerID: string }

  export type Resolution<M> = {
    model: M
    /** "derived" means nobody declared this - the failsafe picked it. */
    source: "static" | "derived"
    /** Human-readable, rendered on the model-switched divider. */
    note: string
  }

  export type Skip = {
    entry: string
    why: "malformed" | "exhausted" | "unresolvable" | "needs" | "provider-exhausted"
  }

  export type Attempt<M> = {
    resolution?: Resolution<M>
    /** Every entry passed over, and why. Logged so staleness stays visible. */
    skipped: Skip[]
    /** Set when the session has already spent its swaps. */
    capped?: boolean
    /**
     * Why the declared chain was not used. "undeclared" covers both a head that
     * never had one and a head whose chain was lost on its way here - those are
     * indistinguishable from inside, which is exactly why the failsafe exists.
     */
    derivedBecause?: "undeclared" | "exhausted"
  }

  /**
   * How many times one session may degrade before it stops trying. Without a
   * cap, a chain whose every entry shares one rate-limit bucket (Q1's bad case)
   * walks the whole chain collecting a 429 and a backoff at each step.
   */
  export const SWAP_CAP = 3

  /**
   * "opencode/hy3-free" -> its two halves. Splits on the FIRST slash only: a
   * provider id never contains one, but a model id can, and providers like
   * `zhipuai-coding-plan` make the prefix look sliceable when it is not.
   */
  export function splitRef(ref: string): { providerID: string; modelID: string } | undefined {
    const at = ref.indexOf("/")
    if (at <= 0) return undefined
    const providerID = ref.slice(0, at)
    const modelID = ref.slice(at + 1)
    if (!providerID || !modelID) return undefined
    return { providerID, modelID }
  }

  function satisfies(model: Judgeable, needs: Needs | undefined): boolean {
    if (!needs) return true
    if (needs.minOutput !== undefined && model.limit.output < needs.minOutput) return false
    // A `false` need states the role does not require the capability. It is not
    // a prohibition on models that happen to have it.
    if (needs.tools === true && !model.capabilities.toolcall) return false
    if (needs.attachment === true && !model.capabilities.attachment) return false
    return true
  }

  function ref(model: { providerID: string; id: string }): string {
    return model.providerID + "/" + model.id
  }

  const REASONS: Record<Reason, string> = {
    free_tier_limit: "free tier limit",
    account_rate_limit: "account rate limit",
    model_gone: "model no longer available",
    stalled: "model stopped responding",
  }

  export function resolveStatic<M extends Judgeable>(input: {
    head: string
    failed: Ref
    reason: Reason
    chain: readonly string[]
    needs?: Needs
    exhausted: ReadonlySet<string>
    /**
     * Providers that have proved they cannot serve THIS session at all - no
     * balance, bad key, an outage. Every model behind one is unreachable, so
     * walking to its sibling is just a slower way to fail.
     */
    exhaustedProviders?: ReadonlySet<string>
    swapsUsed: number
    cap?: number
    lookup: (providerID: string, modelID: string) => M | undefined
  }): Attempt<M> {
    const skipped: Skip[] = []
    if (input.swapsUsed >= (input.cap ?? SWAP_CAP)) return { skipped, capped: true }

    // The model that just died is exhausted by definition, whether or not the
    // caller has recorded it yet - handing it back would retry the wall.
    const dead = ref(input.failed)

    for (const entry of input.chain) {
      const parts = splitRef(entry)
      if (!parts) {
        skipped.push({ entry, why: "malformed" })
        continue
      }
      if (entry === dead || input.exhausted.has(entry)) {
        skipped.push({ entry, why: "exhausted" })
        continue
      }
      if (input.exhaustedProviders?.has(parts.providerID)) {
        skipped.push({ entry, why: "provider-exhausted" })
        continue
      }
      const model = input.lookup(parts.providerID, parts.modelID)
      if (!model) {
        skipped.push({ entry, why: "unresolvable" })
        continue
      }
      if (!satisfies(model, input.needs)) {
        skipped.push({ entry, why: "needs" })
        continue
      }
      return {
        skipped,
        resolution: {
          model,
          source: "static",
          note: `${input.head}: ${ref(model)} replaces ${dead} (${REASONS[input.reason]})`,
        },
      }
    }

    return { skipped }
  }

  function isFree(model: Judgeable): boolean {
    if (!model.cost) return true
    return model.cost.input === 0 && model.cost.output === 0
  }

  /**
   * The failsafe: a substitute nobody declared, chosen from what the registry
   * actually holds.
   *
   * This is not a nicety. Not one of the six bundled paradigms declares a
   * `fallback`, so without this the whole feature would degrade nothing for
   * anyone until every preset had been hand-edited. It is also the answer to a
   * chain that went missing rather than being walked - the two are
   * indistinguishable from here, and both should degrade rather than wall.
   *
   * Ordering, in priority order:
   *
   *  1. A DIFFERENT PROVIDER than the one that just failed. F3 says a Zen daily
   *     limit may be one bucket shared by every default-limit free model, and
   *     Q1 is still open, so the next Zen model may hit the identical wall on
   *     its first attempt. Leaving the walled provider is the safer move, and
   *     it stays the safer move whichever way Q1 lands.
   *  2. The largest output ceiling. The spec is explicit that output, not
   *     context, is what truncates real work.
   *  3. Model id, ascending - so the same catalog always yields the same
   *     answer and a test can pin it.
   */
  /**
   * Whether leaving the current provider is worth preferring.
   *
   * ONLY for rate limits. F3 says a Zen daily limit may be one bucket shared by
   * every default-limit free model, so the next model on the same provider can
   * hit the identical wall - the wall is a property of the provider, not the
   * model.
   *
   * A RETIREMENT is the opposite: it says nothing whatsoever about the
   * provider, whose credentials are known to work. Preferring to leave it there
   * is not just unmotivated, it is actively worse - measured 2026-08-20, that
   * rule moved a retired Zen model onto a Zhipu coding plan with no balance,
   * trading a dead model for a dead account.
   */
  function preferElsewhere(reason: Reason): boolean {
    // A STALL is like a retirement in the one way that matters here: it says
    // nothing about the provider, whose credentials are working fine. The model
    // is merely too slow right now, so a sibling on the same provider is a
    // perfectly good answer and moving accounts would be unmotivated.
    return reason !== "model_gone" && reason !== "stalled"
  }

  export function resolveDerived<M extends Judgeable>(input: {
    head: string
    failed: Ref
    reason: Reason
    needs?: Needs
    exhausted: ReadonlySet<string>
    exhaustedProviders?: ReadonlySet<string>
    catalog: () => readonly M[]
    allowPaid?: boolean
  }): Resolution<M> | undefined {
    const dead = ref(input.failed)
    const usable = input.catalog().filter((model) => {
      const id = ref(model)
      if (id === dead || input.exhausted.has(id)) return false
      if (input.exhaustedProviders?.has(model.providerID)) return false
      if (!input.allowPaid && !isFree(model)) return false
      return satisfies(model, input.needs)
    })
    if (usable.length === 0) return undefined

    const elsewhere = preferElsewhere(input.reason)
    const best = [...usable].sort((a, b) => {
      // For a retirement this flips: staying on the provider that already works
      // beats wandering onto one that merely has a key on file.
      const aPreferred = (a.providerID !== input.failed.providerID) === elsewhere
      const bPreferred = (b.providerID !== input.failed.providerID) === elsewhere
      if (aPreferred !== bPreferred) return aPreferred ? -1 : 1
      if (a.limit.output !== b.limit.output) return b.limit.output - a.limit.output
      return a.id.localeCompare(b.id)
    })[0]!

    return {
      model: best,
      source: "derived",
      note: `${input.head}: ${ref(best)} replaces ${dead} (${REASONS[input.reason]}; not declared, chosen from available models)`,
    }
  }

  /**
   * The whole protocol: honour what the head declared, and if that yields
   * nothing, derive something rather than showing the user a wall.
   */
  export function resolve<M extends Judgeable>(input: {
    head: string
    failed: Ref
    reason: Reason
    chain: readonly string[] | undefined
    needs?: Needs
    exhausted: ReadonlySet<string>
    exhaustedProviders?: ReadonlySet<string>
    swapsUsed: number
    cap?: number
    lookup: (providerID: string, modelID: string) => M | undefined
    catalog: () => readonly M[]
    allowPaid?: boolean
  }): Attempt<M> {
    const declared = resolveStatic({ ...input, chain: input.chain ?? [] })
    if (declared.resolution || declared.capped) return declared

    const derived = resolveDerived(input)
    return {
      ...declared,
      resolution: derived,
      // An empty chain and a fully-skipped one are different stories and the
      // log should not conflate them: one is "you never declared a fallback",
      // the other is "the one you declared is stale".
      derivedBecause: declared.skipped.length > 0 ? "exhausted" : "undeclared",
    }
  }
}
