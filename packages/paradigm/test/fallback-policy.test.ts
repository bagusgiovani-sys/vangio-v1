import { expect, test } from "bun:test"
import { parseParadigm } from "../src/schema"
import { compileParadigm } from "../src/compile"
import { applyParadigm } from "../src/index"
import { Fallback } from "../../opencode/src/session/fallback"

function input(policy: unknown) {
  return {
    name: "pair-test",
    king: "king",
    heads: Object.fromEntries(
      ["king", "warrior", "scout"].map((role) => [
        role,
        {
          model: `primary/${role}`,
          role,
          fallback: [`backup/${role}`],
          fallbackPolicy: policy,
          freeOnly: true,
          permission: role === "scout" ? { edit: "deny" } : undefined,
        },
      ]),
    ),
  }
}

test("declared-only policy and each backup reach all runtime agents", () => {
  const parsed = parseParadigm(input("declared-only"))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) throw new Error(parsed.errors.join(", "))
  const agents = compileParadigm(parsed.value)
  for (const name of ["build", "plan", "warrior", "scout"]) {
    expect(agents[name]?.options?.fallbackPolicy).toBe("declared-only")
    expect(agents[name]?.options?.freeOnly).toBe(true)
    expect(agents[name]?.options?.fallback).toEqual([`backup/${name === "build" || name === "plan" ? "king" : name}`])
  }
  expect(agents.scout?.permission).toEqual({ edit: "deny" })
})

test("invalid fallback policy is rejected instead of silently allowing catalog fallback", () => {
  for (const policy of ["typo", false, {}, []]) expect(parseParadigm(input(policy)).ok).toBe(false)
})

test("freeOnly rejects malformed flags and preserves explicit false", () => {
  for (const flag of ["true", 1, {}, []]) {
    const value = input(undefined)
    const heads = value.heads as Record<string, Record<string, unknown>>
    heads.king!.freeOnly = flag
    expect(parseParadigm(value).ok).toBe(false)
  }
  const value = input(undefined)
  value.heads.king!.freeOnly = false
  const parsed = parseParadigm(value)
  if (!parsed.ok) throw new Error(parsed.errors.join(", "))
  expect(compileParadigm(parsed.value).build?.options?.freeOnly).toBe(false)
})

test("omitted fallback policy preserves existing preset behavior", () => {
  const parsed = parseParadigm(input(undefined))
  if (!parsed.ok) throw new Error(parsed.errors.join(", "))
  expect(compileParadigm(parsed.value).build?.options?.fallbackPolicy).toBeUndefined()
})

test("policy survives config merging and stops each role after its backup is exhausted", async () => {
  const parsed = parseParadigm(input("declared-only"))
  if (!parsed.ok) throw new Error(parsed.errors.join(", "))
  const cfg: { agent: Record<string, { options?: Record<string, unknown> }> } = {
    agent: { build: { options: { temperature: 0.2 } } },
  }
  await applyParadigm(cfg, { paradigms: { "pair-test": parsed.value }, active: "pair-test", errors: [] })
  for (const name of ["build", "plan", "warrior", "scout"]) {
    const options = cfg.agent[name]!.options!
    expect(options.freeOnly).toBe(true)
    const role = name === "build" || name === "plan" ? "king" : name
    const backup = {
      id: role,
      providerID: "backup",
      cost: { input: 0, output: 0 },
      limit: { output: 100_000 },
      capabilities: { toolcall: true, attachment: false },
    }
    const base = {
      head: role,
      failed: { id: role, providerID: "primary" },
      reason: "free_tier_limit" as const,
      chain: options.fallback as string[],
      fallbackPolicy: options.fallbackPolicy as "declared-only",
      exhausted: new Set<string>(),
      swapsUsed: 0,
      lookup: () => backup,
      catalog: (): (typeof backup)[] => {
        throw new Error("undeclared catalog must not be used")
      },
    }
    expect(Fallback.resolve(base).resolution?.model).toBe(backup)
    expect(Fallback.resolve({ ...base, failed: backup, swapsUsed: 1 }).resolution).toBeUndefined()
  }
  expect(cfg.agent.build?.options?.temperature).toBe(0.2)
})
