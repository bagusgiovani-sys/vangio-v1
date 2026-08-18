/**
 * Which models this machine can actually reach.
 *
 * The wizard used to build its list from the TUI's provider state, which is
 * every provider DECLARED in opencode.json whether or not it has a key. The
 * server already answers the harder question: GET /api/model returns
 * catalog.model.available(), which drops providers with no apiKey and no
 * integration connection, and models that are disabled
 * (packages/core/src/catalog.ts:71 and :210).
 *
 * Measured against a live server 2026-08-18 with ANTHROPIC_API_KEY unset:
 * /config/providers listed anthropic with 17 models, /api/model listed none of
 * them. Same run, opencode went the other way - 7 models in the provider state
 * against 27 from the catalog - so this is not only a filter, it is also the
 * fuller list.
 *
 * The two payloads are NOT the same shape, which is why this file exists:
 * capabilities.tools vs capabilities.toolcall, an input MODALITY LIST vs a
 * boolean per modality, and cost as an array of price tiers vs a single pair.
 */

import type { CandidateModel } from "./resolve"

/**
 * A structural subset of the SDK's ModelV2Info - the fields this package
 * consumes, and nothing else. Declared rather than imported for the same
 * reason CandidateModel is: paradigm does not depend on @opencode-ai/sdk.
 */
export type SdkModel = {
  id: string
  providerID: string
  name: string
  limit: { context: number; output: number }
  capabilities: { tools: boolean; input: string[] }
  cost: Array<{ tier?: { type: string; size: number }; input: number; output: number }>
}

/**
 * Tiered pricing quotes the same model at several context sizes. The entry
 * with no tier is the base rate, so that is the honest headline; a model
 * priced only in tiers falls back to the first. An absent array means
 * models-dev published no price, which resolve.isFree() already reads as free
 * (see the KNOWN GAP note there) - keep that reading rather than crash.
 */
function headlineCost(cost: SdkModel["cost"]): { input: number; output: number } {
  const base = cost.find((entry) => entry.tier === undefined) ?? cost[0]
  if (!base) return { input: 0, output: 0 }
  return { input: base.input, output: base.output }
}

export function toCandidate(model: SdkModel): CandidateModel {
  return {
    id: model.id,
    providerID: model.providerID,
    name: model.name,
    limit: { context: model.limit.context, output: model.limit.output },
    capabilities: {
      toolcall: model.capabilities.tools,
      input: { image: model.capabilities.input.includes("image") },
    },
    cost: headlineCost(model.cost),
  }
}

export type CandidateSource = {
  /** Ask the server which models this machine can actually reach. */
  available: () => Promise<SdkModel[]>
  /** Every model the config DECLARES, credentials or not - the degraded list. */
  configured: () => CandidateModel[]
}

export type CandidateList = {
  models: CandidateModel[]
  /** Set only when `models` could not be verified, for the caller to surface. */
  warning?: string
}

/**
 * An unreachable server is not a reason to strand the user mid-wizard, so the
 * declared list still gets offered - but never silently, because a list that
 * quietly includes models with no key is the exact bug this replaces.
 */
export async function loadCandidates(source: CandidateSource): Promise<CandidateList> {
  try {
    const models = await source.available()
    return { models: models.map(toCandidate) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      models: source.configured(),
      warning: `Could not check which providers have credentials, so this list is every configured model (${reason})`,
    }
  }
}
