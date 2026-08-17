import { readdir, readFile, mkdir, writeFile } from "fs/promises"
import path from "path"
import { parseParadigm, type Paradigm } from "./schema"

export async function listParadigms(
  dir: string,
): Promise<{ paradigms: Record<string, Paradigm>; errors: string[] }> {
  const paradigms: Record<string, Paradigm> = {}
  const errors: string[] = []

  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return { paradigms, errors }
  }

  for (const entry of entries.filter((e) => e.endsWith(".json")).sort()) {
    const file = path.join(dir, entry)
    let raw: unknown
    try {
      raw = JSON.parse(await readFile(file, "utf8"))
    } catch (error) {
      errors.push(`${entry}: not valid JSON (${(error as Error).message})`)
      continue
    }
    const parsed = parseParadigm(raw)
    if (!parsed.ok) {
      errors.push(`${entry}: ${parsed.errors.join("; ")}`)
      continue
    }
    paradigms[parsed.value.name] = parsed.value
  }

  return { paradigms, errors }
}

export async function readActiveName(statePath: string): Promise<string | undefined> {
  try {
    const value = (await readFile(statePath, "utf8")).trim()
    return value.length > 0 ? value : undefined
  } catch {
    return undefined
  }
}

export async function writeActiveName(statePath: string, name: string): Promise<void> {
  await mkdir(path.dirname(statePath), { recursive: true })
  await writeFile(statePath, `${name.trim()}\n`, "utf8")
}

/** Writes a paradigm as <dir>/<name>.json and returns the path written. */
export async function writeParadigm(dir: string, paradigm: Paradigm): Promise<string> {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${paradigm.name}.json`)
  await writeFile(file, `${JSON.stringify(paradigm, null, 2)}\n`, "utf8")
  return file
}
