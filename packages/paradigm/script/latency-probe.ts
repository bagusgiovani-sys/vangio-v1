#!/usr/bin/env bun
/**
 * Time-to-first-token probe for the models a paradigm actually binds.
 *
 *   bun packages/paradigm/script/latency-probe.ts
 *   bun packages/paradigm/script/latency-probe.ts --models nemotron-3-ultra-free --kb 120 --runs 3
 *
 * Answers the question `run -m <model> "Reply OK"` cannot: will this model
 * still be producing tokens before the gateway gives up on it? See
 * ../src/latency.ts for why that is the number that matters.
 */
import path from "path"
import os from "os"
import fs from "fs/promises"
import { classify, probe, GATEWAY_IDLE_BUDGET_MS, type Sample } from "../src/latency"

const HOME = os.homedir()
const CONFIG = path.join(HOME, ".config", "vangio")
const DATA = path.join(HOME, ".local", "share", "vangio")

function arg(name: string, fallback?: string) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (hit) return hit.slice(name.length + 3)
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 ? process.argv[idx + 1] : fallback
}

async function readJson(file: string): Promise<any | undefined> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"))
  } catch {
    return undefined
  }
}

/** The models the ACTIVE paradigm binds - what you would actually be running. */
async function boundModels(): Promise<string[]> {
  const active = (await fs.readFile(path.join(DATA, "paradigm-active"), "utf8").catch(() => "")).trim()
  if (!active) return []
  const doc = await readJson(path.join(CONFIG, "paradigms", `${active}.json`))
  const heads = doc?.heads ?? {}
  const out = new Set<string>()
  for (const head of Object.values<any>(heads)) {
    if (typeof head?.model === "string") out.add(head.model.split("/").pop()!)
  }
  return [...out]
}

/**
 * A realistic working context, built from this repo's own source. Prefill cost
 * is what pushes time to first token past the budget, so the probe has to pay
 * it - a synthetic run of one repeated character would compress and prove
 * nothing.
 */
async function buildContext(kb: number): Promise<string> {
  const dir = path.resolve(import.meta.dir, "../../opencode/src/session")
  const names = (await fs.readdir(dir).catch(() => [])).filter((n) => n.endsWith(".ts")).sort()
  const target = kb * 1024
  let body = ""
  for (const name of names) {
    if (body.length >= target) break
    body += `\n\n// ===== ${name} =====\n` + (await fs.readFile(path.join(dir, name), "utf8").catch(() => ""))
  }
  if (!body) throw new Error(`no source found to build a context from (looked in ${dir})`)
  return (
    body.slice(0, target) +
    "\n\nIn one sentence, what does this code do? Answer with the sentence only."
  )
}

const ms = (v?: number) => (v === undefined ? "  no token" : `${(v / 1000).toFixed(1)}s`.padStart(9))

async function main() {
  const models = (arg("models")?.split(",").map((s) => s.trim()).filter(Boolean) ?? (await boundModels())).filter(Boolean)
  if (models.length === 0) {
    console.error("no models: pass --models a,b or set an active paradigm")
    process.exit(2)
  }
  const kb = Number(arg("kb", "60"))
  const runs = Number(arg("runs", "2"))
  const budget = Number(arg("budget-ms", String(GATEWAY_IDLE_BUDGET_MS)))
  const cfg = await readJson(path.join(CONFIG, "opencode.json"))
  const baseUrl = cfg?.provider?.opencode?.options?.baseURL ?? "https://opencode.ai/zen/v1"
  const apiKey = process.env["OPENCODE_ZEN_API_KEY"]

  const context = await buildContext(kb)
  console.log(`context ${(context.length / 1024).toFixed(0)}KB · budget ${(budget / 1000).toFixed(0)}s · ${runs} run(s) · ${baseUrl}`)
  console.log(`${"model".padEnd(34)}${"ttft".padStart(9)}${"total".padStart(9)}  verdict`)

  let worst: "ok" | "at-risk" | "over-budget" = "ok"
  for (const model of models) {
    const samples: Sample[] = []
    for (let i = 0; i < runs; i++) {
      samples.push(await probe({ baseUrl, model, context, apiKey, timeoutMs: budget + 15_000 }))
    }
    // Report the WORST sample, not the mean. One timeout in three is the
    // failure the user hits; averaging it away is how this stayed invisible.
    const ttfts = samples.map((s) => s.ttftMs)
    const ttft = ttfts.includes(undefined) ? undefined : Math.max(...(ttfts as number[]))
    const verdict = classify(ttft, budget)
    if (verdict === "over-budget") worst = "over-budget"
    else if (verdict === "at-risk" && worst === "ok") worst = "at-risk"
    const err = samples.find((s) => s.error)?.error
    console.log(
      `${model.padEnd(34)}${ms(ttft)}${ms(Math.max(...samples.map((s) => s.totalMs)))}  ${verdict}${err ? `  (${err})` : ""}`,
    )
  }
  console.log(`\nworst: ${worst}`)
  process.exit(worst === "over-budget" ? 1 : 0)
}

await main()
