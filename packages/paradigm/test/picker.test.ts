import { describe, expect, test } from "bun:test"
import { pickerOptions, statusLabel, switchNotice } from "../src/picker"
import type { Paradigm } from "../src/schema"

function paradigm(name: string, description?: string): Paradigm {
  return {
    name,
    description,
    king: "king",
    heads: { king: { model: "m/king", role: "reason" } },
    routing: [],
    discipline: {},
  }
}

describe("pickerOptions", () => {
  test("lists every paradigm sorted by name", () => {
    const options = pickerOptions({
      paradigms: {
        "premium-gryphon": paradigm("premium-gryphon"),
        gryphon: paradigm("gryphon"),
      },
    })
    expect(options.map((o) => o.value)).toEqual(["gryphon", "premium-gryphon"])
    expect(options.map((o) => o.title)).toEqual(["gryphon", "premium-gryphon"])
  })

  test("tags the active paradigm and keeps its own description", () => {
    const options = pickerOptions({
      paradigms: {
        gryphon: paradigm("gryphon", "Three heads under one king"),
        "premium-gryphon": paradigm("premium-gryphon", "Sonnet king"),
      },
      active: "gryphon",
    })
    expect(options[0]?.description).toBe("active · Three heads under one king")
    expect(options[1]?.description).toBe("Sonnet king")
  })

  test("omits the description entirely when there is nothing to say", () => {
    const options = pickerOptions({ paradigms: { gryphon: paradigm("gryphon") } })
    expect(options[0]?.description).toBeUndefined()
  })

  test("tags the active paradigm even when it has no description", () => {
    const options = pickerOptions({ paradigms: { gryphon: paradigm("gryphon") }, active: "gryphon" })
    expect(options[0]?.description).toBe("active")
  })

  test("returns nothing when the directory held no valid paradigms", () => {
    expect(pickerOptions({ paradigms: {} })).toEqual([])
    expect(pickerOptions({ paradigms: {}, active: "gryphon" })).toEqual([])
  })
})

describe("statusLabel", () => {
  test("shows the paradigm the session booted with", () => {
    expect(statusLabel({ booted: "gryphon" })).toBe("gryphon")
  })

  test("shows nothing when no paradigm is active", () => {
    expect(statusLabel({})).toBeUndefined()
  })

  test("shows booted and pending when a switch is waiting on a restart", () => {
    expect(statusLabel({ booted: "gryphon", pending: "premium-gryphon" })).toBe("gryphon → premium-gryphon")
  })

  test("treats picking the already-active paradigm as no pending switch", () => {
    expect(statusLabel({ booted: "gryphon", pending: "gryphon" })).toBe("gryphon")
  })

  test("shows a pending switch even when nothing was active at boot", () => {
    expect(statusLabel({ pending: "gryphon" })).toBe("→ gryphon")
  })
})

describe("switchNotice", () => {
  test("names the paradigm and says the switch waits for a restart", () => {
    const notice = switchNotice("premium-gryphon")
    expect(notice).toContain("premium-gryphon")
    expect(notice).toContain("restart")
  })

  test("never claims the switch already happened", () => {
    expect(switchNotice("gryphon")).not.toMatch(/now active|switched to|is active/i)
  })
})
