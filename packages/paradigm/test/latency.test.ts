import { describe, expect, test } from "bun:test"
import { classify, hasToken, GATEWAY_IDLE_BUDGET_MS } from "../src/latency"

// Why this exists: `run -m <model> "Reply OK"` cannot see the failure that bit
// us on 2026-08-23. Zen killed a stream after ~123s with zero tokens, and a
// tiny prompt reaches first token in ~4s on every model, so the smoke test is
// green on a model that cannot serve a real turn. What predicts the failure is
// TIME TO FIRST TOKEN under a realistic context, judged against the gateway's
// own idle budget.
describe("classify", () => {
  test("a fast first token is fine", () => {
    expect(classify(4_000, GATEWAY_IDLE_BUDGET_MS)).toBe("ok")
  })

  // Half the budget is already too close to trust: 123s was one sample at one
  // context size, and a bigger context only moves it the wrong way.
  test("half the budget is already at risk", () => {
    expect(classify(62_000, GATEWAY_IDLE_BUDGET_MS)).toBe("at-risk")
  })

  test("at or past the budget is a failure, not a warning", () => {
    expect(classify(GATEWAY_IDLE_BUDGET_MS, GATEWAY_IDLE_BUDGET_MS)).toBe("over-budget")
    expect(classify(200_000, GATEWAY_IDLE_BUDGET_MS)).toBe("over-budget")
  })

  test("the boundary belongs to at-risk, not ok", () => {
    expect(classify(GATEWAY_IDLE_BUDGET_MS / 2, GATEWAY_IDLE_BUDGET_MS)).toBe("at-risk")
  })

  // A stream that never produced a token has no TTFT, and reporting that as
  // "ok" is precisely the lie this probe exists to stop telling.
  test("no first token at all is over budget, never ok", () => {
    expect(classify(undefined, GATEWAY_IDLE_BUDGET_MS)).toBe("over-budget")
  })
})

// The opening chunk Zen actually sends carries `content: ""` with the real text
// in `reasoning`. A content-only check would call that "no token yet" and
// overstate TTFT by however long the model reasons - which on a reasoning model
// is the entire measurement.
describe("hasToken", () => {
  test("the role-only opening chunk is not a token", () => {
    expect(hasToken({ choices: [{ delta: { role: "assistant", content: "" } }] })).toBe(false)
  })

  test("visible content is a token", () => {
    expect(hasToken({ choices: [{ delta: { content: "Hi" } }] })).toBe(true)
  })

  test("reasoning is a token even when content is still empty", () => {
    expect(hasToken({ choices: [{ delta: { content: "", reasoning: "Here" } }] })).toBe(true)
  })

  test("a finish chunk with no delta is not a token", () => {
    expect(hasToken({ choices: [{ finish_reason: "stop" }] })).toBe(false)
  })

  test("junk is not a token", () => {
    expect(hasToken({})).toBe(false)
    expect(hasToken(null)).toBe(false)
  })
})
