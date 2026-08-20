/**
 * Wires the fallback resolver into the retry loop.
 *
 * The last piece of Paradigm Shift stage one. Everything it needs already
 * exists and this file only connects it:
 *
 *   - the DECLARATION arrives on the agent's `options` bag, put there by
 *     compileParadigm (the channel decision of 2026-08-20)
 *   - the DECISION is Fallback.resolve - declared chain first, derived from the
 *     live registry as the failsafe
 *   - the IMMEDIATE effect is mutating `streamInput.model`, which the next
 *     retry attempt re-reads (F2)
 *   - the DURABLE effect is publishing SessionEvent.ModelSwitched, which the
 *     projector writes to the session row and message-updater announces in the
 *     transcript - and which the agent loop now honours mid-turn (Q3)
 *
 * WHY THE DECLARATION IS VALIDATED HERE AND NOT TRUSTED. `Agent.Info.options`
 * is `Record<string, unknown>` with no schema behind it, and it is a surface a
 * user can hand-edit. Malformed data must not throw: this code runs inside a
 * 429 handler, where an exception would replace a degraded model with a dead
 * session. Anything unreadable is ignored, which drops through to the derived
 * failsafe - the correct outcome rather than an error.
 */
import { Clock, DateTime, Effect } from "effect"
import { SessionMessage } from "@opencode-ai/schema/session-message"
import { SessionEvent } from "@opencode-ai/schema/session-event"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import type { Agent } from "@/agent/agent"
import type { Provider } from "@/provider/provider"
import type { EventV2 } from "@opencode-ai/core/event"
import type { SessionID } from "./schema"
import { Fallback } from "./fallback"
import type { SessionRetry } from "./retry"

export namespace FallbackSwap {
  /** Reasons that mean "this model will not serve you", as opposed to "try again". */
  const ELIGIBLE = new Set(["free_tier_limit", "account_rate_limit"])

  /**
   * Sentinel for "the paradigm asked to be consulted, so nothing was attempted",
   * which is different from "nothing could be found". Never shown to anyone.
   */
  const DECLINED = "vangio:declined"

  export type Declaration = {
    needs?: Fallback.Needs
    fallback?: string[]
    auto: boolean
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  /**
   * Reads what compileParadigm left on the agent, tolerating anything. Note
   * that `auto` defaults to TRUE on unreadable input: the failsafe's whole
   * purpose is to degrade rather than wall, so a corrupted bag must not be a
   * back door to silently disabling the feature.
   */
  export function readDeclaration(options: unknown): Declaration {
    if (!isRecord(options)) return { auto: true }
    const result: Declaration = { auto: options["shiftAuto"] !== false }

    const fallback = options["fallback"]
    if (Array.isArray(fallback) && fallback.every((e) => typeof e === "string" && e.length > 0)) {
      result.fallback = [...(fallback as string[])]
    }

    const needs = options["needs"]
    if (isRecord(needs)) {
      const parsed: Fallback.Needs = {}
      const minOutput = needs["minOutput"]
      if (typeof minOutput === "number" && Number.isFinite(minOutput) && minOutput > 0) {
        parsed.minOutput = minOutput
      }
      if (typeof needs["tools"] === "boolean") parsed.tools = needs["tools"]
      if (typeof needs["attachment"] === "boolean") parsed.attachment = needs["attachment"]
      if (Object.keys(parsed).length > 0) result.needs = parsed
    }

    return result
  }

  /**
   * When the free tier reopens. Zen's daily counter is keyed on a UTC date
   * (`ipRateLimiter.ts:19`), so the wall lifts at the next UTC midnight - which
   * is arithmetic the client can do without any header, and F4 says no header
   * is ever coming.
   */
  export function resetsAt(now: number): Date {
    const next = new Date(now)
    next.setUTCHours(24, 0, 0, 0)
    return next
  }

  export function terminalMessage(head: string, tried: number, now: number, reason: Fallback.Reason = "free_tier_limit"): string {
    const attempted = tried > 0 ? `${tried} substitute${tried === 1 ? "" : "s"} tried` : "no usable substitute found"
    // A retirement does not reset - saying "resets at 00:00 UTC" would be a
    // straightforward lie, and the user would sit waiting for a model that is
    // never coming back.
    if (reason === "model_gone") {
      return `${head} is bound to a model that no longer exists, and could not be degraded (${attempted}). Rebind it in the paradigm.`
    }
    const reset = resetsAt(now)
    const hours = Math.max(1, Math.round((reset.getTime() - now) / 3_600_000))
    return `${head} hit its free-tier limit and could not be degraded (${attempted}). The limit resets at 00:00 UTC, about ${hours}h from now.`
  }

  type SessionState = { exhausted: Set<string>; swaps: number }

  // Session-scoped, because `exhausted` has to outlive a single assistant
  // message - the whole failure mode is a chain being walked across a turn.
  // Bounded rather than leaked: a long-lived server would otherwise accumulate
  // one entry per session forever.
  const MAX_TRACKED = 256
  const tracked = new Map<string, SessionState>()

  function stateFor(sessionID: string): SessionState {
    const existing = tracked.get(sessionID)
    if (existing) return existing
    const created: SessionState = { exhausted: new Set(), swaps: 0 }
    tracked.set(sessionID, created)
    // Map preserves insertion order, so the oldest key is the first one.
    if (tracked.size > MAX_TRACKED) {
      const oldest = tracked.keys().next()
      if (!oldest.done) tracked.delete(oldest.value)
    }
    return created
  }

  export function forget(sessionID: string): void {
    tracked.delete(sessionID)
  }

  /** Test seam: the tracker is module state, so a test needs a way to reset it. */
  export function reset(): void {
    tracked.clear()
  }

  export type Services = {
    sessionID: SessionID
    agentName: string
    agents: Agent.Interface
    provider: Provider.Interface
    events: { publish: EventV2.Interface["publish"] }
  }

  /**
   * The whole degradation, minus what the caller does with the answer.
   *
   * Both entry points below run this: a rate limit arriving through the retry
   * policy, and a retirement arriving through model resolution. They differ
   * only in the reason they carry and in what they do with the substitute -
   * the declaration, the registry, the resolver, the bookkeeping and the
   * durable announcement are identical, and duplicating them would be how the
   * two paths quietly drift apart.
   */
  function degrade(
    deps: Services,
    reason: Fallback.Reason,
    failed: Fallback.Ref,
  ): Effect.Effect<{ model: Provider.Model | undefined; note: string }> {
    return Effect.gen(function* () {
      const agent = yield* deps.agents.get(deps.agentName).pipe(Effect.orElseSucceed(() => undefined))
      const declared = readDeclaration(agent?.options)
      // auto:false means the user asked to be consulted rather than degraded.
      // Declining leaves upstream's behaviour intact, which is the honest thing
      // to do until the picker trigger exists.
      if (!declared.auto) return { model: undefined, note: DECLINED }

      const state = stateFor(deps.sessionID)

      const providers = yield* deps.provider.list().pipe(Effect.orElseSucceed(() => ({}) as Record<string, unknown>))
        const catalog: Provider.Model[] = []
        for (const entry of Object.values(providers) as Array<{ models?: Record<string, Provider.Model> }>) {
          for (const model of Object.values(entry.models ?? {})) catalog.push(model)
        }
        const byRef = new Map(catalog.map((model) => [model.providerID + "/" + model.id, model]))

        const attempt = Fallback.resolve<Provider.Model>({
          head: deps.agentName,
          failed,
          reason,
          chain: declared.fallback,
          needs: declared.needs,
          exhausted: state.exhausted,
          swapsUsed: state.swaps,
          lookup: (providerID, modelID) => byRef.get(providerID + "/" + modelID),
          catalog: () => catalog,
        })

        for (const skip of attempt.skipped) {
          yield* Effect.logWarning("fallback entry skipped", {
            "session.id": deps.sessionID,
            head: deps.agentName,
            entry: skip.entry,
            why: skip.why,
          })
        }

        if (!attempt.resolution) {
          yield* Effect.logWarning("fallback exhausted", {
            "session.id": deps.sessionID,
            head: deps.agentName,
            capped: attempt.capped ?? false,
            derivedBecause: attempt.derivedBecause,
          })
          return {
            model: undefined,
            note: terminalMessage(deps.agentName, attempt.skipped.length, yield* Clock.currentTimeMillis, reason),
          }
        }

        const next = attempt.resolution.model
        state.exhausted.add(failed.providerID + "/" + failed.id)
        state.swaps += 1

        // Q3: and this is what makes it outlive the attempt, the step, and a
        // restart - the loop prefers the session row once it moves mid-turn.
        yield* deps.events
          .publish(SessionEvent.ModelSwitched, {
            sessionID: deps.sessionID,
            messageID: SessionMessage.ID.create(),
            timestamp: yield* DateTime.now,
            model: { id: ModelV2.ID.make(next.id), providerID: ProviderV2.ID.make(next.providerID) },
          })
          .pipe(Effect.ignore)

        yield* Effect.logInfo("fallback swap", {
          "session.id": deps.sessionID,
          head: deps.agentName,
          from: failed.providerID + "/" + failed.id,
          to: next.providerID + "/" + next.id,
          source: attempt.resolution.source,
        })

        return { model: next, note: attempt.resolution.note }
      })
  }

  /**
   * Retry-policy entry point: a rate limit. Installs the substitute by mutating
   * `streamInput.model`, which is the F2 mechanism itself rather than a copy.
   */
  export function hook(
    deps: Services & { streamInput: { model: Provider.Model } },
  ): SessionRetry.SwapHook {
    return (info) =>
      Effect.gen(function* () {
        if (!info.reason || !ELIGIBLE.has(info.reason)) return undefined
        const out = yield* degrade(deps, info.reason as Fallback.Reason, deps.streamInput.model)
        if (out.note === DECLINED) return undefined
        if (!out.model) return { swapped: false, message: out.note }
        deps.streamInput.model = out.model
        return { swapped: true, message: out.note }
      })
  }

  /**
   * Model-resolution entry point: a RETIREMENT.
   *
   * This path exists because the retry policy never sees one. A retired model
   * fails at `provider.getModel` with ProviderModelNotFoundError, which is not
   * retryable, so it dies before any retry decision is made - the head is
   * killed rather than degraded, and the user gets a bare "Unexpected server
   * error". Measured twice on 2026-08-20 alone (kimi-k2.5-free, then
   * laguna-s-2.1-free mid-session), which makes retirement the more common of
   * the two failures this feature is supposed to survive.
   *
   * Returns undefined to mean "carry on dying" - the caller keeps its existing
   * error path untouched when nothing can be rescued.
   */
  export function rescueRetired(
    deps: Services & { failed: Fallback.Ref },
  ): Effect.Effect<Provider.Model | undefined> {
    return Effect.gen(function* () {
      const out = yield* degrade(deps, "model_gone", deps.failed)
      return out.model
    })
  }
}
