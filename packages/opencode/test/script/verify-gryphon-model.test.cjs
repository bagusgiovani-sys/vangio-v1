const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const jsonc = require("jsonc-parser")
const { verify } = require("../../script/verify-gryphon-model.cjs")
const { matrix } = require("../../script/verify-gryphon-matrix.cjs")

function response(args, role, file = role === "warrior" ? "change.txt" : "fact.txt") {
  const directory = args[args.indexOf("--dir") + 1]
  const value = fs.readFileSync(path.join(directory, file), "utf8").trim().replace("fact: ", "")
  const tool = (name) => ({ type: "tool_use", part: { tool: name, state: { status: "completed", input: { filePath: path.join(directory, file) } } } })
  if (role === "warrior") fs.writeFileSync(path.join(directory, file), value.replace("before-", "after-") + "\n")
  return { status: 0, stdout: [tool("read"), ...(role === "warrior" ? [tool("edit"), tool("read")] : []),
    { type: "text", part: { text: value.replace("before-", "after-") } }, { type: "step_finish" }].map(JSON.stringify).join("\n"), stderr: "" }
}

for (const role of ["king", "warrior", "scout"]) test(role + " uses a primary fixture agent with no model fallback", () => {
  const directories = []
  const report = verify({ role, model: "fixture/candidate", execute: (_binary, args, options) => {
    directories.push(args[args.indexOf("--dir") + 1])
    assert.equal(args[args.indexOf("--agent") + 1], "gryphon-verification")
    const agent = jsonc.parse(options.env.OPENCODE_CONFIG_CONTENT).agent["gryphon-verification"]
    assert.equal(agent.mode, "primary")
    assert.equal(agent.model, "fixture/candidate")
    assert.equal(agent.permission.edit, role === "warrior" ? "allow" : "deny")
    assert.equal(agent.permission["*"], "deny")
    assert.deepEqual(agent.options.fallback, [])
    assert.equal(agent.options.fallbackPolicy, "declared-only")
    assert.equal(agent.options.shiftAuto, false)
    assert.equal(agent.options.freeOnly, true)
    if (role === "warrior") assert.equal(agent.options.needs.minOutput, 100000)
    return response(args, role)
  } })
  assert.equal(report.passed, 3)
  assert.equal(report.completed, 3)
  assert.equal(new Set(directories).size, 3)
  assert.ok(directories.every((directory) => !fs.existsSync(directory)))
})

test("rejects default-agent fallback and stops probing a failed candidate", () => {
  const report = verify({ role: "scout", model: "fixture/candidate", execute: (_binary, args) => ({ ...response(args, "scout"), stderr: "agent is a subagent. Falling back to default agent" }) })
  assert.equal(report.passed, 0)
  assert.equal(report.completed, 1)
  assert.equal(report.results[0].error, "agent_fallback")
})

test("read of another file cannot satisfy the fact check", () => {
  const report = verify({ role: "scout", model: "fixture/candidate", execute: (_binary, args) => {
    const result = response(args, "scout")
    return { ...result, stdout: result.stdout.replaceAll("fact.txt", "other.txt") }
  } })
  assert.equal(report.passed, 0)
})

test("session errors cannot pass even with valid tool results and zero exit status", () => {
  const report = verify({ role: "king", model: "fixture/candidate", execute: (_binary, args) => ({ ...response(args, "king"), stdout: response(args, "king").stdout + '\n{"type":"error","error":{"name":"SECRET_PROVIDER_TEXT"}}' }) })
  assert.equal(report.passed, 0)
  assert.equal(report.results[0].error, "session_error")
  assert.ok(!JSON.stringify(report).includes("SECRET_PROVIDER_TEXT"))
})

test("Scout fixture writes fail acceptance", () => {
  const report = verify({ role: "scout", model: "fixture/candidate", execute: (_binary, args) => {
    const result = response(args, "scout")
    fs.writeFileSync(path.join(args[args.indexOf("--dir") + 1], "change.txt"), "unexpected write")
    return result
  } })
  assert.equal(report.passed, 0)
})

test("cleanup runs when the process launcher throws", () => {
  let directory
  assert.throws(() => verify({ role: "scout", model: "fixture/candidate", execute: (_binary, args) => {
    directory = args[args.indexOf("--dir") + 1]
    throw new Error("launcher failed")
  } }))
  assert.ok(!fs.existsSync(directory))
})

test("Warrior must read back the fixture after its edit", () => {
  const report = verify({ role: "warrior", model: "fixture/candidate", execute: (_binary, args) => {
    const result = response(args, "warrior")
    const events = result.stdout.split("\n")
    events.splice(2, 1)
    return { ...result, stdout: events.join("\n") }
  } })
  assert.equal(report.passed, 0)
})

test("existing inline provider configuration survives the temporary agent overlay", () => {
  const original = process.env.OPENCODE_CONFIG_CONTENT
  try {
    process.env.OPENCODE_CONFIG_CONTENT = '{/* keep providers */ "provider": {"fixture": {"options": {"apiKey": "test-only"}}}, "agent": {"existing": {"mode": "primary"}}}'
    const report = verify({ role: "scout", model: "fixture/candidate", attempts: 1, execute: (_binary, args, options) => {
      const config = jsonc.parse(options.env.OPENCODE_CONFIG_CONTENT)
      assert.equal(config.provider.fixture.options.apiKey, "test-only")
      assert.equal(config.agent.existing.mode, "primary")
      return response(args, "scout")
    } })
    assert.equal(report.passed, 1)
    assert.ok(!JSON.stringify(report).includes("apiKey"))
  } finally {
    if (original === undefined) delete process.env.OPENCODE_CONFIG_CONTENT
    else process.env.OPENCODE_CONFIG_CONTENT = original
  }
})

test("rejects invalid model references and attempt counts before launching", () => {
  for (const input of [{ role: "other", model: "fixture/candidate" },
    { role: "scout", model: "invalid" }, { role: "scout", model: "fixture/candidate", attempts: 4 }]) {
    assert.throws(() => verify({ ...input, execute: () => assert.fail("must not launch") }))
  }
})

test("matrix saves partial progress and requires six distinct candidates", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gryphon-matrix-test-"))
  try {
    const output = path.join(directory, "receipt.json")
    const plan = Object.fromEntries(["king", "warrior", "scout"].map((role) => [role, { primary: "fixture/" + role, backup: "fixture/" + role + "-backup" }]))
    let calls = 0
    const report = matrix(plan, output, (input) => {
      calls++
      assert.equal(JSON.parse(fs.readFileSync(output)).slots[calls - 1].status, "running")
      input.onResult({ attempt: 1, passed: false, error: "session_error" })
      assert.equal(JSON.parse(fs.readFileSync(output)).slots[calls - 1].lastAttempt.error, "session_error")
      if (calls === 2) throw new Error("private runtime detail")
      return { passed: 0 }
    })
    assert.equal(calls, 6)
    assert.equal(report.complete, false)
    assert.equal(report.slots[1].status, "runner_error")
    assert.ok(!fs.readFileSync(output, "utf8").includes("private runtime detail"))
    plan.scout.backup = plan.king.primary
    assert.throws(() => matrix(plan, output), /six distinct/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
