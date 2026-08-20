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
 * against 27 from the catalog.
 *
 * That second number was read as "the fuller list" and it is not. Re-measured
 * 2026-08-20: the extra 20 are all status "deprecated", which the runtime
 * refuses to instantiate, so the provider state's 7 were the runnable set all
 * along. The catalog is still the right source - it is the only one that knows
 * about credentials - but it has to be filtered on the way in. See isRunnable.
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
  /**
   * Optional because an older server may answer without it, and because
   * provider.ts:1250 itself reads an absent status as "active".
   */
  status?: string
}

/**
 * Reachable is not the same question as runnable, and /api/model only answers
 * the first one. CatalogV2.model.available() filters on credentials and
 * `enabled` and never looks at `status` (packages/core/src/catalog.ts:210),
 * while the runtime registry DELETES models by status before the loop can ever
 * instantiate one: deprecated unconditionally, alpha unless the
 * enableExperimentalModels flag is set (provider.ts:1663-1664). Nothing this
 * package can read tells it whether that flag is on, so "active" is the only
 * status it can honestly vouch for.
 *
 * Measured 2026-08-20 against a live /api/model: 27 Zen models came back, 20 of
 * them deprecated. Picking one in the wizard produced a paradigm that died at
 * first prompt - `vangio run -m opencode/kimi-k2.5-free` raises
 * ProviderModelNotFoundError, which reaches the user as the unhelpful
 * "Unexpected server error. Check server logs for details."
 */
export function isRunnable(model: SdkModel): boolean {
  return (model.status ?? "active") === "active"
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
    return { models: models.filter(isRunnable).map(toCandidate) }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      models: source.configured(),
      warning: `Could not check which providers have credentials, so this list is every configured model (${reason})`,
    }
  }
}
