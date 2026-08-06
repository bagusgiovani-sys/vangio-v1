#!/usr/bin/env bun
/**
 * Installs the paradigm layer into the live VanGio config.
 *
 * Five things, all idempotent:
 *   1. Bundle src/index.ts into ~/.config/vangio/plugins/vangio-paradigm.js
 *   2. Bundle src/tui.tsx into ~/.config/vangio/plugins/vangio-paradigm-tui.js
 *   3. Declare the tui bundle in ~/.config/vangio/tui.json
 *   4. Copy paradigms/*.json into ~/.config/vangio/paradigms/
 *   5. Write the active-paradigm marker
 *
 * Two bundles because a plugin module may export server() or tui(), never both.
 *
 * Step 3 is not optional: only SERVER plugins are auto-discovered from the
 * plugins dir (config/plugin.ts scans plugins/*.{ts,js} for the server config
 * alone). The tui config takes its plugins from its own `plugin` array and
 * scans no directory, so a file dropped next to vangio-paradigm.js is never
 * loaded - measured, 2026-08-06.
 *
 * The plugins dir holds a SNAPSHOT, not a live link - re-run this after any
 * change to packages/paradigm/src. Target is "bun", matching the notifier's
 * proven bundling (docs/fork/mobile-control-setup.md step 1); the runtime that
 * loads this is Bun, not node.
 */
import { mkdir, readdir, readFile, copyFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import solidPlugin from "@opentui/solid/bun-plugin"

const HOME = os.homedir()
const REPO = path.join(import.meta.dir, "..", "..", "..")
const PLUGIN_DIR = path.join(HOME, ".config", "vangio", "plugins")
const PARADIGM_DIR = path.join(HOME, ".config", "vangio", "paradigms")
const MARKER = path.join(HOME, ".local", "share", "vangio", "paradigm-active")

const active = process.argv[2] ?? "gryphon"

/**
 * The TUI plugin must NOT carry its own copy of Solid. The host maps these bare
 * specifiers to the modules it has already loaded, so that the plugin shares the
 * running reactive graph instead of starting a second one
 * (@opentui/core/runtime-plugin.js, installed by opencode's tui plugin runtime).
 */
const TUI_EXTERNAL = [
  "solid-js",
  "solid-js/store",
  "@opentui/solid",
  "@opentui/solid/components",
  "@opentui/solid/jsx-runtime",
  "@opentui/solid/jsx-dev-runtime",
  "@opentui/core",
  "@opentui/keymap",
  "@opencode-ai/plugin/tui",
]

async function bundle(entry: string, name: string, options: Partial<Parameters<typeof Bun.build>[0]> = {}) {
  const out = path.join(PLUGIN_DIR, name)
  const built = await Bun.build({
    entrypoints: [path.join(import.meta.dir, "..", "src", entry)],
    target: "bun",
    format: "esm",
    outdir: PLUGIN_DIR,
    naming: name,
    ...options,
  })
  if (!built.success) {
    for (const log of built.logs) console.error(log)
    throw new Error(`bundle failed: ${entry}`)
  }
  console.log(`bundled  ${out}  (${built.outputs.length} output, ${(await Bun.file(out).text()).length} bytes)`)
}

await mkdir(PLUGIN_DIR, { recursive: true })
await bundle("index.ts", "vangio-paradigm.js")
await bundle("tui.tsx", "vangio-paradigm-tui.js", { external: TUI_EXTERNAL, plugins: [solidPlugin] })

// Relative specs resolve against the config file's own directory
// (ConfigPlugin.resolvePluginSpec), so this stays correct wherever HOME is.
const TUI_CONFIG = path.join(HOME, ".config", "vangio", "tui.json")
const TUI_SPEC = "./plugins/vangio-paradigm-tui.js"

const tuiConfig: Record<string, unknown> = await readFile(TUI_CONFIG, "utf8")
  .then((text) => JSON.parse(text) as Record<string, unknown>)
  .catch(() => ({}))
const declared = Array.isArray(tuiConfig["plugin"]) ? (tuiConfig["plugin"] as unknown[]) : []
if (declared.includes(TUI_SPEC)) {
  console.log(`declared ${TUI_CONFIG} -> ${TUI_SPEC} (already)`)
} else {
  tuiConfig["plugin"] = [...declared, TUI_SPEC]
  await writeFile(TUI_CONFIG, `${JSON.stringify(tuiConfig, null, 2)}\n`, "utf8")
  console.log(`declared ${TUI_CONFIG} -> ${TUI_SPEC}`)
}

await mkdir(PARADIGM_DIR, { recursive: true })
const src = path.join(REPO, "paradigms")
for (const file of (await readdir(src)).filter((f) => f.endsWith(".json"))) {
  await copyFile(path.join(src, file), path.join(PARADIGM_DIR, file))
  console.log(`copied   ${path.join(PARADIGM_DIR, file)}`)
}

await mkdir(path.dirname(MARKER), { recursive: true })
await writeFile(MARKER, `${active}\n`, "utf8")
console.log(`active   ${MARKER} -> ${active}`)
