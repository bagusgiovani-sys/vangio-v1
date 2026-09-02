/**
 * VanGio: how long has this stream attempt been silent?
 *
 * The free-tier fallback needs to separate three failures that upstream lumps
 * together as "5xx, retry it":
 *
 *   - died halfway  - emitted tokens, then broke. Transient. Retry.
 *   - refused fast  - a 503 back in 200ms. Also transient. Retry.
 *   - never started - nothing at all, for minutes. Retrying buys more silence.
 *
 * Zero output alone cannot tell the last two apart, which is why this reports
 * TIME SILENT rather than a boolean. Measured 2026-08-23 against Zen:
 * `nemotron-3-ultra-free` returned `[504] Upstream idle timeout exceeded`
 * after ~123 seconds having produced zero tokens, twice in one session, and
 * `PERSIST_AFTER` would only have moved on the third such failure in a single
 * turn - roughly six minutes of dead air. The user cancelled instead.
 *
 * Duration needs no vocabulary, which is the same argument `PERSIST_AFTER`
 * makes for counting rather than parsing provider error strings.
 *
 * Counting raw stream events would not work either: `step-start` fires before
 * a single token exists and `finish` still arrives on a stream the gateway
 * killed, so only events the MODEL generates end the silence. `tool-result` is
 * deliberately excluded - that is our own tool execution reporting back.
 */

import { Duration, Effect } from "effect"
import { ProviderError } from "@/provider/error"

/** Events that mean the model itself produced something. */
const OUTPUT = new Set([
  "text-start",
  "text-delta",
  "reasoning-start",
  "reasoning-delta",
  "tool-input-start",
  "tool-input-delta",
  "tool-call",
])

export function isOutput(type: string) {
  return OUTPUT.has(type)
}

export interface Tracker {
  /** Record one stream event. */
  saw(type: string): void
  /** Start a fresh attempt's clock: each retry is judged on its own. */
  reset(now: number): void
  /** Milliseconds silent so far, or 0 once the model has produced output. */
  silentMs(now: number): number
}

export function tracker(now: number): Tracker {
  let seen = false
  let startedAt = now
  return {
    saw(type) {
      if (!seen && OUTPUT.has(type)) seen = true
    },
    reset(at) {
      seen = false
      startedAt = at
    },
    silentMs(at) {
      return seen ? 0 : Math.max(0, at - startedAt)
    },
  }
}

/**
 * How long a stream may stay silent before the guard TRIPS - as opposed to how
 * long it must have been silent for the fallback to CALL it a stall.
 *
 * These are deliberately different numbers. FallbackSwap's `STALL_AFTER_MS`
 * (30s) is a post-mortem reading taken after a request already failed, where
 * being generous costs nothing. This one is a live guillotine on
 * time-to-first-token, and free tiers under load start slowly: measured
 * 2026-08-28, Groq turns ran 41-93s end to end, and both candidate models
 * answer a small prompt in ~20s. Tripping at 30s would swap away models that
 * were about to answer. 60s clears that and still sits well under the ~123s
 * Zen took to return its 504 on 2026-08-23.
 *
 * Trigger ABOVE judge also means anything this fires on is necessarily judged
 * a stall rather than an ordinary retry.
 */
const STALL_TRIGGER_MS = 60_000

/** Read per call - same reasoning and same shape as `VANGIO_STALL_AFTER_MS`. */
export function triggerMs(): number {
  const raw = Number.parseInt(process.env["VANGIO_STALL_TRIGGER_MS"] ?? "", 10)
  return Number.isFinite(raw) && raw > 0 ? raw : STALL_TRIGGER_MS
}

/**
 * Fails once the tracker has been silent past the budget, so that a stream
 * which never errors reaches the retry policy at all.
 *
 * THE BUG THIS EXISTS FOR. `silentMs` is sampled at `retry.ts:234`, inside the
 * step function of the schedule `Effect.retry` drives - and `Effect.retry` runs
 * that schedule only when the wrapped effect FAILS. A stream that opens, goes
 * quiet and then ends cleanly was therefore never judged at all: no failure, no
 * retry, no sample, no swap. Measured 2026-08-28 (a 151s silent Zen stream, and
 * a Groq `lean` that hung indefinitely); the 2026-08-23 case only ever worked
 * because Zen eventually answered `[504]`, which IS an error.
 *
 * WHY IT FAILS RATHER THAN ABORTS. `processor.ts` routes interrupt-only causes
 * AROUND `Effect.retry` (`Cause.hasInterruptsOnly`), so cancelling the stream
 * would leave the guard exactly as blind as it is now. A failure is the only
 * signal the retry path can see.
 *
 * WHY `ResponseStreamError`. It is already mapped by `MessageV2.fromError` to
 * an `APIError` with `isRetryable: true`, and upstream already raises it for an
 * idle stream (`plugin/openai/ws.ts:178`). Borrowing it reaches classification,
 * the `silentMs` sample, the stall judgement and the swap without one line
 * changed in `message-v2.ts`, `retry.ts` or `fallback-swap.ts`.
 *
 * WHY IT POLLS THE TRACKER, and not `Stream.timeoutOrElse` - which exists in
 * effect 4 and looks like the obvious primitive. That timeout is checked PER
 * PULL, so ANY event resets it, including `tool-result`, which `OUTPUT`
 * excludes on purpose. A five-minute bash call would trip it. The tracker's
 * `seen` latch has no such hole.
 */
export function watchdog(track: Tracker, now: () => number = Date.now) {
  const budget = triggerMs()
  // Checked often enough to be punctual, rarely enough to be free. A forced
  // budget in a test is far smaller than the shipped one, hence the clamp.
  const tick = Math.max(25, Math.min(budget, 1_000))
  return Effect.gen(function* () {
    while (true) {
      yield* Effect.sleep(Duration.millis(tick))
      const silent = track.silentMs(now())
      if (silent >= budget) {
        return yield* Effect.fail(
          new ProviderError.ResponseStreamError(`Model produced no output for ${Math.round(silent / 1000)}s`),
        )
      }
    }
  })
}

export * as StreamProgress from "./stream-progress"
