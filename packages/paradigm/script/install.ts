#!/usr/bin/env bun
/**
 * Installs the paradigm layer into the live VanGio config.
 *
 * Three things, all idempotent:
 *   1. Bundle src/index.ts into ~/.config/vangio/plugins/vangio-paradigm.js
 *   2. Copy paradigms/*.json into ~/.config/vangio/paradigms/
 *   3. Write the active-paradigm marker
 *
 * The plugins dir holds a SNAPSHOT, not a live link - re-run this after any
 * change to packages/paradigm/src. Target is "bun", matching the notifier's
 * proven bundling (docs/fork/mobile-control-setup.md step 1); the runtime that
 * loads this is Bun, not node.
 */
import { mkdir, readdir, copyFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"

const HOME = os.homedir()
const REPO = path.join(import.meta.dir, "..", "..", "..")
const PLUGIN_DIR = path.join(HOME, ".config", "vangio", "plugins")
const PARADIGM_DIR = path.join(HOME, ".config", "vangio", "paradigms")
const MARKER = path.join(HOME, ".local", "share", "vangio", "paradigm-active")

const active = process.argv[2] ?? "gryphon"

await mkdir(PLUGIN_DIR, { recursive: true })
const out = path.join(PLUGIN_DIR, "vangio-paradigm.js")
const built = await Bun.build({
  entrypoints: [path.join(import.meta.dir, "..", "src", "index.ts")],
  target: "bun",
  format: "esm",
  outdir: PLUGIN_DIR,
  naming: "vangio-paradigm.js",
})
if (!built.success) {
  for (const log of built.logs) console.error(log)
  throw new Error("bundle failed")
}
console.log(`bundled  ${out}  (${built.outputs.length} output, ${(await Bun.file(out).text()).length} bytes)`)

await mkdir(PARADIGM_DIR, { recursive: true })
const src = path.join(REPO, "paradigms")
for (const file of (await readdir(src)).filter((f) => f.endsWith(".json"))) {
  await copyFile(path.join(src, file), path.join(PARADIGM_DIR, file))
  console.log(`copied   ${path.join(PARADIGM_DIR, file)}`)
}

await mkdir(path.dirname(MARKER), { recursive: true })
await writeFile(MARKER, `${active}\n`, "utf8")
console.log(`active   ${MARKER} -> ${active}`)
