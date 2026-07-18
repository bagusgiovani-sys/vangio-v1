import path from "path"
import fs from "fs/promises"

export const MIGRATION_MARKER = "migrated-from-opencode.json"

export interface LegacyDirs {
  config: string
  data: string
  state: string
}

export interface MigrateResult {
  status: "migrated" | "partial" | "skipped"
  copied: number
  failed: string[]
}

function exists(target: string) {
  return fs.access(target).then(
    () => true,
    () => false,
  )
}

/**
 * One-time copy of the legacy opencode XDG directories into the vangio ones,
 * so existing installs keep their config, auth, sessions, and model history
 * across the rebrand. Never overwrites a file that already exists at the
 * destination. Copies entry-by-entry so a single bad entry can't abort the
 * rest; if any entry fails the marker is not written and the remaining
 * entries are retried on the next start.
 */
export async function migrateLegacyDirs(input: { from: LegacyDirs; to: LegacyDirs }): Promise<MigrateResult> {
  const marker = path.join(input.to.state, MIGRATION_MARKER)
  if (await exists(marker)) return { status: "skipped", copied: 0, failed: [] }

  let copied = 0
  const failed: string[] = []
  for (const key of ["config", "data", "state"] as const) {
    const from = input.from[key]
    if (!(await exists(from))) continue
    for (const entry of await fs.readdir(from)) {
      // legacy logs are transient noise; everything else moves
      if (key === "data" && entry === "log") continue
      const source = path.join(from, entry)
      try {
        await fs.cp(source, path.join(input.to[key], entry), { recursive: true, force: false, errorOnExist: false })
        copied++
      } catch {
        failed.push(source)
      }
    }
  }

  if (failed.length) return { status: "partial", copied, failed }
  await fs.writeFile(marker, JSON.stringify({ migrated_at: new Date().toISOString(), copied }, null, 2))
  return { status: "migrated", copied, failed }
}
