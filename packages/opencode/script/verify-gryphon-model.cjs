const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { randomBytes } = require("node:crypto")

const roles = new Set(["king", "warrior", "scout"])
const role = process.argv[2]
const model = process.argv[3]
const attempts = Number(process.argv[4] ?? 3)
if (!roles.has(role) || !/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/.test(model ?? "") ||
  !Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
  console.error("Usage: node script/verify-gryphon-model.cjs <king|warrior|scout> <provider/model> [attempts: 1-3]")
  process.exit(2)
}

const root = path.resolve(__dirname, "..")
const bun = process.env.BUN_BINARY ?? "bun"
const results = []

for (let attempt = 1; attempt <= attempts; attempt++) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vangio-live-model-"))
  const nonce = randomBytes(18).toString("hex")
  const before = `before-${nonce}`
  const after = `after-${nonce}`
  fs.writeFileSync(path.join(directory, "fact.txt"), `fact: ${nonce}\n`)
  fs.writeFileSync(path.join(directory, "change.txt"), `${before}\n`)
  const prompt = role === "warrior"
    ? `In this temporary project, use the edit tool to replace the exact line ${before} with ${after} in change.txt. Then report the resulting line.`
    : `Use the read tool to inspect fact.txt in this project, then report its exact fact value. Do not guess.`
  const started = Date.now()
  const run = spawnSync(bun, [
    "run", "--cwd", root, "src/index.ts", "run", "--format", "json",
    "--dir", directory, "--agent", role === "king" ? "build" : role,
    "--model", model, prompt,
  ], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 240000, maxBuffer: 16 * 1024 * 1024 })

  const events = (run.stdout ?? "").split(/\r?\n/).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
  const tools = events.filter((event) => event.type === "tool_use").map((event) => ({
    name: event.part?.tool,
    status: event.part?.state?.status,
  }))
  const messages = events.filter((event) => event.type === "text").map((event) => event.part?.text ?? "").join("\n")
  const changed = fs.readFileSync(path.join(directory, "change.txt"), "utf8").trim() === after
  const readSucceeded = tools.some((tool) => tool.name === "read" && tool.status === "completed")
  const editSucceeded = tools.some((tool) => tool.name === "edit" && tool.status === "completed") && changed
  const passed = run.status === 0 && (role === "warrior"
    ? editSucceeded && messages.includes(after)
    : readSucceeded && messages.includes(nonce))
  const errorEvent = events.find((event) => event.type === "error")
  results.push({
    role,
    model,
    attempt,
    passed,
    elapsedMs: Date.now() - started,
    toolCalls: tools,
    error: errorEvent?.error?.name ?? (run.error?.code ?? (run.status === 0 ? undefined : `exit_${run.status}`)),
  })
  fs.rmSync(directory, { recursive: true, force: true })
}

console.log(JSON.stringify({ role, model, attempts, passed: results.filter((result) => result.passed).length, results }, null, 2))
process.exitCode = results.every((result) => result.passed) ? 0 : 1
