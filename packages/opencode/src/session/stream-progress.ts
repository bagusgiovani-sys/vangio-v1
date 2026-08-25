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

export * as StreamProgress from "./stream-progress"
