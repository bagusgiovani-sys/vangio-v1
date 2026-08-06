import type { Head, Paradigm } from "./schema"

export type AgentEntry = {
  mode?: string
  model?: string
  description?: string
  prompt?: string
  permission?: Record<string, unknown>
}

export const DEFAULT_PRIMARIES = ["build", "plan"]

export function renderDoctrine(paradigm: Paradigm): string {
  const lines: string[] = []
  lines.push(`PARADIGM: ${paradigm.name}`)
  if (paradigm.description) lines.push(paradigm.description)
  lines.push("")
  lines.push("YOUR HEADS:")
  for (const [id, head] of Object.entries(paradigm.heads)) {
    const marker = id === paradigm.king ? "(your own mind)" : `@${id}`
    lines.push(`- ${id} ${marker} [${head.model}]: ${head.role}`)
  }
  if (paradigm.routing.length > 0) {
    lines.push("")
    lines.push("ROUTING RULES:")
    paradigm.routing.forEach((rule, index) => lines.push(`${index + 1}. ${rule}`))
  }
  const discipline = Object.entries(paradigm.discipline)
  if (discipline.length > 0) {
    lines.push("")
    lines.push("TOKEN DISCIPLINE:")
    for (const [id, note] of discipline) lines.push(`- ${id}: ${note}`)
  }
  return lines.join("\n")
}

function subagentEntry(id: string, head: Head, paradigm: Paradigm): AgentEntry {
  const entry: AgentEntry = {
    mode: "subagent",
    model: head.model,
    description: `${paradigm.name} paradigm - ${head.role}`,
  }
  if (head.prompt) entry.prompt = head.prompt
  if (head.permission) entry.permission = head.permission
  return entry
}

export function compileParadigm(
  paradigm: Paradigm,
  options: { primaries?: string[] } = {},
): Record<string, AgentEntry> {
  const result: Record<string, AgentEntry> = {}

  for (const [id, head] of Object.entries(paradigm.heads)) {
    if (id === paradigm.king) continue
    result[id] = subagentEntry(id, head, paradigm)
  }

  const king = paradigm.heads[paradigm.king]
  if (!king) return result

  const doctrine = renderDoctrine(paradigm)
  for (const primary of options.primaries ?? DEFAULT_PRIMARIES) {
    result[primary] = { model: king.model, prompt: doctrine }
  }

  return result
}
