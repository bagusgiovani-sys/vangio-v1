import { describe, expect, test } from "bun:test"
import { readFile } from "fs/promises"
import path from "path"
import { parseParadigm } from "../src/schema"
import { compileParadigm } from "../src/compile"

const root = path.join(import.meta.dir, "..", "..", "..", "paradigms")

async function load(name: string) {
  const parsed = parseParadigm(JSON.parse(await readFile(path.join(root, `${name}.json`), "utf8")))
  if (!parsed.ok) throw new Error(parsed.errors.join("; "))
  return parsed.value
}

describe("shipped paradigms", () => {
  test("gryphon is valid and uses only free models", async () => {
    const gryphon = await load("gryphon")
    expect(gryphon.king).toBe("king")
    for (const head of Object.values(gryphon.heads)) {
      expect(head.model).toContain("free")
    }
  })

  test("scout cannot edit", async () => {
    const gryphon = await load("gryphon")
    expect(gryphon.heads["scout"]!.permission).toEqual({ edit: "deny" })
  })

  test("gryphon does not occupy a Tab slot", async () => {
    const compiled = compileParadigm(await load("gryphon"))
    expect(compiled["gryphon"]).toBeUndefined()
    expect(Object.entries(compiled).filter(([, e]) => e.mode === "subagent").length).toBe(2)
  })

  test("premium differs from gryphon ONLY in the king head", async () => {
    const free = await load("gryphon")
    const paid = await load("premium-gryphon")
    expect(paid.heads["king"]!.model).not.toBe(free.heads["king"]!.model)
    // every other head must be byte-identical - that is the point of a head swap
    for (const id of Object.keys(free.heads)) {
      if (id === "king") continue
      expect(paid.heads[id]).toEqual(free.heads[id])
    }
    expect(paid.routing).toEqual(free.routing)
    expect(paid.discipline).toEqual(free.discipline)
  })
})
