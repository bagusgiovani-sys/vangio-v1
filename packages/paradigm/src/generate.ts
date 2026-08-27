/**
 * v6 — asking a model for a team, and degrading honestly when it cannot.
 *
 * The transport is injected so this is testable without a server. tui.tsx
 * supplies the real one over `api.client.session.prompt`.
 *
 * WHY THERE IS A FALLBACK AT ALL, measured 2026-08-27 against a live server:
 *
 *   nemotron-3-ultra-free   StructuredOutputError - emitted the tool call as
 *                           TEXT: [[{"name":"StructuredOutput",...}]]
 *   nemotron-3.5-lightning-free   ok, 135s
 *   hy3-free                      ok, 28s
 *   mimo-v2.5-free                ok, 12s
 *
 * The active king is the ONE model on this machine that cannot do it. Its
 * answer was substantively right every time - it simply used the wrong
 * channel, which is the documented free-model tool-calling weakness
 * (errors.md 2026-07-17). So the spec's "runs on the active king" contract is
 * kept as the FIRST attempt, and a king that cannot produce structured output
 * degrades to one that can, out loud. That is the same mechanic Gryphon
 * already applies to heads; there is no reason the builder should be exempt.
 */

import { builderRequest, builderSystem, parseGenerated, GENERATED_SCHEMA, type Generated } from "./builder"

export type PromptOutcome = {
  /** The StructuredOutput tool's payload, when the model called it. */
  structured?: unknown
  /** The error name the engine reported, e.g. "StructuredOutputError". */
  errorName?: string
}

/** `model` undefined means "whatever this session already uses" - the king. */
export type PromptFn = (input: {
  model?: string
  system: string
  text: string
  schema: unknown
}) => Promise<PromptOutcome>

export type Attempt = {
  /** undefined for the king, which is addressed by omission, not by name. */
  model?: string
  outcome: "ok" | "no-structured-output" | "rejected" | "failed"
  detail?: string
}

export type GenerateResult =
  | { ok: true; generated: Generated; attempts: Attempt[] }
  | { ok: false; attempts: Attempt[]; errors: string[] }

/**
 * A model that answered with the wrong SHAPE is not retried on a different
 * model - a second opinion on a schema violation is usually the same opinion,
 * and the user is better served by the wizard. Only a model that could not
 * produce structured output AT ALL earns a fallback, because that is a
 * transport failure rather than a judgement one.
 */
function isTransportFailure(outcome: Attempt["outcome"]): boolean {
  return outcome === "no-structured-output" || outcome === "failed"
}

export async function generateDraft(input: {
  goal: string
  existing: string[]
  /** Model refs to try, in order, after the king. Usually the runnable list. */
  fallbacks: string[]
  prompt: PromptFn
  /** Hard ceiling on model calls, king included. Keeps a bad day bounded. */
  maxAttempts?: number
}): Promise<GenerateResult> {
  const maxAttempts = input.maxAttempts ?? 3
  const system = builderSystem()
  const text = builderRequest(input.goal, input.existing)
  const attempts: Attempt[] = []

  // undefined first: the king, addressed by omitting the override.
  const candidates: Array<string | undefined> = [undefined, ...input.fallbacks]

  for (const model of candidates) {
    if (attempts.length >= maxAttempts) break

    let outcome: PromptOutcome
    try {
      outcome = await input.prompt({ model, system, text, schema: GENERATED_SCHEMA })
    } catch (error) {
      attempts.push({
        model,
        outcome: "failed",
        detail: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    if (outcome.structured === undefined || outcome.structured === null) {
      attempts.push({
        model,
        outcome: "no-structured-output",
        detail: outcome.errorName ?? "no structured output",
      })
      continue
    }

    const parsed = parseGenerated(outcome.structured, { existing: input.existing })
    if (!parsed.ok) {
      attempts.push({ model, outcome: "rejected", detail: parsed.errors.join("; ") })
      // A schema violation is a judgement failure; stop rather than shop around.
      return { ok: false, attempts, errors: parsed.errors }
    }

    attempts.push({ model, outcome: "ok" })
    return { ok: true, generated: parsed.value, attempts }
  }

  return {
    ok: false,
    attempts,
    errors: attempts
      .filter((a) => isTransportFailure(a.outcome))
      .map((a) => `${a.model ?? "the active king"}: ${a.detail ?? a.outcome}`),
  }
}

/** Human sentence for the toast when a fallback, not the king, answered. */
export function degradationNotice(attempts: Attempt[]): string | undefined {
  const winner = attempts.find((a) => a.outcome === "ok")
  if (!winner || winner.model === undefined) return undefined
  const refused = attempts
    .filter((a) => a !== winner)
    .map((a) => a.model ?? "the active king")
    .join(", ")
  return `${refused} could not return a structured team, so ${winner.model} built it instead.`
}
