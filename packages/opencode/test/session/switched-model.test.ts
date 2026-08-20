import { describe, expect, test } from "bun:test"
import { SwitchedModel } from "../../src/session/switched-model"

// Q3 of docs/superpowers/specs/2026-08-13-free-tier-fallback-design.md.
//
// F10: an F2 model swap lasts one loop step. The loop re-reads messages from the
// DB every iteration and re-resolves `lastUser.model`, so a mutated streamInput
// is thrown away at the next tool-call round trip. F11: a durable session-scoped
// override already exists (SessionTable.model, written by the ModelSwitched
// projector). F12: the loop never consults it.
//
// The decision these tests pin down is WHEN the session row should beat
// `lastUser.model`. It cannot simply be "whenever they disagree": prompt.ts:672-689
// writes the row on every user message via setAgentModel, and a row left over from
// a previous turn must not override the model the current turn was actually sent
// with. So the rule is "changed SINCE THIS TURN BEGAN" - the loop captures the row
// before its first step and only defers to a row that moved after that.

const zen = { id: "deepseek-v4-flash-free", providerID: "opencode", variant: "default" }

// providerID and modelID come back branded, which no plain object literal can
// satisfy. Widening to strings keeps whole-object equality - so an unexpected
// extra key still fails - without scattering casts through every assertion.
function plain(choice: SwitchedModel.Choice | undefined) {
  return choice ? { ...choice } as Record<string, string> : undefined
}

describe("SwitchedModel.switched", () => {
  test("returns nothing while the row still holds what the turn started on", () => {
    expect(SwitchedModel.switched(zen, { ...zen })).toBeUndefined()
  })

  test("returns the new model once the row moves to a different model", () => {
    const swapped = SwitchedModel.switched(zen, { ...zen, id: "nemotron-3.5-lightning-free" })
    expect(plain(swapped)).toEqual({ providerID: "opencode", modelID: "nemotron-3.5-lightning-free" })
  })

  test("returns the new model when only the provider moves", () => {
    const swapped = SwitchedModel.switched(zen, { id: "deepseek-v4-flash-free", providerID: "some-other" })
    expect(plain(swapped)).toEqual({ providerID: "some-other", modelID: "deepseek-v4-flash-free" })
  })

  // A session whose row was never written before this turn. Nothing to compare
  // against, so the first write during the turn is a real switch.
  test("treats the first write of an empty row as a switch", () => {
    expect(plain(SwitchedModel.switched(undefined, zen))).toEqual({
      providerID: "opencode",
      modelID: "deepseek-v4-flash-free",
    })
  })

  test("returns nothing when there is no row to prefer", () => {
    expect(SwitchedModel.switched(zen, undefined)).toBeUndefined()
    expect(SwitchedModel.switched(undefined, undefined)).toBeUndefined()
  })

  // The row stores variant "default" where the message model leaves it off -
  // measured on this machine's DB, both spellings are present across sessions.
  // prompt.ts:677 and core/session.ts:400 both already treat them as equal, and
  // reading them as a switch would swap the model on every single step.
  test("reads an absent variant and \"default\" as the same variant", () => {
    expect(SwitchedModel.switched({ id: "a", providerID: "p" }, { id: "a", providerID: "p", variant: "default" })).toBeUndefined()
    expect(SwitchedModel.switched({ id: "a", providerID: "p", variant: "default" }, { id: "a", providerID: "p" })).toBeUndefined()
  })

  test("returns the new model when only the variant moves", () => {
    const swapped = SwitchedModel.switched(zen, { ...zen, variant: "thinking" })
    expect(plain(swapped)).toEqual({
      providerID: "opencode",
      modelID: "deepseek-v4-flash-free",
      variant: "thinking",
    })
  })

  // currentModel() (prompt.ts:625) normalises the same way, so a switch resolved
  // here is shaped exactly like one resolved for a fresh prompt.
  test("drops a \"default\" variant from the result rather than passing it on", () => {
    const swapped = SwitchedModel.switched({ id: "a", providerID: "p" }, { id: "b", providerID: "p", variant: "default" })
    expect(plain(swapped)).toEqual({ providerID: "p", modelID: "b" })
    expect(swapped).not.toHaveProperty("variant")
  })
})
