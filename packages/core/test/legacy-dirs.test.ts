import { afterEach, describe, expect, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { migrateLegacyDirs, MIGRATION_MARKER } from "../src/legacy-dirs"

let root: string

async function setup() {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "vangio-legacy-dirs-"))
  const from = {
    config: path.join(root, "old", "config"),
    data: path.join(root, "old", "data"),
    state: path.join(root, "old", "state"),
  }
  const to = {
    config: path.join(root, "new", "config"),
    data: path.join(root, "new", "data"),
    state: path.join(root, "new", "state"),
  }
  for (const dir of Object.values(to)) await fs.mkdir(dir, { recursive: true })
  return { from, to }
}

async function seed(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
}

function exists(target: string) {
  return fs.access(target).then(
    () => true,
    () => false,
  )
}

afterEach(async () => {
  if (root) await fs.rm(root, { recursive: true, force: true })
})

describe("migrateLegacyDirs", () => {
  test("copies legacy config, data, and state into the new dirs and writes the marker", async () => {
    const { from, to } = await setup()
    await seed(path.join(from.config, "opencode.json"), `{"model":"a/b"}`)
    await seed(path.join(from.config, "themes", "neon.json"), `{}`)
    await seed(path.join(from.data, "opencode.db"), "db")
    await seed(path.join(from.state, "model.json"), `{"recent":[]}`)

    const result = await migrateLegacyDirs({ from, to })

    expect(result.status).toBe("migrated")
    expect(await fs.readFile(path.join(to.config, "opencode.json"), "utf8")).toBe(`{"model":"a/b"}`)
    expect(await fs.readFile(path.join(to.config, "themes", "neon.json"), "utf8")).toBe(`{}`)
    expect(await fs.readFile(path.join(to.data, "opencode.db"), "utf8")).toBe("db")
    expect(await fs.readFile(path.join(to.state, "model.json"), "utf8")).toBe(`{"recent":[]}`)
    expect(await exists(path.join(to.state, MIGRATION_MARKER))).toBe(true)
  })

  test("skips the legacy log dir under data", async () => {
    const { from, to } = await setup()
    await seed(path.join(from.data, "log", "2026.log"), "old logs")
    await seed(path.join(from.data, "opencode.db"), "db")

    await migrateLegacyDirs({ from, to })

    expect(await exists(path.join(to.data, "log"))).toBe(false)
    expect(await exists(path.join(to.data, "opencode.db"))).toBe(true)
  })

  test("never overwrites files that already exist at the destination", async () => {
    const { from, to } = await setup()
    await seed(path.join(from.config, "opencode.json"), "legacy")
    await seed(path.join(to.config, "opencode.json"), "keep me")
    await seed(path.join(from.config, "themes", "neon.json"), "legacy theme")
    await seed(path.join(to.config, "themes", "other.json"), "new theme")

    await migrateLegacyDirs({ from, to })

    expect(await fs.readFile(path.join(to.config, "opencode.json"), "utf8")).toBe("keep me")
    // merge into existing dirs still brings over files that are only in the legacy dir
    expect(await fs.readFile(path.join(to.config, "themes", "neon.json"), "utf8")).toBe("legacy theme")
    expect(await fs.readFile(path.join(to.config, "themes", "other.json"), "utf8")).toBe("new theme")
  })

  test("is a no-op once the marker exists", async () => {
    const { from, to } = await setup()
    await seed(path.join(from.config, "opencode.json"), "legacy")
    await migrateLegacyDirs({ from, to })

    await seed(path.join(from.config, "added-later.json"), "late")
    const result = await migrateLegacyDirs({ from, to })

    expect(result.status).toBe("skipped")
    expect(await exists(path.join(to.config, "added-later.json"))).toBe(false)
  })

  test("writes the marker even when there is nothing to migrate", async () => {
    const { from, to } = await setup()

    const result = await migrateLegacyDirs({ from, to })

    expect(result.status).toBe("migrated")
    expect(result.copied).toBe(0)
    expect(await exists(path.join(to.state, MIGRATION_MARKER))).toBe(true)
  })
})
