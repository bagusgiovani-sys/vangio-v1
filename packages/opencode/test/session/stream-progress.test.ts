import { describe, expect, test } from "bun:test"
import { StreamProgress } from "../../src/session/stream-progress"

// Tells "the model never started" apart from "the model died halfway" - and,
// crucially, apart from "the server said no immediately".
//
// Zero output alone is NOT enough: a 503 that comes back in 200ms has produced
// nothing either, and that is a genuinely transient failure which should keep
// its honest retries on the same model. What separates the two is TIME SPENT
// SILENT. Measured 2026-08-23: Zen returned [504] after ~123 seconds of dead
// air with zero tokens. That needs no vocabulary to recognise - the same
// argument PERSIST_AFTER makes for counting instead of parsing.
describe("StreamProgress", () => {
  test("a fresh tracker has produced no output", () => {
    const t = StreamProgress.tracker(1000)
    expect(t.silentMs(1000)).toBe(0)
  })

  test("step framing alone is not output, so silence keeps accruing", () => {
    const t = StreamProgress.tracker(0)
    t.saw("step-start")
    t.saw("finish")
    expect(t.silentMs(50_000)).toBe(50_000)
  })

  test("a text delta ends the silence", () => {
    const t = StreamProgress.tracker(0)
    t.saw("step-start")
    t.saw("text-delta")
    expect(t.silentMs(50_000)).toBe(0)
  })

  test("reasoning counts as output even with no visible text", () => {
    const t = StreamProgress.tracker(0)
    t.saw("reasoning-delta")
    expect(t.silentMs(50_000)).toBe(0)
  })

  test("a tool call counts as output", () => {
    const t = StreamProgress.tracker(0)
    t.saw("tool-call")
    expect(t.silentMs(50_000)).toBe(0)
  })

  // Our own tool execution reporting back is not the model generating.
  test("a tool result is not model output", () => {
    const t = StreamProgress.tracker(0)
    t.saw("tool-result")
    expect(t.silentMs(50_000)).toBe(50_000)
  })

  // A fast failure has barely been silent at all - that is the 503 case.
  test("a failure that arrives immediately reports almost no silence", () => {
    const t = StreamProgress.tracker(0)
    expect(t.silentMs(200)).toBe(200)
  })

  test("reset starts the next attempt's clock", () => {
    const t = StreamProgress.tracker(0)
    t.saw("text-delta")
    expect(t.silentMs(10_000)).toBe(0)
    t.reset(10_000)
    expect(t.silentMs(12_000)).toBe(2_000)
  })
})
