import type { Agent, Config, Session, SessionStatus } from "@opencode-ai/sdk/v2"

export const MODEL_ROLES = ["king", "warrior", "scout"] as const
export type ModelRole = (typeof MODEL_ROLES)[number]
export type RoleModel = { providerID: string; modelID: string }

export function hasRoleModels(agents: Pick<Agent, "name">[]) {
  return ["build", "warrior", "scout"].every((name) => agents.some((agent) => agent.name === name))
}

export function roleModelPatch(role: ModelRole, model: RoleModel): Config {
  const names = role === "king" ? ["build", "plan"] : [role]
  return {
    agent: Object.fromEntries(names.map((name) => [name, { model: `${model.providerID}/${model.modelID}` }])),
  }
}

// A running child may have switched to its backup. Idle children are history,
// not the model that will receive the next delegation.
export function runningRoleModel(input: {
  role: ModelRole
  sessionID?: string
  sessions: Session[]
  status: Record<string, SessionStatus>
}): RoleModel | undefined {
  if (!input.sessionID) return
  const active = input.sessions
    .filter((session) => {
      if (!session.model || !input.status[session.id] || input.status[session.id].type === "idle") return false
      if (input.role === "king") return session.id === input.sessionID
      return session.parentID === input.sessionID && session.agent === input.role
    })
    .sort((a, b) => b.time.updated - a.time.updated)[0]
  if (active?.model) return { providerID: active.model.providerID, modelID: active.model.id }
}
