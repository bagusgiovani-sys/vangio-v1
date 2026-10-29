import { describe, expect, test } from "bun:test"
import { hasRoleModels, roleModelPatch, runningRoleModel } from "../../tui/src/util/role-models"
import { applyParadigm } from "../src/index"
import type { Paradigm } from "../src/schema"

const paradigm: Paradigm = {
  name: "gryphon",
  king: "king",
  heads: {
    king: { role: "lead", model: "free/king" },
    warrior: { role: "implement", model: "free/warrior" },
    scout: { role: "research", model: "free/scout", permission: { edit: "deny" } },
  },
  routing: [],
  discipline: {},
}

describe("role model selection", () => {
  test("only offers role switching when the three role agents exist", () => {
    expect(hasRoleModels([{ name: "build" }, { name: "plan" }])).toBe(false)
    expect(hasRoleModels([{ name: "build" }, { name: "warrior" }, { name: "scout" }])).toBe(true)
  })

  test("King updates both primary modes without changing either worker", async () => {
    const config = roleModelPatch("king", { providerID: "free", modelID: "new/king" })
    await applyParadigm(config, { active: "gryphon", paradigms: { gryphon: paradigm }, errors: [] })
    expect(config.agent?.build?.model).toBe("free/new/king")
    expect(config.agent?.plan?.model).toBe("free/new/king")
    expect(config.agent?.warrior?.model).toBe("free/warrior")
    expect(config.agent?.scout?.model).toBe("free/scout")
  })

  test("Scout switches its real compiled binding and retains read-only permission", async () => {
    const config = roleModelPatch("scout", { providerID: "free", modelID: "backup" })
    await applyParadigm(config, { active: "gryphon", paradigms: { gryphon: paradigm }, errors: [] })
    expect(config.agent?.scout?.model).toBe("free/backup")
    expect(config.agent?.scout?.permission).toEqual({ edit: "deny" })
    expect(config.agent?.warrior?.model).toBe("free/warrior")
    expect(config.agent?.build?.model).toBe("free/king")
  })
})

function session(id: string, agent: string, parentID?: string): Parameters<typeof runningRoleModel>[0]["sessions"][number] {
  return {
    id, agent, parentID, slug: id, projectID: "project", directory: ".", title: id, version: "1",
    model: { providerID: "free", id: `${agent}-backup` },
    time: { created: 1, updated: 2 },
  }
}

test("running model reflects a child backup, excluding other parents and idle history", () => {
  const sessions = [session("root", "build"), session("child", "scout", "root"), session("other", "scout", "elsewhere")]
  expect(runningRoleModel({ role: "scout", sessionID: "root", sessions, status: { child: { type: "busy" }, other: { type: "busy" } } }))
    .toEqual({ providerID: "free", modelID: "scout-backup" })
  expect(runningRoleModel({ role: "scout", sessionID: "root", sessions, status: { child: { type: "idle" }, other: { type: "busy" } } }))
    .toBeUndefined()
  expect(runningRoleModel({ role: "king", sessionID: "root", sessions, status: { root: { type: "busy" } } }))
    .toEqual({ providerID: "free", modelID: "build-backup" })
})
