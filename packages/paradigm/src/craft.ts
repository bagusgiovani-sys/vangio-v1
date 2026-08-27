/**
 * The Paradigm Craft wizard, as a state machine rather than a dialog stack.
 * api.ui.dialog.replace() swaps the top of the stack and leaves depth at 1
 * (measured under ConPTY 2026-08-17), so transitions are ours to drive anyway.
 * Everything here is pure so it can be tested without a running TUI.
 */

import { getRole, KING_ROLE_ID } from "./roles"
import type { Head, Paradigm } from "./schema"

/**
 * install.ts copies paradigms/*.json over config on every install, so a
 * user file with one of these names is silently reverted. Refusing the name at
 * creation is the only place this can actually be enforced.
 */
export const BUNDLED_NAMES = [
  "gryphon",
  "premium-gryphon",
  "code-review",
  "documenter",
  "web-dev",
  "researcher",
]

const NAME_PATTERN = /^[a-z0-9-]+$/

export function validateName(name: string, existing: string[]): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "Name cannot be empty"
  if (!NAME_PATTERN.test(trimmed)) return "Use lowercase letters, numbers and hyphens only"
  if (BUNDLED_NAMES.includes(trimmed)) return `"${trimmed}" is a bundled preset - clone it instead`
  if (existing.includes(trimmed)) return `"${trimmed}" already exists`
  return undefined
}

export type Shape = "court" | "legion"

export type DraftHead = {
  role: string
  model?: string
  /** v6: the duty the builder wrote for this head, replacing the role summary. */
  purpose?: string
}

export type Draft = {
  name?: string
  shape?: Shape
  /** Slot 0 is always the king. */
  heads: Record<number, DraftHead>
  instances?: number
  /**
   * v6 enrichment. All optional, all absent for a hand-crafted draft, so the
   * wizard's own output is byte-identical to what it produced before v6.
   */
  description?: string
  routing?: string[]
  discipline?: Record<string, string>
  /** The sentence this team was generated from. Carried so v7 can read it. */
  goal?: string
}

export type Step =
  /** v6: what is this team for? Blank falls through to the v5 flow. */
  | { kind: "goal" }
  /** v6: waiting on the builder. Only the network reply moves off this step. */
  | { kind: "generating" }
  | { kind: "name" }
  | { kind: "shape" }
  | { kind: "role"; slot: number }
  | { kind: "model"; slot: number }
  | { kind: "review" }
  | { kind: "done" }

/** King plus six. Matches the approved shape rule: minimum 2 heads, up to 6 below the king. */
export const MAX_HEADS = 7

export function emptyDraft(): Draft {
  return { heads: {} }
}

export function firstStep(): Step {
  return { kind: "goal" }
}

function headCount(draft: Draft): number {
  return Object.keys(draft.heads).length
}

/**
 * The one gate on entering "review": at least two heads (king plus one), and
 * every head must have a model. Every transition into review - the "done" row,
 * the MAX_HEADS auto-advance, and the legion early-exit - must agree on this,
 * or the wizard can offer a step it will silently refuse.
 */
export function canFinish(draft: Draft): boolean {
  const heads = Object.values(draft.heads)
  return heads.length >= 2 && heads.every((h) => h.model)
}

export function nextStep(draft: Draft, step: Step, answer: string): { draft: Draft; step: Step } {
  const next: Draft = { ...draft, heads: { ...draft.heads } }

  switch (step.kind) {
    case "goal": {
      // A blank goal is how the user says "I will choose the heads myself", so
      // it must reach the v5 name step having changed nothing at all.
      const goal = answer.trim()
      if (goal.length === 0) return { draft: next, step: { kind: "name" } }
      next.goal = goal
      return { draft: next, step: { kind: "generating" } }
    }

    // Deliberately inert. The builder call resolves off-machine and the TUI
    // sets the next step from its result; letting a keystroke advance this
    // would race the reply.
    case "generating":
      return { draft: next, step }

    case "name":
      next.name = answer.trim()
      return { draft: next, step: { kind: "shape" } }

    case "shape":
      next.shape = answer === "legion" ? "legion" : "court"
      // Slot 0 is the king in both shapes, and its role is never asked.
      next.heads[0] = { role: KING_ROLE_ID }
      return { draft: next, step: { kind: "model", slot: 0 } }

    case "role": {
      // "done" is only offered once the minimum is met and all heads have models, but guard anyway.
      if (answer === "done") {
        if (canFinish(next)) return { draft: next, step: { kind: "review" } }
        return { draft: next, step }
      }
      next.heads[step.slot] = { role: answer }
      return { draft: next, step: { kind: "model", slot: step.slot } }
    }

    case "model": {
      const head = next.heads[step.slot]
      if (head) next.heads[step.slot] = { ...head, model: answer }

      // A legion has exactly two slots: the king and the repeated worker.
      if (next.shape === "legion" && step.slot === 1 && canFinish(next)) {
        return { draft: next, step: { kind: "review" } }
      }
      if (headCount(next) >= MAX_HEADS && canFinish(next)) {
        return { draft: next, step: { kind: "review" } }
      }
      return { draft: next, step: { kind: "role", slot: step.slot + 1 } }
    }

    case "review":
      return { draft: next, step: { kind: "done" } }

    default:
      return { draft: next, step }
  }
}

export function stepBack(draft: Draft, step: Step): Step {
  switch (step.kind) {
    case "goal":
      return { kind: "goal" }
    case "generating":
      return { kind: "goal" }
    case "name":
      return { kind: "goal" }
    case "shape":
      return { kind: "name" }
    case "role":
      return { kind: "model", slot: step.slot - 1 }
    case "model":
      return step.slot === 0 ? { kind: "shape" } : { kind: "role", slot: step.slot }
    case "review": {
      const slots = Object.keys(draft.heads).map(Number)
      const maxSlot = slots.length > 0 ? Math.max(...slots) : 0
      return { kind: "model", slot: maxSlot }
    }
    default:
      return step
  }
}

/**
 * Head ids are the role name, suffixed only when a role repeats, so the common
 * case reads as "warrior" rather than "warrior-1".
 */
function headIds(draft: Draft): Map<number, string> {
  const slots = Object.keys(draft.heads)
    .map(Number)
    .sort((a, b) => a - b)
  const counts = new Map<string, number>()
  for (const slot of slots) {
    const role = draft.heads[slot]!.role
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  const ids = new Map<number, string>()
  for (const slot of slots) {
    const role = draft.heads[slot]!.role
    if ((counts.get(role) ?? 0) === 1) {
      ids.set(slot, role)
      continue
    }
    const n = (seen.get(role) ?? 0) + 1
    seen.set(role, n)
    ids.set(slot, `${role}-${n}`)
  }
  return ids
}

export function toParadigm(draft: Draft): Paradigm {
  const ids = headIds(draft)
  const heads: Record<string, Head> = {}

  for (const [slotKey, draftHead] of Object.entries(draft.heads)) {
    const slot = Number(slotKey)
    const id = ids.get(slot)!
    const role = getRole(draftHead.role)
    const head: Head = {
      model: draftHead.model ?? "",
      // A generated head states its own duty; a hand-crafted one falls back to
      // the catalog summary exactly as it did before v6.
      role: draftHead.purpose ?? role?.summary ?? draftHead.role,
    }
    // Advisory heads are locked read-only. NEVER set permission on the king -
    // compileParadigm drops it silently, so offering it would be a lie.
    if (draftHead.role === "scout" || draftHead.role === "seer") {
      head.permission = { edit: "deny" }
    }
    heads[id] = head
  }

  return {
    name: draft.name ?? "",
    description: draft.description ?? `Crafted paradigm - ${draft.shape ?? "court"}`,
    king: ids.get(0) ?? KING_ROLE_ID,
    heads,
    routing: draft.routing ?? [],
    discipline: draft.discipline ?? {},
    ...(draft.goal ? { goal: draft.goal } : {}),
  }
}

/**
 * A clone is the source paradigm verbatim, under a new name - nothing else
 * changes. Kept here rather than inlined in the TUI so this exact copy
 * semantics stays unit-testable without a running TUI (see the file header):
 * routing, discipline, description, and every head's role text, prompt and
 * permission must all survive a clone unchanged.
 */
export function cloneParadigm(source: Paradigm, name: string): Paradigm {
  return { ...source, name }
}
