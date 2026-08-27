import { describe, expect, test } from "bun:test"
import {
  validateName,
  BUNDLED_NAMES,
  emptyDraft,
  firstStep,
  nextStep,
  stepBack,
  toParadigm,
  cloneParadigm,
  canFinish,
  type Draft,
  type Step,
} from "../src/craft"
import { getRole } from "../src/roles"
import type { Paradigm } from "../src/schema"

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
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
    for (const answer of answers) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    return { draft, step }
  }

  test("the v5 flow still begins at the name step, reached by a blank goal", () => {
    expect(nextStep(emptyDraft(), firstStep(), "").step).toEqual({ kind: "name" })
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

  test("legion asks the king's model, one role, then its model, then goes straight to review", () => {
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
})

describe("toParadigm", () => {
  function built(): Draft {
    let draft = emptyDraft()
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
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
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
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
    expect(p.heads["warrior"]?.role).toBe(getRole("warrior")!.summary)
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
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
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
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
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

  test("reaching review through a full forward build keeps toParadigm valid (stepBack is computed here, not applied)", async () => {
    const { parseParadigm } = await import("../src/schema")
    let draft = emptyDraft()
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
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

  test("a real back-edit that re-answers a role clears its model - done is refused until a model is supplied again", () => {
    let draft = emptyDraft()
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
    // Build a complete two-head court: king, then warrior with a model.
    for (const answer of ["my-team", "court", "opencode/ultra", "warrior", "opencode/light"]) {
      const result = nextStep(draft, step, answer)
      draft = result.draft
      step = result.step
    }
    expect(step).toEqual({ kind: "role", slot: 2 })
    expect(canFinish(draft)).toBe(true)

    // "← Back" twice, exactly as tui.tsx's back() does, lands on slot 1's role step.
    step = stepBack(draft, step)
    expect(step).toEqual({ kind: "model", slot: 1 })
    step = stepBack(draft, step)
    expect(step).toEqual({ kind: "role", slot: 1 })

    // Re-answering the role overwrites heads[1] with a fresh { role } that has
    // no model - the six-keystroke repro from the review.
    let result = nextStep(draft, step, "scout")
    draft = result.draft
    step = result.step
    expect(draft.heads[1]?.model).toBeUndefined()
    expect(canFinish(draft)).toBe(false)

    // Back once more to the role step, where "done" is offered/refused.
    step = stepBack(draft, step)
    expect(step).toEqual({ kind: "role", slot: 1 })
    const refused = nextStep(draft, step, "done")
    expect(refused.step).toEqual({ kind: "role", slot: 1 })
    expect(canFinish(refused.draft)).toBe(false)

    // Supplying a model for slot 1 again restores completeness.
    const modelled = nextStep(draft, { kind: "model", slot: 1 }, "opencode/hy3")
    expect(canFinish(modelled.draft)).toBe(true)
  })

  test("stepBack from review with four heads returns model step of highest slot", () => {
    let draft = emptyDraft()
    // v6: every v5 walkthrough now enters through a blank goal, which must
    // leave the draft untouched and land exactly where v5 used to start.
    let step = nextStep(draft, firstStep(), "").step
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

describe("cloneParadigm", () => {
  // Populated with everything toParadigm's old draft round-trip used to drop:
  // routing, discipline, description, and (on scout-a) a head prompt.
  const source: Paradigm = {
    name: "researcher",
    description: "three scouts",
    king: "king",
    heads: {
      king: { model: "opencode/ultra", role: "split and synthesise" },
      "scout-a": {
        model: "opencode/hy3",
        role: "one thread",
        permission: { edit: "deny" },
        prompt: "Stay narrow: one question, one answer.",
      },
      "scout-b": { model: "opencode/big-pickle", role: "one thread" },
    },
    routing: ["fan out -> @scout-a", "never bind a parallel head to Zhipu - it is single-concurrent by contract"],
    discipline: { self: "be brief" },
  }

  test("takes the new name and nothing else changes", () => {
    const clone = cloneParadigm(source, "my-copy")
    expect(clone.name).toBe("my-copy")
  })

  // Same class of bug as the routing/discipline/prompt drop this suite was
  // written for: a clone that loses a head's fallback chain silently disarms
  // the free-tier degradation for every copy anyone makes.
  test("preserves needs, fallback and the shift toggle", () => {
    const withShift: Paradigm = {
      ...source,
      shift: { auto: false },
      heads: {
        ...source.heads,
        king: {
          ...source.heads.king!,
          needs: { minOutput: 100000, tools: true },
          fallback: ["opencode/nemotron-3.5-lightning-free", "opencode/nemotron-3-ultra-free"],
        },
      },
    }
    const clone = cloneParadigm(withShift, "my-copy")
    expect(clone.shift).toEqual({ auto: false })
    expect(clone.heads.king!.needs).toEqual({ minOutput: 100000, tools: true })
    expect(clone.heads.king!.fallback).toEqual([
      "opencode/nemotron-3.5-lightning-free",
      "opencode/nemotron-3-ultra-free",
    ])
  })

  test("preserves routing and discipline verbatim", () => {
    const clone = cloneParadigm(source, "my-copy")
    expect(clone.routing).toEqual(source.routing)
    expect(clone.discipline).toEqual(source.discipline)
  })

  test("preserves the description", () => {
    const clone = cloneParadigm(source, "my-copy")
    expect(clone.description).toBe(source.description)
  })

  test("preserves each head's role text, prompt and permission - not the catalog summary", () => {
    const clone = cloneParadigm(source, "my-copy")
    expect(clone.heads["scout-a"]?.role).toBe("one thread")
    expect(clone.heads["scout-a"]?.prompt).toBe("Stay narrow: one question, one answer.")
    expect(clone.heads["scout-a"]?.permission).toEqual({ edit: "deny" })
    expect(clone.heads["scout-b"]?.role).toBe("one thread")
  })

  test("keeps all three heads", () => {
    const clone = cloneParadigm(source, "my-copy")
    expect(Object.keys(clone.heads).length).toBe(3)
  })

  test("a clone still parses as a valid paradigm", async () => {
    const { parseParadigm } = await import("../src/schema")
    const result = parseParadigm(cloneParadigm(source, "my-copy"))
    expect(result.ok).toBe(true)
  })
})

describe("the goal step (v6)", () => {
  test("the wizard now opens on the goal, not the name", () => {
    expect(firstStep()).toEqual({ kind: "goal" })
  })

  test("a blank goal falls straight through to the v5 flow", () => {
    const result = nextStep(emptyDraft(), { kind: "goal" }, "")
    expect(result.step).toEqual({ kind: "name" })
    expect(result.draft.goal).toBeUndefined()
  })

  test("whitespace is a blank goal, not a goal made of spaces", () => {
    const result = nextStep(emptyDraft(), { kind: "goal" }, "   ")
    expect(result.step).toEqual({ kind: "name" })
    expect(result.draft.goal).toBeUndefined()
  })

  test("a real goal is recorded and hands off to generating", () => {
    const result = nextStep(emptyDraft(), { kind: "goal" }, "  sell bras on tiktok  ")
    expect(result.step).toEqual({ kind: "generating" })
    expect(result.draft.goal).toBe("sell bras on tiktok")
  })

  test("generating does not advance itself - only the network reply moves it", () => {
    const draft = { ...emptyDraft(), goal: "anything" }
    const result = nextStep(draft, { kind: "generating" }, "whatever")
    expect(result.step).toEqual({ kind: "generating" })
  })

  test("stepBack from name now returns to the goal instead of dead-ending", () => {
    expect(stepBack(emptyDraft(), { kind: "name" })).toEqual({ kind: "goal" })
  })

  test("stepBack from generating returns to the goal, so a slow model is escapable", () => {
    expect(stepBack(emptyDraft(), { kind: "generating" })).toEqual({ kind: "goal" })
  })

  test("stepBack from goal stays at goal - it is the start now", () => {
    expect(stepBack(emptyDraft(), { kind: "goal" })).toEqual({ kind: "goal" })
  })
})
