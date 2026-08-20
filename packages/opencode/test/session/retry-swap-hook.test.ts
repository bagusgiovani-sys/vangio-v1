import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { SessionRetry } from "../../src/session/retry"

// The retry-side half of Paradigm Shift stage one
// (docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md).
//
// The spec budgets exactly two edits on this seam: suppress F1's Go upsell
// action, and collapse the retry-after delay when a substitute was installed.
// Both are expressed as one optional hook so the upstream file gains no
// fallback logic of its own - and so a build with the hook unset behaves
// exactly as upstream does.

const parse = Schema.decodeUnknownSync(SessionV1.APIError.Schema)

/** A Zen free-tier wall: retry-after is the seconds left until UTC midnight. */
function freeTierError(retryAfterSeconds = 30_000): unknown {
  return new SessionV1.APIError({
    message: "Free usage exceeded",
    isRetryable: true,
    statusCode: 429,
    responseHeaders: { "retry-after": String(retryAfterSeconds) },
    responseBody: JSON.stringify({
      type: "error",
      error: { type: "FreeUsageLimitError", message: "Free usage exceeded" },
    }),
  }).toObject()
}

type Seen = { message: string; action?: { reason: string }; next: number }

/**
 * Drives one retry decision and reports what `set` was handed. The effect
 * fails once and then succeeds, so exactly one decision is made.
 */
async function decide(swap?: SessionRetry.SwapHook) {
  const seen: Seen[] = []
  const reasons: Array<string | undefined> = []
  let failed = false
  const started = Date.now()

  const effect = Effect.gen(function* () {
    if (!failed) {
      failed = true
      return yield* Effect.fail(freeTierError())
    }
    return "ok" as const
  }).pipe(
    Effect.retry(
      SessionRetry.policy({
        provider: "opencode",
        parse,
        set: (info) => Effect.sync(() => void seen.push(info as Seen)),
        swap: swap
          ? (input) => {
              reasons.push(input.reason)
              return swap(input)
            }
          : undefined,
      }),
    ),
  )

  // `set` records the decision BEFORE the schedule waits, and an un-swapped
  // free-tier wall really does schedule ~30,000 seconds out. So abandon the
  // effect as soon as the decision exists rather than waiting any of it out -
  // the assertion is on `next`, not on elapsed time.
  const result = await Effect.runPromise(Effect.timeout(effect, 300).pipe(Effect.orElseSucceed(() => "timeout")))
  return { result, decision: seen[0]!, reasons, started }
}

describe("session.retry fallback hook", () => {
  test("without a hook, the upsell action and the retry-after delay are untouched", async () => {
    const { decision, started } = await decide()
    expect(decision.action?.reason).toBe("free_tier_limit")
    // 30,000 seconds of retry-after, honoured verbatim.
    expect(decision.next - started).toBeGreaterThan(1_000_000)
  })

  test("the hook sees the free_tier_limit reason, so it can gate on it", async () => {
    const { reasons } = await decide(() => Effect.succeed({ swapped: true, message: "swapped" }))
    expect(reasons).toEqual(["free_tier_limit"])
  })

  // F1: the action object is what every upsell surface keys off. Removing it
  // is how VanGio declines to render the funnel at all.
  test("a swap drops the upsell action", async () => {
    const { decision } = await decide(() => Effect.succeed({ swapped: true, message: "king: b replaces a" }))
    expect(decision.action).toBeUndefined()
    expect(decision.message).toBe("king: b replaces a")
  })

  // The whole point of swapping is not to wait out the dead model's wall.
  test("a swap collapses the retry-after wait to ordinary backoff", async () => {
    const { decision, started } = await decide(() => Effect.succeed({ swapped: true, message: "swapped" }))
    const wait = decision.next - started
    expect(wait).toBeLessThan(31_000)
  })

  // Chain exhausted: nothing to swap to, but VanGio still never emits the Go
  // upsell - the fork's own terminal message replaces it.
  test("an unswapped outcome still drops the upsell and replaces the message", async () => {
    const { decision, started } = await decide(() =>
      Effect.succeed({ swapped: false, message: "king exhausted its fallback chain; free tier resets at 00:00 UTC" }),
    )
    expect(decision.action).toBeUndefined()
    expect(decision.message).toContain("exhausted")
    // Not swapped, so the real wall still applies - waiting it out is correct here.
    expect(decision.next - started).toBeGreaterThan(1_000_000)
  })

  test("a hook that declines leaves upstream behaviour exactly as it was", async () => {
    const { decision, started } = await decide(() => Effect.succeed(undefined))
    expect(decision.action?.reason).toBe("free_tier_limit")
    expect(decision.next - started).toBeGreaterThan(1_000_000)
  })
})
