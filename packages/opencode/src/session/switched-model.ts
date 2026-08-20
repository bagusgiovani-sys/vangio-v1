/**
 * Lets a model swap survive the agent loop's step boundary.
 *
 * Q3 of docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md, decided
 * 2026-08-20. Three findings set the problem up:
 *
 *   F10 - the loop re-reads its messages from the DB on every iteration and
 *         re-resolves `lastUser.model`, so a swap mutated into `streamInput`
 *         between retry attempts (F2) is thrown away at the next tool-call
 *         round trip, and the dead model goes out again.
 *   F11 - a durable, session-scoped override already exists and must not be
 *         rebuilt: `SessionEvent.ModelSwitched` is projected onto the
 *         `session.model` column and announced in the transcript by
 *         `message-updater` as a `model-switched` message.
 *   F12 - the loop never consults it. `currentModel()` reads that column, but
 *         only when a NEW prompt arrives without an explicit model.
 *
 * So this module answers exactly one question for the loop: has the session's
 * model been switched since the current turn began?
 *
 * WHY "SINCE THE TURN BEGAN" AND NOT "DISAGREES WITH lastUser.model". The spec
 * originally proposed the simpler rule, and it is wrong. `createUserMessage`
 * writes the row on every user message (prompt.ts:672-689, via
 * `Session.setAgentModel`), so the row is not a quiet fallback slot - it tracks
 * the live session. Measured on this machine's DB, every session carries one.
 * A row left from an earlier turn, or one holding an agent's configured model,
 * would otherwise beat the model the current turn was actually sent with.
 * Capturing a baseline before the first step reduces the question to "did
 * something move it mid-turn", which is precisely the event worth honouring.
 *
 * The baseline can go stale if a second prompt is queued onto a run already in
 * flight: the row moves to the new prompt's model and never matches the
 * baseline again. That degrades to "always prefer the row", which stays correct
 * for the same reason - the row already tracks `lastUser.model` on every prompt.
 */
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Database } from "@opencode-ai/core/database/database"
import type { SessionID } from "./schema"

export namespace SwitchedModel {
  /** Exactly what the `session.model` JSON column stores (core/session/sql.ts:52-56). */
  export type Row = { id: string; providerID: string; variant?: string } | undefined

  /** The shape the loop hands to `getModel`, matching `currentModel()`'s output. */
  export type Choice = { providerID: ProviderV2.ID; modelID: ModelV2.ID; variant?: string }

  type Db = Database.Interface["db"]

  /**
   * The row as it stands right now. Deliberately a raw read rather than a call
   * to `currentModel()`: that function answers "what should a new prompt use",
   * falling through to the first user message and then the global default, and
   * those fallbacks would blur the only comparison this module cares about.
   */
  export const read = (db: Db, sessionID: SessionID): Effect.Effect<Row> =>
    db
      .select({ model: SessionTable.model })
      .from(SessionTable)
      .where(eq(SessionTable.id, sessionID))
      .get()
      .pipe(
        Effect.orDie,
        Effect.map((current) => current?.model ?? undefined),
      )

  /**
   * The model the loop should use instead of `lastUser.model`, or undefined to
   * leave the loop's own resolution alone.
   */
  export function switched(baseline: Row, current: Row): Choice | undefined {
    if (!current) return undefined
    if (same(baseline, current)) return undefined
    return {
      providerID: ProviderV2.ID.make(current.providerID),
      modelID: ModelV2.ID.make(current.id),
      // "default" and absent are the same variant. prompt.ts:677 and
      // core/session.ts:400 both already compare them this way; not doing so
      // here would read every step as a fresh switch.
      ...(current.variant && current.variant !== "default" ? { variant: current.variant } : {}),
    }
  }

  function same(a: Row, b: Row): boolean {
    if (!a || !b) return a === b
    return (
      a.providerID === b.providerID && a.id === b.id && (a.variant ?? "default") === (b.variant ?? "default")
    )
  }
}
