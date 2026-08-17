import { describe, expect, test } from "bun:test"
import { ROLES, listRoles, getRole, KING_ROLE_ID, validateRoles } from "../src/roles"

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

describe("role catalog validation", () => {
  test("throws when top-level roles key is missing", () => {
    const malformed = { version: 1 }
    expect(() => validateRoles(malformed)).toThrow(/roles.json.*roles.*key/)
  })

  test("throws when a role is missing needs object", () => {
    const malformed = {
      version: 1,
      roles: {
        badRole: {
          title: "Bad",
          summary: "Missing needs",
          mandatory: false,
          picks: [{ model: "test", why: "test" }],
        },
      },
    }
    expect(() => validateRoles(malformed)).toThrow(/roles.json.*badRole.*needs/)
  })

  test("throws when a role has an empty picks array", () => {
    const malformed = {
      version: 1,
      roles: {
        badRole: {
          title: "Bad",
          summary: "Empty picks",
          mandatory: false,
          needs: {},
          picks: [],
        },
      },
    }
    expect(() => validateRoles(malformed)).toThrow(/roles.json.*badRole.*picks/)
  })

  test("throws when a pick is missing why field", () => {
    const malformed = {
      version: 1,
      roles: {
        badRole: {
          title: "Bad",
          summary: "Missing why",
          mandatory: false,
          needs: {},
          picks: [{ model: "test" }],
        },
      },
    }
    expect(() => validateRoles(malformed)).toThrow(/roles.json.*badRole.*pick.*why/)
  })
})
