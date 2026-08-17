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

/**
 * roles.json is bundled and read in place - deliberately NOT copied into
 * ~/.config/vangio/, so a reinstall can never overwrite user edits.
 */
export const ROLES: RoleCatalog = {
  version: (catalog as { version: number }).version,
  roles: Object.entries((catalog as { roles: Record<string, Omit<Role, "id">> }).roles).map(
    ([id, role]) => ({ id, ...role }),
  ),
}

export function listRoles(): Role[] {
  return ROLES.roles
}

export function getRole(id: string): Role | undefined {
  return ROLES.roles.find((role) => role.id === id)
}
