import { describe, expect, test } from "bun:test"
import { validateName, BUNDLED_NAMES } from "../src/craft"

describe("validateName", () => {
  test("accepts a simple lowercase name", () => {
    expect(validateName("my-team", [])).toBeUndefined()
  })

  test("rejects an empty name", () => {
    expect(validateName("", [])).toBe("Name cannot be empty")
  })

  test("rejects whitespace-only", () => {
    expect(validateName("   ", [])).toBe("Name cannot be empty")
  })

  test("rejects uppercase and spaces so the filename stays predictable", () => {
    expect(validateName("My Team", [])).toBe("Use lowercase letters, numbers and hyphens only")
  })

  test("rejects path separators", () => {
    expect(validateName("../escape", [])).toBe("Use lowercase letters, numbers and hyphens only")
  })

  test("rejects a name already in use", () => {
    expect(validateName("mine", ["mine"])).toBe('"mine" already exists')
  })

  test("rejects every bundled preset name, because install.ts would overwrite it", () => {
    for (const name of BUNDLED_NAMES) {
      expect(validateName(name, [])).toBe(`"${name}" is a bundled preset - clone it instead`)
    }
  })

  test("lists the six bundled presets", () => {
    expect([...BUNDLED_NAMES].sort()).toEqual([
      "code-review",
      "documenter",
      "gryphon",
      "premium-gryphon",
      "researcher",
      "web-dev",
    ])
  })
})
