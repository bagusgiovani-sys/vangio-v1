import os from "os"
import path from "path"
import { compileParadigm, type AgentEntry } from "./compile"
import { listParadigms, readActiveName } from "./load"
import type { Paradigm } from "./schema"

export const PARADIGM_DIR = path.join(os.homedir(), ".config", "vangio", "paradigms")
export const ACTIVE_MARKER = path.join(os.homedir(), ".local", "share", "vangio", "paradigm-active")

export type ApplyDeps = {
  paradigms: Record<string, Paradigm>
  errors: string[]
  active: string | undefined
}

export async function applyParadigm(cfg: any, deps: ApplyDeps): Promise<void> {
  for (const error of deps.errors) console.error(`vangio-paradigm: ${error}`)
  if (!deps.active) return
  const paradigm = deps.paradigms[deps.active]
  if (!paradigm) {
    console.error(`vangio-paradigm: active paradigm "${deps.active}" not found`)
    return
  }

  const compiled = compileParadigm(paradigm)
  cfg.agent = cfg.agent ?? {}

  for (const [id, entry] of Object.entries(compiled) as [string, AgentEntry][]) {
    const existing = cfg.agent[id] ?? {}
    const merged: Record<string, unknown> = { ...entry, ...existing }
    if (entry.prompt) {
      merged["prompt"] = existing.prompt ? `${existing.prompt}\n\n${entry.prompt}` : entry.prompt
    }
    // `...existing` is a SHALLOW spread, so a user who sets agent.<id>.options
    // for any unrelated reason replaces the paradigm's bag wholesale and the
    // fallback chain disappears with no error at all. Merge key-by-key instead,
    // user still winning per key - the same treatment `prompt` gets above, and
    // for the same reason.
    if (entry.options || existing.options) {
      merged["options"] = { ...entry.options, ...existing.options }
    }
    cfg.agent[id] = merged
  }
}

export default {
  id: "vangio-paradigm",
  server: async () => ({
    config: async (cfg: any) => {
      const { paradigms, errors } = await listParadigms(PARADIGM_DIR)
      const active = await readActiveName(ACTIVE_MARKER)
      await applyParadigm(cfg, { paradigms, errors, active })
    },
  }),
}
