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
}

export type Draft = {
  name?: string
  shape?: Shape
  /** Slot 0 is always the king. */
  heads: Record<number, DraftHead>
  instances?: number
}

export type Step =
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
  return { kind: "name" }
}

function headCount(draft: Draft): number {
  return Object.keys(draft.heads).length
}

export function nextStep(draft: Draft, step: Step, answer: string): { draft: Draft; step: Step } {
  const next: Draft = { ...draft, heads: { ...draft.heads } }

  switch (step.kind) {
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
        if (headCount(next) >= 2) {
          const allHaveModels = Object.values(next.heads).every(h => h.model)
          if (allHaveModels) return { draft: next, step: { kind: "review" } }
        }
        return { draft: next, step }
      }
      next.heads[step.slot] = { role: answer }
      return { draft: next, step: { kind: "model", slot: step.slot } }
    }

    case "model": {
      const head = next.heads[step.slot]
      if (head) next.heads[step.slot] = { ...head, model: answer }

      // A legion has exactly two slots: the king and the repeated worker.
      if (next.shape === "legion" && step.slot === 1) {
        return { draft: next, step: { kind: "review" } }
      }
      if (headCount(next) >= MAX_HEADS) {
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
    case "name":
      return { kind: "name" }
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
      role: role?.summary ?? draftHead.role,
    }
    // Advisory heads are locked read-only. NEVER set permission on the king -
    // compileParadigm drops it silently, so offering it would be a lie.
    if (draftHead.role !== KING_ROLE_ID && (draftHead.role === "scout" || draftHead.role === "seer")) {
      head.permission = { edit: "deny" }
    }
    heads[id] = head
  }

  return {
    name: draft.name ?? "",
    description: `Crafted paradigm - ${draft.shape ?? "court"}`,
    king: ids.get(0) ?? KING_ROLE_ID,
    heads,
    routing: [],
    discipline: {},
  }
}

/**
 * Recovers a catalog role from a head id. Our own toParadigm writes "scout-1"
 * when a role repeats, and hand-written paradigms use ids like "scout-a", so a
 * single trailing "-segment" is stripped when that yields a known role. An id
 * that matches nothing is returned unchanged rather than guessed at - the model
 * step then filters with empty needs, which is honest about not knowing.
 */
export function roleIdFor(headId: string): string {
  if (getRole(headId)) return headId
  const stripped = headId.replace(/-[^-]+$/, "")
  if (stripped !== headId && getRole(stripped)) return stripped
  return headId
}

/**
 * Seeds a draft from an existing paradigm for cloning. The name is deliberately
 * left unset: install.ts would overwrite a file reusing a bundled preset name,
 * so the user must pick a new one and have it validated.
 */
export function draftFromParadigm(paradigm: Paradigm): Draft {
  const draft: Draft = { ...emptyDraft(), shape: "court" }
  draft.heads[0] = {
    role: KING_ROLE_ID,
    model: paradigm.heads[paradigm.king]?.model,
  }
  let slot = 1
  for (const [id, head] of Object.entries(paradigm.heads)) {
    if (id === paradigm.king) continue
    draft.heads[slot] = { role: roleIdFor(id), model: head.model }
    slot += 1
  }
  return draft
}
