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

// Added 2026-08-20, when the derived fallback went live. Before it, a walled
// head just showed an upsell. Now it degrades on its own - which turns an
// undeclared capability into a hazard rather than an omission: a seer degraded
// to a text-only model does not error, it confidently describes an image it
// cannot see.
//
// `needs` is declared and `fallback` deliberately is NOT. Capability
// requirements are durable; model-id lists rot. Both `ling-3.0-tiny-free` and
// `kimi-k2.5-free` were written down as good picks and were deprecated out from
// under that claim within days, so a declared chain would need re-auditing at
// every merge while `needs` keeps describing the role correctly forever.
describe("shipped paradigms declare what their heads need", () => {
  const names = ["code-review", "documenter", "gryphon", "premium-gryphon", "researcher", "web-dev"]

  test("every head in every preset requires tool calling", async () => {
    for (const name of names) {
      const paradigm = await load(name)
      for (const [id, head] of Object.entries(paradigm.heads)) {
        expect(`${name}/${id}: ${head.needs?.tools}`).toBe(`${name}/${id}: true`)
      }
    }
  })

  // The hazard this whole block exists for. There is exactly one runnable free
  // Zen model that accepts images, so if it walls, the honest outcome is "could
  // not degrade this head" - never a silent swap to something blind. Measured
  // 2026-08-20, zhipuai-coding-plan/glm-5v-turbo is the one other free, active,
  // image-capable model, and the derived resolver finds it without being told.
  test("the seer requires attachments, so it can never degrade to a blind model", async () => {
    const webDev = await load("web-dev")
    expect(webDev.heads["seer"]!.needs?.attachment).toBe(true)
  })

  test("no other head claims to need attachments", async () => {
    for (const name of names) {
      const paradigm = await load(name)
      for (const [id, head] of Object.entries(paradigm.heads)) {
        if (id === "seer") continue
        expect(`${name}/${id}: ${head.needs?.attachment}`).toBe(`${name}/${id}: undefined`)
      }
    }
  })

  // errors.md 2026-07-xx: a 32k output ceiling truncates real work, and the
  // implementer is the head that produces it.
  test("every warrior demands more than the 32k output class", async () => {
    for (const name of names) {
      const paradigm = await load(name)
      const warrior = paradigm.heads["warrior"]
      if (!warrior) continue
      expect(`${name}: ${(warrior.needs?.minOutput ?? 0) > 32_000}`).toBe(`${name}: true`)
    }
  })

  test("no preset pins a fallback model id, because ids rot and needs do not", async () => {
    for (const name of names) {
      const paradigm = await load(name)
      for (const [id, head] of Object.entries(paradigm.heads)) {
        expect(`${name}/${id}: ${head.fallback}`).toBe(`${name}/${id}: undefined`)
      }
    }
  })
})

// Added after laguna-s-2.1-free was retired mid-session on 2026-08-20, four
// hours after a table in the fallback spec had listed it as a good pick. It
// went `status: deprecated` in models.dev, which deletes it from the runtime
// registry, and it was bound as the scout in four presets - including the
// active one. F6 is not a historical note; it fires on a scale of hours.
//
// This cannot assert against a live catalog without making the suite depend on
// the network, so it guards the two ids known to have died instead. When the
// next one goes, add it here rather than only fixing the binding.
describe("shipped paradigms avoid models known to be retired", () => {
  const RETIRED = ["laguna-s-2.1-free", "kimi-k2.5-free", "north-mini-code-free", "ling-3.0-tiny-free"]
  const names = ["code-review", "documenter", "gryphon", "premium-gryphon", "researcher", "web-dev"]

  test("no head is bound to a model that has been retired", async () => {
    for (const name of names) {
      const paradigm = await load(name)
      for (const [id, head] of Object.entries(paradigm.heads)) {
        for (const dead of RETIRED) {
          expect(`${name}/${id} bound to ${dead}: ${head.model.includes(dead)}`).toBe(
            `${name}/${id} bound to ${dead}: false`,
          )
        }
      }
    }
  })

  // The researcher fans three scouts in parallel specifically to learn whether
  // Zen's daily bucket is per-model or shared (Q1). Collapsing two of them onto
  // one model would quietly destroy the only instrumentation that answers it.
  test("the researcher's three scouts stay on three different models", async () => {
    const researcher = await load("researcher")
    const scouts = Object.entries(researcher.heads)
      .filter(([id]) => id.startsWith("scout"))
      .map(([, head]) => head.model)
    expect(scouts).toHaveLength(3)
    expect(new Set(scouts).size).toBe(3)
  })
})
