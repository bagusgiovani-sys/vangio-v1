import { describe, expect, test, beforeEach, afterEach } from "bun:test"
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { listParadigms, readActiveName, writeActiveName } from "../src/load"

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
