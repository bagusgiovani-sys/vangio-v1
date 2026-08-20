import type { Head, Paradigm } from "./schema"

export type AgentEntry = {
  mode?: string
  model?: string
  description?: string
  prompt?: string
  permission?: Record<string, unknown>
  /**
   * How a head's fallback declaration reaches the session layer.
   *
   * `Agent.Info.options` is already `Record<string, unknown>` and already flows
   * from config to runtime, so the chain travels WITH the agent it belongs to -
   * always consistent with whatever compiled at boot, and the session layer
   * never has to learn what a paradigm is.
   *
   * Written explicitly rather than leaning on the config schema's unknown-key
   * sweep (`core/src/v1/config/agent.ts:62-66`): that sweep is a DECODE
   * transform and this plugin's config hook fires after decode, so a bare
   * `fallback` key on the entry would never be swept anywhere.
   */
  options?: Record<string, unknown>
}

/**
 * Only present when the head actually declares something - never an empty bag.
 *
 * `shiftAuto` rides along only when the paradigm explicitly turns auto-swap
 * OFF. Default-on is the reading everywhere else (schema.shiftAuto), so
 * emitting it when true would put a bag on every entry of every existing
 * paradigm to say nothing.
 */
function headOptions(head: Head, paradigm: Paradigm): Record<string, unknown> | undefined {
  const options: Record<string, unknown> = {}
  if (head.needs) options["needs"] = head.needs
  if (head.fallback) options["fallback"] = head.fallback
  if (paradigm.shift?.auto === false) options["shiftAuto"] = false
  return Object.keys(options).length > 0 ? options : undefined
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
  const options = headOptions(head, paradigm)
  if (options) entry.options = options
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
  // The king becomes every primary, so its declaration has to reach all of them.
  const kingOptions = headOptions(king, paradigm)
  for (const primary of options.primaries ?? DEFAULT_PRIMARIES) {
    result[primary] = { model: king.model, prompt: doctrine }
    if (kingOptions) result[primary]!.options = kingOptions
  }

  return result
}
