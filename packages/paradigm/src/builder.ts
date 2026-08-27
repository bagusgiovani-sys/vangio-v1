/**
 * v6 — turning a goal sentence into a Craft draft.
 *
 * Everything here is pure so it can be tested without a running TUI or a live
 * model, exactly like craft.ts. The network call itself lives in tui.tsx.
 *
 * The load-bearing decision of the whole feature is what this schema does NOT
 * contain: there is no place for the model to name a model. Asked for a model
 * id, an LLM will confidently answer `north-mini-code-free` or
 * `deepseek-v4-flash-free` — plausible, in its training data, and not bindable.
 * Four such bindings have already died silently in this project. So the model
 * returns a SHAPE, and the existing resolver binds the models against the
 * runnable catalog. A generator that cannot name a model cannot reproduce that
 * failure class.
 */

import { getRole, listRoles, KING_ROLE_ID } from "./roles"
import { modelOptions, modelRef, isFree, type CandidateModel } from "./resolve"
import { validateName, BUNDLED_NAMES, MAX_HEADS, type Draft, type Shape } from "./craft"

/** The king occupies slot 0 and is never generated, so six remain. */
export const MAX_GENERATED_HEADS = MAX_HEADS - 1

export type GeneratedHead = {
  role: string
  purpose: string
}

export type Generated = {
  name: string
  description: string
  shape: Shape
  heads: GeneratedHead[]
  routing: string[]
  discipline: Record<string, string>
}

const SHAPES: Shape[] = ["court", "legion"]

/** The roles a generated head may take: every role except the mandatory king. */
function generatableRoles() {
  return listRoles().filter((role) => !role.mandatory)
}

/**
 * Sent as `format.schema` on the prompt. The engine turns it into a
 * StructuredOutput tool with toolChoice "required" (prompt.ts:1271-1341), so
 * this is enforced by tool calling rather than by a response_format the
 * provider may silently drop.
 */
export const GENERATED_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["name", "description", "shape", "heads"],
  properties: {
    name: {
      type: "string",
      description: "lowercase letters, numbers and hyphens only - this becomes the filename",
    },
    description: {
      type: "string",
      description: "one sentence saying what this team is for",
    },
    shape: {
      type: "string",
      enum: SHAPES,
      description: "court = distinct duties; legion = interchangeable workers in parallel",
    },
    heads: {
      type: "array",
      minItems: 1,
      maxItems: MAX_GENERATED_HEADS,
      description: "the helpers working under the leader, who already exists and is not listed here",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["role", "purpose"],
        properties: {
          role: { type: "string", enum: generatableRoles().map((role) => role.id) },
          purpose: { type: "string", description: "what this one does, in one short phrase" },
        },
      },
    },
    routing: {
      type: "array",
      items: { type: "string" },
      description: "rules of the form 'situation -> who handles it'",
    },
    discipline: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "budget guidance keyed by role id",
    },
  },
}

export function builderSystem(): string {
  const roles = generatableRoles()
    .map((role) => `- ${role.id} (${role.title}): ${role.summary}`)
    .join("\n")

  return [
    "You assemble small teams of AI agents. The user states a goal; you return the team.",
    "",
    `Every team already has a ${KING_ROLE_ID} who plans, decides and reviews. It is created for you.`,
    "Do NOT include it. You choose only the helpers working under it.",
    "",
    "The roles you may choose from, and nothing else:",
    roles,
    "",
    `Choose between 1 and ${MAX_GENERATED_HEADS} helpers. Repeat a role when the work genuinely`,
    "fans out - three researchers reading in parallel is a legion, one writer and one",
    "researcher is a court.",
    "",
    "Pick the fewest helpers that cover the goal. A role you cannot justify in one phrase",
    "does not belong on the team.",
  ].join("\n")
}

export function builderRequest(goal: string, existing: string[]): string {
  const taken =
    existing.length > 0
      ? `\n\nThese names are already taken and must NOT be used: ${existing.join(", ")}.`
      : ""
  return `Assemble a team for this goal:\n\n${goal.trim()}${taken}`
}

/**
 * Turn whatever the model called the team into a legal paradigm name, or give
 * up.
 *
 * Measured 2026-08-27: hy3-free answered "BraTok Court" and nemotron-3.5
 * answered "TikTok Bra Sales Video Team". Both teams were good; only the names
 * were unusable. Rejecting a whole draft over capitalisation is the wrong
 * trade, and asking the model again costs 30 seconds for a problem a regex
 * solves.
 *
 * Sanitising also closes a path-traversal shape by construction rather than by
 * rejection: every character outside [a-z0-9] becomes a hyphen, so "../escape"
 * can only ever come out as "escape".
 */
export function sanitiseName(raw: string, existing: string[]): string | undefined {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  if (base.length === 0) return undefined

  // Bundled names are refused rather than overwritten: install.ts copies over
  // those six filenames on every install, so a user file with one of those
  // names is silently reverted.
  const taken = new Set([...existing, ...BUNDLED_NAMES])
  if (!taken.has(base)) return base

  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  return undefined
}

export type ParseGeneratedResult =
  | { ok: true; value: Generated }
  | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Structural failures reject the whole draft, because a draft the wizard cannot
 * paint is worse than none. Enrichment failures (a stray number in `routing`)
 * are filtered instead — losing one routing line is not worth discarding a team
 * the user is about to review and edit anyway.
 */
export function parseGenerated(
  input: unknown,
  opts: { existing: string[] },
): ParseGeneratedResult {
  if (!isRecord(input)) return { ok: false, errors: ["generated paradigm must be an object"] }

  const errors: string[] = []

  const rawName = input["name"]
  let name: string | undefined
  if (typeof rawName !== "string") {
    errors.push("name must be a string")
  } else {
    name = sanitiseName(rawName, opts.existing)
    if (name === undefined) {
      errors.push(`name "${rawName}" has nothing usable in it`)
    } else {
      // Belt and braces: sanitiseName is supposed to satisfy the wizard's own
      // validator by construction, so a failure here is a bug in this file
      // rather than a bad answer from the model.
      const problem = validateName(name, opts.existing)
      if (problem) errors.push(problem)
    }
  }

  const description = input["description"]
  if (typeof description !== "string" || description.trim().length === 0) {
    errors.push("description must be a non-empty string")
  }

  const shape = input["shape"]
  if (typeof shape !== "string" || !SHAPES.includes(shape as Shape)) {
    errors.push(`shape must be one of: ${SHAPES.join(", ")}`)
  }

  const rawHeads = input["heads"]
  const heads: GeneratedHead[] = []
  if (!Array.isArray(rawHeads)) {
    errors.push("heads must be an array")
  } else if (rawHeads.length === 0) {
    errors.push("heads must contain at least one head - a king alone is not a team")
  } else if (rawHeads.length > MAX_GENERATED_HEADS) {
    errors.push(`heads must contain at most ${MAX_GENERATED_HEADS} heads, got ${rawHeads.length}`)
  } else {
    for (let i = 0; i < rawHeads.length; i++) {
      const head = rawHeads[i]
      if (!isRecord(head)) {
        errors.push(`head #${i} must be an object`)
        continue
      }
      const role = head["role"]
      if (typeof role !== "string") {
        errors.push(`head #${i} must have a role`)
        continue
      }
      if (role === KING_ROLE_ID) {
        errors.push(`head #${i} may not be "${KING_ROLE_ID}" - the king is not generated`)
        continue
      }
      if (!getRole(role)) {
        errors.push(`head #${i} has unknown role "${role}"`)
        continue
      }
      const purpose = head["purpose"]
      if (typeof purpose !== "string" || purpose.trim().length === 0) {
        errors.push(`head #${i} ("${role}") must have a non-empty purpose`)
        continue
      }
      heads.push({ role, purpose: purpose.trim() })
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  const routing = Array.isArray(input["routing"])
    ? input["routing"].filter((entry): entry is string => typeof entry === "string")
    : []
  const discipline = isRecord(input["discipline"])
    ? (Object.fromEntries(
        Object.entries(input["discipline"]).filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>)
    : {}

  return {
    ok: true,
    value: {
      name: name as string,
      description: (description as string).trim(),
      shape: shape as Shape,
      heads,
      routing,
      discipline,
    },
  }
}

/**
 * The binding half of "the LLM picks the team, the resolver picks the models".
 * Reuses the exact ranking Craft's model step shows the user, so a generated
 * head and a hand-picked one can never disagree about what the best model for
 * a role is. Returns undefined when nothing runnable satisfies the role's
 * needs - the caller reports that head rather than binding it to something
 * that will fail at first prompt.
 */
export function pickForRole(roleId: string, models: CandidateModel[]): string | undefined {
  const role = getRole(roleId)
  if (!role) return undefined
  const options = modelOptions({ needs: role.needs, picks: role.picks, models })
  return options.find((option) => !option.disabled)?.model
}

/**
 * The order to try free models in when the king cannot produce structured
 * output.
 *
 * Ranked as a SCOUT rather than by catalog order, because the builder's job is
 * scout-shaped: one small structured answer, where speed and cheapness matter
 * far more than either limit. Reusing that role's curated picks means this
 * ordering is maintained in exactly one place - roles.json - instead of a
 * second ranking drifting away from it.
 *
 * It matters: measured 2026-08-27, hy3-free answered in 28s and mimo-v2.5-free
 * in 12s, while nemotron-3.5-lightning-free took 135s. Catalog order put the
 * slow one first and blew a 300s budget.
 */
export function builderFallbacks(models: CandidateModel[]): string[] {
  const scout = getRole("scout")
  if (!scout) return models.filter(isFree).map(modelRef)
  return modelOptions({ needs: scout.needs, picks: scout.picks, models, allowPaid: false })
    .filter((option) => !option.disabled)
    .map((option) => option.model)
}

/** Given a role id, the model this machine should bind it to - or undefined. */
export type PickModel = (roleId: string) => string | undefined

export type ToDraftResult = {
  draft: Draft
  /** Roles nothing runnable could satisfy. Reported, never silently swallowed. */
  unbindable: string[]
}

/**
 * The king is prepended here rather than generated, and every head is bound
 * through `pick` — the caller's view of the runnable catalog. A role with no
 * runnable model is DROPPED and named, following the rule v5 settled on for
 * Craft's model list: a failure stays visible with its reason, never disappears.
 *
 * Slots are renumbered after dropping so they stay contiguous from 0. A hole
 * would make stepBack land on a slot that is not there.
 */
export function toDraft(generated: Generated, pick: PickModel, goal?: string): ToDraftResult {
  const wanted = [{ role: KING_ROLE_ID, purpose: undefined as string | undefined }].concat(
    generated.heads.map((head) => ({ role: head.role, purpose: head.purpose })),
  )

  const unbindable: string[] = []
  const heads: Draft["heads"] = {}
  let slot = 0

  for (const entry of wanted) {
    const model = pick(entry.role)
    if (!model) {
      if (!unbindable.includes(entry.role)) unbindable.push(entry.role)
      continue
    }
    heads[slot] = {
      role: entry.role,
      model,
      ...(entry.purpose ? { purpose: entry.purpose } : {}),
    }
    slot++
  }

  return {
    draft: {
      name: generated.name,
      shape: generated.shape,
      heads,
      description: generated.description,
      routing: generated.routing,
      discipline: generated.discipline,
      ...(goal ? { goal } : {}),
    },
    unbindable,
  }
}
