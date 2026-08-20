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
import { TuiEvent } from "@opencode-ai/schema/tui-event"
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
   * How many identical failures before a model is treated as simply not
   * working, whatever it claims the reason is.
   *
   * Measured 2026-08-20: `zhipuai-coding-plan/glm-4.7` answers every request
   * with `余额不足或无可用资源包` - no balance. Upstream classifies that as
   * retryable, so it burned all six attempts over 74 seconds and then died,
   * having never had any chance of succeeding.
   *
   * Detecting that by parsing the error is a trap: the message is in Chinese,
   * carries no useful status code, and every provider words it differently, so
   * a pattern list would start incomplete and rot from there. Counting repeats
   * needs no vocabulary at all - if two honest retries did not help, a third
   * will not either, and moving to another model is strictly better than
   * spending the rest of the budget on the same wall.
   */
  const PERSIST_AFTER = 3

  /**
   * The command the TUI plugin registers for the paradigm picker. Sent through
   * `tui.command.execute`, whose `command` field accepts any string and is
   * dispatched by name against the keymap (`tui/src/app.tsx:987`), so a plugin
   * command is reachable without inventing an event type.
   */
  const PICKER_COMMAND = "paradigm.list"

  export function shiftMessage(head: string, reason: Fallback.Reason): string {
    const what =
      reason === "model_gone"
        ? `${head} is bound to a model that no longer exists`
        : `${head} hit its ${reason === "free_tier_limit" ? "free-tier" : "rate"} limit`
    // The restart caveat is not optional. The config hook fires once at boot,
    // so a paradigm chosen now cannot apply to the session asking the question,
    // and the picker's own status row already refuses to pretend otherwise.
    return `${what}. Auto-swap is off for this paradigm, so nothing was changed - pick a paradigm to switch to, which applies on restart.`
  }

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

  type SessionState = {
    exhausted: Set<string>
    exhaustedProviders: Set<string>
    /** Models that failed repeatedly for no stated reason - see escalation below. */
    persistentlyFailed: Set<string>
    /** The paradigm-shift offer is made once per session, not once per attempt. */
    shiftOffered: boolean
    swaps: number
  }

  // Session-scoped, because `exhausted` has to outlive a single assistant
  // message - the whole failure mode is a chain being walked across a turn.
  // Bounded rather than leaked: a long-lived server would otherwise accumulate
  // one entry per session forever.
  const MAX_TRACKED = 256
  const tracked = new Map<string, SessionState>()

  function stateFor(sessionID: string): SessionState {
    const existing = tracked.get(sessionID)
    if (existing) return existing
    const created: SessionState = {
      exhausted: new Set(),
      exhaustedProviders: new Set(),
      persistentlyFailed: new Set(),
      shiftOffered: false,
      swaps: 0,
    }
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
    opts: { exhaustProvider?: boolean } = {},
  ): Effect.Effect<{ model: Provider.Model | undefined; note: string }> {
    return Effect.gen(function* () {
      const agent = yield* deps.agents.get(deps.agentName).pipe(Effect.orElseSucceed(() => undefined))
      const declared = readDeclaration(agent?.options)
      const state = stateFor(deps.sessionID)

      // auto:false is the paradigm-shift path: do not swap, ask instead. The
      // retry loop calls this on every attempt, so the offer is made once per
      // session rather than six times in ninety seconds.
      if (!declared.auto) {
        const note = shiftMessage(deps.agentName, reason)
        if (!state.shiftOffered) {
          state.shiftOffered = true
          yield* deps.events
            .publish(TuiEvent.ToastShow, {
              title: "Paradigm shift",
              message: note,
              variant: "warning",
              duration: 12_000,
            })
            .pipe(Effect.ignore)
          yield* deps.events.publish(TuiEvent.CommandExecute, { command: PICKER_COMMAND }).pipe(Effect.ignore)
        }
        // Still an outcome rather than undefined, so upstream's Go upsell is
        // suppressed and this replaces it.
        return { model: undefined, note }
      }
      // Escalate on evidence, not on the first sign of trouble. ONE model
      // failing repeatedly is a model problem, and writing off its provider
      // would throw away the other six Zen models over a single blip. TWO
      // different models on the same provider failing the same way is a
      // provider problem - which is what no balance and a bad key both look
      // like from here.
      if (opts.exhaustProvider) {
        state.persistentlyFailed.add(failed.providerID + "/" + failed.id)
        const casualties = [...state.persistentlyFailed].filter((entry) =>
          entry.startsWith(failed.providerID + "/"),
        ).length
        if (casualties >= 2) state.exhaustedProviders.add(failed.providerID)
      }

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
          exhaustedProviders: state.exhaustedProviders,
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
        const walled = !!info.reason && ELIGIBLE.has(info.reason)
        // A wall is known immediately. Anything else has to earn a swap by
        // failing repeatedly, so genuine transient errors still get their
        // retries.
        const persistent = !walled && info.attempt >= PERSIST_AFTER
        if (!walled && !persistent) return undefined

        const out = yield* degrade(deps, walled ? (info.reason as Fallback.Reason) : "model_gone", deps.streamInput.model, {
          // A model that keeps failing for no stated reason has usually taken
          // its whole provider down with it - no balance and a bad key are both
          // account-wide - so trying its sibling is a slower way to fail.
          exhaustProvider: persistent,
        })
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
