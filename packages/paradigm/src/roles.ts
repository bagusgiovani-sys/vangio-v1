import catalog from "../roles.json"

/** The four capability axes a head can require. Mirrors the spec's Section 1. */
export type Needs = {
  minContext?: number
  minOutput?: number
  tools?: boolean
  /** Modality names, e.g. ["image"]. */
  attachment?: string[]
}

export type Pick = {
  model: string
  why: string
}

export type Role = {
  id: string
  title: string
  summary: string
  mandatory: boolean
  needs: Needs
  picks: Pick[]
}

export type RoleCatalog = {
  version: number
  roles: Role[]
}

export const KING_ROLE_ID = "king"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Validates the shape of roles.json at load time, throwing with descriptive errors. */
function validateRoleCatalog(input: unknown): Record<string, Omit<Role, "id">> {
  if (!isRecord(input)) throw new Error("roles.json must be an object")

  const rolesValue = (input as Record<string, unknown>)["roles"]
  if (!isRecord(rolesValue)) throw new Error("roles.json: top-level 'roles' key must be an object")

  for (const [id, roleValue] of Object.entries(rolesValue)) {
    if (!isRecord(roleValue)) throw new Error(`roles.json: role "${id}" must be an object`)

    const needs = roleValue["needs"]
    if (!isRecord(needs)) throw new Error(`roles.json: role "${id}" must have a 'needs' object`)

    const picks = roleValue["picks"]
    if (!Array.isArray(picks) || picks.length === 0) {
      throw new Error(`roles.json: role "${id}" must have a non-empty 'picks' array`)
    }

    for (let i = 0; i < picks.length; i++) {
      const pick = picks[i]
      if (!isRecord(pick)) throw new Error(`roles.json: role "${id}" pick #${i} must be an object`)

      const model = pick["model"]
      if (typeof model !== "string" || model.length === 0) {
        throw new Error(`roles.json: role "${id}" pick #${i} must have a non-empty 'model' string`)
      }

      const why = pick["why"]
      if (typeof why !== "string" || why.length === 0) {
        throw new Error(`roles.json: role "${id}" pick #${i} must have a non-empty 'why' string`)
      }
    }
  }

  return rolesValue as Record<string, Omit<Role, "id">>
}

/**
 * roles.json is bundled and read in place - deliberately NOT copied into
 * ~/.config/vangio/, so a reinstall can never overwrite user edits.
 */
const validatedRoles = validateRoleCatalog(catalog)

export const ROLES: RoleCatalog = {
  version: (catalog as { version: number }).version,
  roles: Object.entries(validatedRoles).map(([id, role]) => ({ id, ...role })),
}

export function listRoles(): Role[] {
  return ROLES.roles
}

export function getRole(id: string): Role | undefined {
  return ROLES.roles.find((role) => role.id === id)
}

/**
 * Exported for testing the validation guard. Throws with descriptive errors
 * if the input structure is malformed.
 */
export function validateRoles(input: unknown): Record<string, Omit<Role, "id">> {
  return validateRoleCatalog(input)
}
