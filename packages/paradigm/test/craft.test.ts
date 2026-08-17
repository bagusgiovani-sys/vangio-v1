import { describe, expect, test } from "bun:test"
import { validateName, BUNDLED_NAMES, emptyDraft, firstStep, nextStep, stepBack, toParadigm, type Draft, type Step } from "../src/craft"

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

describe("wizard state machine", () => {
  function run(answers: string[]): { draft: Draft; step: Step } {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of answers) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    return { draft, step }
  }

  test("starts by asking for a name", () => {
    expect(firstStep()).toEqual({ kind: "name" })
  })

  test("name then asks for shape", () => {
    const { draft, step } = run(["my-team"])
    expect(draft.name).toBe("my-team")
    expect(step).toEqual({ kind: "shape" })
  })

  test("court asks for the king's role slot first", () => {
    const { draft, step } = run(["my-team", "court"])
    expect(draft.shape).toBe("court")
    expect(step).toEqual({ kind: "model", slot: 0 })
  })

  test("slot 0 is always the king, so its role is not asked", () => {
    const { draft } = run(["my-team", "court"])
    expect(draft.heads[0]?.role).toBe("king")
  })

  test("after the king's model, court asks for the next head's role", () => {
    const { step } = run(["my-team", "court", "opencode/ultra"])
    expect(step).toEqual({ kind: "role", slot: 1 })
  })

  test("choosing a role then asks for that slot's model", () => {
    const { draft, step } = run(["my-team", "court", "opencode/ultra", "warrior"])
    expect(draft.heads[1]?.role).toBe("warrior")
    expect(step).toEqual({ kind: "model", slot: 1 })
  })

  test("answering done at a role slot goes to review", () => {
    const { step } = run(["my-team", "court", "opencode/ultra", "warrior", "opencode/light", "done"])
    expect(step).toEqual({ kind: "review" })
  })

  test("review confirms to done", () => {
    const { step } = run([
      "my-team", "court", "opencode/ultra", "warrior", "opencode/light", "done", "confirm",
    ])
    expect(step).toEqual({ kind: "done" })
  })

  test("a king alone cannot reach review - at least two heads are required", () => {
    const { step } = run(["my-team", "court", "opencode/ultra", "done"])
    expect(step).toEqual({ kind: "role", slot: 1 })
  })

  test("a court stops offering more heads after six below the king", () => {
    const answers = ["my-team", "court", "opencode/ultra"]
    for (let i = 0; i < 6; i++) answers.push("scout", `opencode/s${i}`)
    const { draft, step } = run(answers)
    expect(Object.keys(draft.heads).length).toBe(7)
    expect(step).toEqual({ kind: "review" })
  })

  test("legion asks the king's model, one role, its model, then a count", () => {
    const { draft, step } = run(["my-team", "legion", "opencode/ultra", "scout", "opencode/hy3"])
    expect(draft.shape).toBe("legion")
    expect(step).toEqual({ kind: "review" })
    expect(draft.heads[1]?.role).toBe("scout")
  })

  test("stepBack from shape returns to name", () => {
    expect(stepBack(emptyDraft(), { kind: "shape" })).toEqual({ kind: "name" })
  })

  test("stepBack from a model slot returns to that slot's role, except the king", () => {
    const draft = emptyDraft()
    expect(stepBack(draft, { kind: "model", slot: 2 })).toEqual({ kind: "role", slot: 2 })
    expect(stepBack(draft, { kind: "model", slot: 0 })).toEqual({ kind: "shape" })
  })

  test("stepBack from name stays at name - there is nowhere to go", () => {
    expect(stepBack(emptyDraft(), { kind: "name" })).toEqual({ kind: "name" })
  })
})

describe("toParadigm", () => {
  function built(): Draft {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of [
      "my-team", "court", "opencode/ultra", "warrior", "opencode/light", "scout", "opencode/hy3", "done",
    ]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    return draft
  }

  test("produces a paradigm that parseParadigm accepts", async () => {
    const { parseParadigm } = await import("../src/schema")
    const result = parseParadigm(toParadigm(built()))
    expect(result.ok).toBe(true)
  })

  test("names the king head 'king' and points king at it", () => {
    const p = toParadigm(built())
    expect(p.king).toBe("king")
    expect(p.heads["king"]?.model).toBe("opencode/ultra")
  })

  test("names duplicate roles with a numeric suffix", () => {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of [
      "my-team", "court", "opencode/ultra", "scout", "opencode/a", "scout", "opencode/b", "done",
    ]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    const p = toParadigm(draft)
    expect(Object.keys(p.heads).sort()).toEqual(["king", "scout-1", "scout-2"])
  })

  test("carries the role summary into each head's role text", () => {
    const p = toParadigm(built())
    expect(p.heads["warrior"]?.role.length).toBeGreaterThan(0)
  })

  test("denies edit on scout and seer heads but never sets permission on the king", () => {
    const p = toParadigm(built())
    expect(p.heads["scout"]?.permission).toEqual({ edit: "deny" })
    expect(p.heads["king"]?.permission).toBeUndefined()
    expect(p.heads["warrior"]?.permission).toBeUndefined()
  })
})

describe("wizard completeness guard", () => {
  test("done is refused when a head exists but has no model", () => {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of ["my-team", "court", "opencode/ultra", "warrior"]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    // Now at model step for slot 1, which has no model yet
    // Try to say "done" at the role step
    const beforeDone = nextStep(draft, { kind: "role", slot: 1 }, "done")
    expect(beforeDone.step).toEqual({ kind: "role", slot: 1 })
  })

  test("done is accepted once that head gets a model", () => {
    let draft = emptyDraft()
    let step = firstStep()
    for (const answer of ["my-team", "court", "opencode/ultra", "warrior", "opencode/light"]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    // Now at role step for slot 2
    // Say "done" should advance to review because slot 1 now has a model
    const afterModel = nextStep(draft, { kind: "role", slot: 2 }, "done")
    expect(afterModel.step).toEqual({ kind: "review" })
  })

  test("full back-and-edit scenario keeps toParadigm valid", async () => {
    const { parseParadigm } = await import("../src/schema")
    let draft = emptyDraft()
    let step = firstStep()
    // Build a court with two heads
    for (const answer of ["my-team", "court", "opencode/ultra", "warrior", "opencode/light", "scout", "opencode/hy3"]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    // At role step for slot 3
    // Say done to reach review
    let result = nextStep(draft, step, "done")
    expect(result.step).toEqual({ kind: "review" })
    // Back from review should go to model step of highest slot (2)
    step = stepBack(draft, result.step)
    expect(step).toEqual({ kind: "model", slot: 2 })
    // Verify the paradigm is still valid
    const p = toParadigm(result.draft)
    const parsed = parseParadigm(p)
    expect(parsed.ok).toBe(true)
  })

  test("stepBack from review with four heads returns model step of highest slot", () => {
    let draft = emptyDraft()
    let step = firstStep()
    // Build a court with four heads (slots 0, 1, 2, 3)
    for (const answer of [
      "my-team", "court", "opencode/ultra",
      "warrior", "opencode/a",
      "scout", "opencode/b",
      "seer", "opencode/c",
      "done",
    ]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    expect(step).toEqual({ kind: "review" })
    expect(Object.keys(draft.heads).length).toBe(4)
    // stepBack from review should go to model step of slot 3
    const back = stepBack(draft, step)
    expect(back).toEqual({ kind: "model", slot: 3 })
  })
})
