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
  export type Reason = "free_tier_limit" | "account_rate_limit" | "model_gone"

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
  }

  export type Resolution<M> = {
    model: M
    source: "static"
    /** Human-readable, rendered on the model-switched divider. */
    note: string
  }

  export type Skip = {
    entry: string
    why: "malformed" | "exhausted" | "unresolvable" | "needs"
  }

  export type Attempt<M> = {
    resolution?: Resolution<M>
    /** Every entry passed over, and why. Logged so staleness stays visible. */
    skipped: Skip[]
    /** Set when the session has already spent its swaps. */
    capped?: boolean
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
  }

  export function resolveStatic<M extends Judgeable>(input: {
    head: string
    failed: Judgeable
    reason: Reason
    chain: readonly string[]
    needs?: Needs
    exhausted: ReadonlySet<string>
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
}
