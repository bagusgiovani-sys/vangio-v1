import { describe, expect, test } from "bun:test"
import { ROLES, listRoles, getRole, KING_ROLE_ID } from "../src/roles"

describe("role catalog", () => {
  test("exposes exactly the four archetypes", () => {
    expect(listRoles().map((r) => r.id).sort()).toEqual(["king", "scout", "seer", "warrior"])
  })

  test("king is the only mandatory role", () => {
    expect(listRoles().filter((r) => r.mandatory).map((r) => r.id)).toEqual([KING_ROLE_ID])
  })

  test("every role carries needs and at least one pick", () => {
    for (const role of listRoles()) {
      expect(role.needs).toBeDefined()
      expect(role.picks.length).toBeGreaterThan(0)
      for (const pick of role.picks) {
        expect(pick.model.length).toBeGreaterThan(0)
        expect(pick.why.length).toBeGreaterThan(0)
      }
    }
  })

  test("seer is the only role requiring an image attachment", () => {
    const withImage = listRoles().filter((r) => r.needs.attachment?.includes("image"))
    expect(withImage.map((r) => r.id)).toEqual(["seer"])
  })

  test("warrior demands the highest output floor", () => {
    const warrior = getRole("warrior")
    const scout = getRole("scout")
    expect(warrior!.needs.minOutput!).toBeGreaterThan(scout!.needs.minOutput!)
  })

  test("getRole returns undefined for an unknown id", () => {
    expect(getRole("bishop")).toBeUndefined()
  })

  test("ROLES.version is a number", () => {
    expect(typeof ROLES.version).toBe("number")
  })
})
