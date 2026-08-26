/**
 * Time-to-first-token probe.
 *
 * The routine smoke test - `vangio run -m <model> "Reply OK"` - is green on a
 * model that cannot serve a real turn. Measured 2026-08-25: both candidate
 * models answer that prompt in ~20s end to end, of which most is instance boot.
 * Meanwhile, on 2026-08-23, Zen killed a real session's stream twice with
 * `[504] Upstream idle timeout exceeded` after ~123 seconds of ZERO tokens.
 *
 * The smoke test cannot see that, and no amount of running it more often will.
 * The failure is a function of PREFILL: a real working context pushes time to
 * first token past the gateway's idle budget, and a three-word prompt never
 * gets near it. So the probe sends a realistic context and measures the one
 * number that predicts the failure.
 */

/**
 * The gateway idle budget, measured from two real failures on 2026-08-23:
 * 08:50:41 -> 08:52:44 (123.0s) and 02:52:52 -> 02:55:00 (128.1s). Zen does not
 * document it, so this is an observation, not a specification - which is why
 * `at-risk` starts at half of it rather than at the line itself.
 */
export const GATEWAY_IDLE_BUDGET_MS = 123_000

export type Verdict = "ok" | "at-risk" | "over-budget"

/**
 * `undefined` means the stream produced no token at all. That is the worst
 * outcome, not the absence of one, and it must never read as "ok".
 */
export function classify(ttftMs: number | undefined, budgetMs: number): Verdict {
  if (ttftMs === undefined) return "over-budget"
  if (ttftMs >= budgetMs) return "over-budget"
  if (ttftMs >= budgetMs / 2) return "at-risk"
  return "ok"
}

/**
 * Did this SSE chunk carry actual generated text?
 *
 * Zen's opening chunk is `{ role: "assistant", content: "" }` and, on a
 * reasoning model, the first real text arrives in `reasoning` while `content`
 * stays empty for a long time. Checking `content` alone would skip the entire
 * reasoning phase and report a TTFT that is wrong by exactly the interval that
 * matters.
 */
export function hasToken(chunk: unknown): boolean {
  if (typeof chunk !== "object" || chunk === null) return false
  const choices = (chunk as { choices?: unknown }).choices
  if (!Array.isArray(choices)) return false
  for (const choice of choices) {
    const delta = (choice as { delta?: unknown })?.delta
    if (typeof delta !== "object" || delta === null) continue
    const d = delta as { content?: unknown; reasoning?: unknown }
    if (typeof d.content === "string" && d.content.length > 0) return true
    if (typeof d.reasoning === "string" && d.reasoning.length > 0) return true
  }
  return false
}

export type Sample = {
  model: string
  ttftMs?: number
  totalMs: number
  tokens: number
  error?: string
}

/**
 * One streaming request, timed. Deliberately talks to the provider directly
 * rather than through the CLI: instance boot is ~15s here and has nothing to do
 * with whether the gateway will time the model out.
 */
export async function probe(input: {
  baseUrl: string
  model: string
  context: string
  apiKey?: string
  timeoutMs: number
}): Promise<Sample> {
  const started = Date.now()
  let firstAt: number | undefined
  let tokens = 0
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), input.timeoutMs)
  try {
    const res = await fetch(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: control.signal,
      headers: {
        "Content-Type": "application/json",
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: input.model,
        stream: true,
        messages: [{ role: "user", content: input.context }],
      }),
    })
    if (!res.ok || !res.body) {
      return {
        model: input.model,
        totalMs: Date.now() - started,
        tokens: 0,
        error: `HTTP ${res.status}`,
      }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith("data:")) continue
        const payload = line.slice(5).trim()
        if (payload === "[DONE]") continue
        let parsed: unknown
        try {
          parsed = JSON.parse(payload)
        } catch {
          continue
        }
        if (hasToken(parsed)) {
          tokens++
          firstAt ??= Date.now()
        }
      }
    }
    return { model: input.model, ttftMs: firstAt ? firstAt - started : undefined, totalMs: Date.now() - started, tokens }
  } catch (err) {
    return {
      model: input.model,
      ttftMs: firstAt ? firstAt - started : undefined,
      totalMs: Date.now() - started,
      tokens,
      error: control.signal.aborted ? `no response within ${input.timeoutMs}ms` : String(err),
    }
  } finally {
    clearTimeout(timer)
  }
}
