import type { Needs, Pick } from "./roles"

/**
 * A structural subset of the SDK's Model that this package can consume without
 * importing @opencode-ai/sdk. Keeping paradigm free of that dependency is what
 * makes the resolver portable to another runtime - it only ever needs someone
 * to hand it a list of these.
 */
export type CandidateModel = {
  id: string
  providerID: string
  name: string
  limit: { context: number; output: number }
  capabilities: { toolcall: boolean; input: { image: boolean } }
  cost: { input: number; output: number }
}

export type ModelChoice = {
  model: string
  title: string
  description?: string
  disabled: boolean
}

/** Paradigm files spell a model as "provider/id". One place, so it cannot drift. */
export function modelRef(model: CandidateModel): string {
  return `${model.providerID}/${model.id}`
}

/**
 * Returns the FIRST unmet need as a human sentence, or undefined if the model
 * fits. First-only on purpose: the string lands in a dialog row, and a list of
 * four failures there is unreadable.
 */
export function checkNeeds(needs: Needs, model: CandidateModel): string | undefined {
  if (needs.minContext !== undefined && model.limit.context < needs.minContext) {
    return `needs ${needs.minContext} context, has ${model.limit.context}`
  }
  if (needs.minOutput !== undefined && model.limit.output < needs.minOutput) {
    return `needs ${needs.minOutput} output, has ${model.limit.output}`
  }
  if (needs.tools === true && !model.capabilities.toolcall) {
    return "does not support tool calls"
  }
  if (needs.attachment?.includes("image") && !model.capabilities.input.image) {
    return "does not accept image input"
  }
  return undefined
}

/**
 * KNOWN GAP: a genuinely free model and one whose pricing was never published
 * are indistinguishable here. models-dev normalises absent cost data to zero
 * (packages/core/src/plugin/models-dev.ts:13-20), so "cost is zero" is the only
 * signal available and this treats it as free. Failing closed instead would
 * reject every free model, which is worse. Closing this properly needs the raw
 * models.dev payload, which a plugin cannot reach.
 */
function isFree(model: CandidateModel): boolean {
  return model.cost.input === 0 && model.cost.output === 0
}

export function modelOptions(input: {
  needs: Needs
  picks: Pick[]
  models: CandidateModel[]
  allowPaid?: boolean
}): ModelChoice[] {
  const allowPaid = input.allowPaid ?? true
  const pickIndex = new Map(input.picks.map((pick, index) => [pick.model, index]))
  const pickWhy = new Map(input.picks.map((pick) => [pick.model, pick.why]))

  const rows = input.models
    .filter((model) => allowPaid || isFree(model))
    .map((model) => {
      const ref = modelRef(model)
      const failure = checkNeeds(input.needs, model)
      return {
        ref,
        model,
        failure,
        rank: pickIndex.get(ref) ?? Number.MAX_SAFE_INTEGER,
        headroom: model.limit.context + model.limit.output,
      }
    })

  rows.sort((a, b) => {
    // Fitting models always outrank failing ones.
    if (!a.failure !== !b.failure) return a.failure ? 1 : -1
    // Then curated order, which is the whole point of picks.
    if (a.rank !== b.rank) return a.rank - b.rank
    // Then capability headroom, biggest first.
    if (a.headroom !== b.headroom) return b.headroom - a.headroom
    return a.ref.localeCompare(b.ref)
  })

  return rows.map((row) => ({
    model: row.ref,
    title: row.model.name,
    description: row.failure ?? pickWhy.get(row.ref),
    disabled: row.failure !== undefined,
  }))
}
