import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, writeFile, readFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { listParadigms, readActiveName, writeActiveName, writeParadigm } from "../src/load"
import type { Paradigm } from "../src/schema"

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "paradigm-"))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const good = {
  name: "gryphon",
  king: "king",
  heads: { king: { model: "m/king", role: "reason" }, warrior: { model: "m/war", role: "implement" } },
  routing: [],
  discipline: {},
}

describe("listParadigms", () => {
  test("loads valid paradigm files keyed by name", async () => {
    const p = path.join(dir, "paradigms")
    await mkdir(p, { recursive: true })
    await writeFile(path.join(p, "gryphon.json"), JSON.stringify(good))
    const result = await listParadigms(p)
    expect(Object.keys(result.paradigms)).toEqual(["gryphon"])
    expect(result.errors).toEqual([])
  })

  test("reports invalid files as errors instead of throwing", async () => {
    const p = path.join(dir, "paradigms")
    await mkdir(p, { recursive: true })
    await writeFile(path.join(p, "broken.json"), "{ not json")
    await writeFile(path.join(p, "bad.json"), JSON.stringify({ name: "bad" }))
    const result = await listParadigms(p)
    expect(Object.keys(result.paradigms)).toEqual([])
    expect(result.errors.length).toBe(2)
  })

  test("returns empty when the directory does not exist", async () => {
    const result = await listParadigms(path.join(dir, "nope"))
    expect(result.paradigms).toEqual({})
    expect(result.errors).toEqual([])
  })
})

describe("active marker", () => {
  test("round-trips a name", async () => {
    const marker = path.join(dir, "state", "paradigm-active")
    expect(await readActiveName(marker)).toBeUndefined()
    await writeActiveName(marker, "gryphon")
    expect(await readActiveName(marker)).toBe("gryphon")
  })

  test("trims whitespace and ignores an empty marker", async () => {
    const marker = path.join(dir, "state", "paradigm-active")
    await writeActiveName(marker, "  gryphon\n")
    expect(await readActiveName(marker)).toBe("gryphon")
    await writeActiveName(marker, "   ")
    expect(await readActiveName(marker)).toBeUndefined()
  })
})

describe("writeParadigm", () => {
  const sample: Paradigm = {
    name: "my-team",
    description: "a test",
    king: "king",
    heads: { king: { model: "opencode/x", role: "lead" } },
    routing: ["a -> b"],
    discipline: { self: "be brief" },
  }

  test("writes a file that listParadigms can read back", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "craft-"))
    try {
      const file = await writeParadigm(dir, sample)
      expect(file).toBe(path.join(dir, "my-team.json"))
      const { paradigms, errors } = await listParadigms(dir)
      expect(errors).toEqual([])
      expect(paradigms["my-team"]?.king).toBe("king")
      expect(paradigms["my-team"]?.routing).toEqual(["a -> b"])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("writes readable indented JSON ending in a newline", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "craft-"))
    try {
      await writeParadigm(dir, sample)
      const raw = await readFile(path.join(dir, "my-team.json"), "utf8")
      expect(raw.endsWith("\n")).toBe(true)
      expect(raw).toContain('\n  "name": "my-team"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test("creates the directory when it does not exist", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "craft-"))
    const dir = path.join(base, "nested", "paradigms")
    try {
      await writeParadigm(dir, sample)
      const { paradigms } = await listParadigms(dir)
      expect(Object.keys(paradigms)).toEqual(["my-team"])
    } finally {
      await rm(base, { recursive: true, force: true })
    }
  })
})
