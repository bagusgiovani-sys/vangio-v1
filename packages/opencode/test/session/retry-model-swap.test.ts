import { describe, expect, test } from "bun:test"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Schema } from "effect"
import { SessionRetry } from "../../src/session/retry"

// Proof for F2 of docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md.
//
// The free-tier fallback design rests on one claim: because `llm.stream(streamInput)`
// is evaluated INSIDE the effect wrapped by `Effect.retry` (processor.ts:640, retried
// at :660), and because the policy's `set` callback closes over the same `streamInput`
// (processor.ts:664), mutating `streamInput.model` from `set` changes the model the
// NEXT retry attempt goes out on.
//
// These tests reproduce that wiring with a fake stream so the claim is checked by CI
// rather than by reading. If an upstream merge ever moves `llm.stream` out of the
// retried effect, or hoists the model read above it, these fail.

const parse = Schema.decodeUnknownSync(SessionV1.APIError.Schema)

function freeTierError(): unknown {
  return new SessionV1.APIError({
    message: "Free usage exceeded",
    isRetryable: true,
    statusCode: 429,
    // retry-after-ms:0 keeps the test instant. Zen's real header is seconds-to-UTC-midnight.
    responseHeaders: { "retry-after-ms": "0" },
    responseBody: JSON.stringify({
      type: "error",
      error: { type: "FreeUsageLimitError", message: "Free usage exceeded" },
    }),
  }).toObject()
}

function plainRetryableError(): unknown {
  return new SessionV1.APIError({
    message: "Service unavailable",
    isRetryable: false,
    statusCode: 503,
    responseHeaders: { "retry-after-ms": "0" },
  }).toObject()
}

/**
 * Mirrors processor.ts:635-674 — the effect reads `streamInput.model` on every
 * attempt, and the retry policy's `set` can mutate it before the next one.
 */
function runWithSwap(opts: {
  initial: string
  swapTo?: string
  failures: unknown[]
}) {
  const streamInput = { model: opts.initial }
  const attempts: string[] = []
  const swaps: Array<{ from: string; to: string; reason: string | undefined }> = []
  let index = 0

  const effect = Effect.gen(function* () {
    attempts.push(streamInput.model)
    const failure = opts.failures[index++]
    if (failure !== undefined) return yield* Effect.fail(failure)
    return "ok" as const
  }).pipe(
    Effect.retry(
      SessionRetry.policy({
        provider: "opencode",
        parse,
        set: (info) =>
          Effect.sync(() => {
            if (!opts.swapTo) return
            swaps.push({ from: streamInput.model, to: opts.swapTo, reason: info.action?.reason })
            streamInput.model = opts.swapTo
          }),
      }),
    ),
  )

  return Effect.runPromise(effect).then((result) => ({ result, attempts, swaps, streamInput }))
}

describe("session.retry model swap between attempts", () => {
  test("mutating streamInput.model in `set` changes the model on the next attempt", async () => {
    const { result, attempts, swaps } = await runWithSwap({
      initial: "opencode/deepseek-v4-flash-free",
      swapTo: "zhipu/glm-4.7-flash",
      failures: [freeTierError()],
    })

    expect(result).toBe("ok")
    // The whole point: attempt 2 went out on a different model than attempt 1.
    expect(attempts).toStrictEqual(["opencode/deepseek-v4-flash-free", "zhipu/glm-4.7-flash"])
    expect(swaps).toStrictEqual([
      { from: "opencode/deepseek-v4-flash-free", to: "zhipu/glm-4.7-flash", reason: "free_tier_limit" },
    ])
  })

  test("`set` sees the free_tier_limit action, so a swap can be gated on the reason", async () => {
    const { swaps } = await runWithSwap({
      initial: "opencode/deepseek-v4-flash-free",
      swapTo: "zhipu/glm-4.7-flash",
      failures: [plainRetryableError()],
    })

    // A 503 is retryable but carries no action — a fallback must NOT treat it as a
    // free-tier wall. GLM's concurrency 429 lands here too (retry.ts:129-136).
    expect(swaps).toHaveLength(1)
    expect(swaps[0]!.reason).toBeUndefined()
  })

  test("successive failures keep swapping, so a chain can be walked", async () => {
    const streamInput = { model: "a" }
    const attempts: string[] = []
    const chain = ["b", "c"]
    let index = 0

    const effect = Effect.gen(function* () {
      attempts.push(streamInput.model)
      if (attempts.length <= 3) return yield* Effect.fail(freeTierError())
      return "ok" as const
    }).pipe(
      Effect.retry(
        SessionRetry.policy({
          provider: "opencode",
          parse,
          set: () =>
            Effect.sync(() => {
              const next = chain[index++]
              if (next) streamInput.model = next
            }),
        }),
      ),
    )

    expect(await Effect.runPromise(effect)).toBe("ok")
    expect(attempts).toStrictEqual(["a", "b", "c", "c"])
  })

  test("the model is read fresh on every attempt, not captured once", async () => {
    const { attempts } = await runWithSwap({
      initial: "first",
      swapTo: "second",
      failures: [freeTierError(), freeTierError()],
    })

    // If `streamInput.model` were captured before `Effect.retry`, every attempt
    // would report "first".
    expect(attempts).toStrictEqual(["first", "second", "second"])
  })
})
