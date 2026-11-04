const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const { randomBytes } = require("node:crypto")
const jsonc = require("jsonc-parser")

const preset = require("../../../paradigms/gryphon.json")
const roles = new Set(["king", "warrior", "scout"])
const reference = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/

function verify({ role, model, attempts = 3, execute = spawnSync, onResult = () => {} }) {
  if (!roles.has(role) || !reference.test(model ?? "") ||
    !Number.isInteger(attempts) || attempts < 1 || attempts > 3) {
    throw new Error("Expected <king|warrior|scout> <provider/model> [attempts: 1-3]")
  }
  const root = path.resolve(__dirname, "..")
  const results = []
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vangio-live-model-"))
    try {
      const nonce = randomBytes(18).toString("hex")
      const before = "before-" + nonce
      const after = "after-" + nonce
      fs.writeFileSync(path.join(directory, "fact.txt"), "fact: " + nonce + "\n")
      fs.writeFileSync(path.join(directory, "change.txt"), before + "\n")
      const prompt = role === "warrior"
        ? "Use read to inspect change.txt, then edit to replace " + before + " with " + after + ". Read the file again to verify, then report the resulting line."
        : "Use glob to locate fact.txt, then read it and report its exact fact value. Do not write any files."
      // CLI run rejects subagents. Use a primary test agent instead of silently
      // falling back to Build. Another model must never rescue a candidate.
      const config = {
        agent: {
          "gryphon-verification": {
            mode: "primary",
            model,
            prompt: "You are Gryphon's " + role + ": " + preset.heads[role].role + ". Complete the requested fixture task yourself.",
            steps: 8,
            permission: { "*": "deny", read: "allow", glob: "allow", grep: "allow", edit: role === "warrior" ? "allow" : "deny" },
            options: { needs: preset.heads[role].needs, freeOnly: true, fallback: [], fallbackPolicy: "declared-only", shiftAuto: false },
          },
        },
      }
      const started = Date.now()
      const content = process.env.OPENCODE_CONFIG_CONTENT ?? "{}"
      const configContent = jsonc.applyEdits(content, jsonc.modify(content,
        ["agent", "gryphon-verification"], config.agent["gryphon-verification"], {}))
      const run = execute(process.env.BUN_BINARY ?? "bun", [
        "run", "--cwd", root, "src/index.ts", "run", "--format", "json",
        "--dir", directory, "--agent", "gryphon-verification", "--model", model, prompt,
      ], {
        cwd: root, encoding: "utf8", windowsHide: true, timeout: 240000, maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, OPENCODE_CONFIG_CONTENT: configContent },
      })
      const events = (run.stdout ?? "").split(/\r?\n/).flatMap((line) => {
        try { return [JSON.parse(line)].filter((event) => event && typeof event === "object") } catch { return [] }
      })
      const tools = events.filter((event) => event.type === "tool_use")
      const completed = (tool, file) => tools.filter((event) => event.part?.tool === tool &&
        event.part?.state?.status === "completed" && typeof event.part.state.input?.filePath === "string" &&
        path.resolve(directory, event.part.state.input.filePath) === path.join(directory, file))
      const messages = events.filter((event) => event.type === "text").map((event) => event.part?.text ?? "").join("\n")
      const unchanged = fs.readFileSync(path.join(directory, "fact.txt"), "utf8") === "fact: " + nonce + "\n" &&
        fs.readFileSync(path.join(directory, "change.txt"), "utf8") === before + "\n"
      const changed = fs.readFileSync(path.join(directory, "change.txt"), "utf8").trim() === after
      const editIndex = tools.indexOf(completed("edit", "change.txt")[0])
      const reads = completed("read", "change.txt").map((event) => tools.indexOf(event))
      const errorEvent = events.find((event) => event.type === "error")
      const wrongAgent = /falling back to default agent/i.test((run.stdout ?? "") + "\n" + (run.stderr ?? ""))
      const passed = run.status === 0 && !run.error && !errorEvent && !wrongAgent && (role === "warrior"
        ? editIndex >= 0 && reads.some((index) => index < editIndex) && reads.some((index) => index > editIndex) && changed && messages.includes(after)
        : completed("read", "fact.txt").length > 0 && unchanged && messages.includes(nonce))
      const result = {
        role, model, attempt, passed, elapsedMs: Date.now() - started,
        toolCalls: tools.map((event) => ({ name: event.part?.tool, status: event.part?.state?.status })),
        providerSteps: events.filter((event) => event.type === "step_finish").length,
        // Only fixed classifications escape; provider messages can contain secrets.
        error: run.error ? "process_error" : run.status !== 0 ? "process_exit"
          : errorEvent ? "session_error" : wrongAgent ? "agent_fallback" : !passed ? "fixture_failed" : undefined,
      }
      results.push(result)
      onResult(result)
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
    // Failed candidates need diagnosis, not repeated quota-consuming probes.
    if (!results.at(-1).passed) break
  }
  return { role, model, attempts, completed: results.length, passed: results.filter((result) => result.passed).length, results }
}

module.exports = { verify }
if (require.main === module) {
  try {
    const report = verify({ role: process.argv[2], model: process.argv[3], attempts: Number(process.argv[4] ?? 3),
      onResult: (result) => console.error(result.role + " attempt " + result.attempt + ": " + (result.passed ? "pass" : result.error)) })
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.passed === report.attempts ? 0 : 1
  } catch {
    console.error("Unable to complete verification. Usage: node script/verify-gryphon-model.cjs <king|warrior|scout> <provider/model> [attempts: 1-3]")
    process.exitCode = 2
  }
}
