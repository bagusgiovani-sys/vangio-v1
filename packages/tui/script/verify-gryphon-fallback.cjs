const fs = require("node:fs")
const path = require("node:path")
const os = require("node:os")
const http = require("node:http")
const { createRequire } = require("node:module")
const root = path.resolve(__dirname, "../../..")
const artifacts = path.resolve(process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "gryphon-terminal-receipts-")))
fs.mkdirSync(artifacts, { recursive: true })
const fromApp = createRequire(path.join(root, "packages/opencode/package.json"))
const pty = createRequire(fromApp.resolve("@opentui/core"))("@lydell/node-pty")
const bun = process.env.BUN_BINARY ?? path.join(os.homedir(), ".bun/bin/bun.exe")

async function run(scenario) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `gryphon-terminal-${scenario}-`))
  const requests = []
  const expected =
    scenario === "manual"
      ? ["primary", "backup", "primary", "backup", "backup"]
      : scenario === "resume"
        ? ["primary", "backup", "backup"]
        : ["primary", "backup"]
  let output = "",
    proc,
    ended = false,
    stage = "startup",
    followup = false,
    timer,
    viewMark = 0
  let finish
  const done = new Promise((resolve) => {
    finish = (status, detail) => {
      if (ended) return
      ended = true
      clearTimeout(timer)
      if (proc) proc.kill()
      fs.writeFileSync(path.join(artifacts, `gryphon-${scenario}-terminal.txt`), output)
      resolve({ scenario, status, detail, requests, directory })
    }
  })
  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    let body
    try {
      body = JSON.parse(Buffer.concat(chunks).toString())
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    const title = JSON.stringify(body.messages).includes("Generate a title")
    if (!title) requests.push({ model: body.model, followup })
    if (!title && body.model !== expected[requests.length - 1]) {
      res.writeHead(400)
      res.end("{}")
      finish("failed", `Request ${requests.length} expected ${expected[requests.length - 1]}, received ${body.model}.`)
      return
    }
    if (!title && (body.model === "primary" || scenario === "exhaust")) {
      res.writeHead(429, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: { type: "FreeUsageLimitError", message: "Free usage exceeded" } }))
      return
    }
    res.writeHead(200, { "content-type": "text/event-stream" })
    const send = (delta, finish_reason) =>
      res.write(
        `data: ${JSON.stringify({
          id: "fixture-response",
          object: "chat.completion.chunk",
          choices: [{ index: 0, delta, ...(finish_reason ? { finish_reason } : {}) }],
        })}\n\n`,
      )
    send({ role: "assistant" })
    send({
      content: title
        ? "Gryphon terminal fixture"
        : scenario === "manual" && requests.length === 4
          ? "GRYPHON_MANUAL_BACKUP"
          : scenario === "manual" && requests.length === 5
            ? "GRYPHON_MANUAL_RESUME_OK"
            : followup
              ? "GRYPHON_RESUME_OK"
              : "GRYPHON_BACKUP_CONTINUED",
    })
    setTimeout(
      () => {
        if (!res.destroyed) {
          send({}, "stop")
          res.end("data: [DONE]\n\n")
        }
      },
      title ? 0 : 1200,
    )
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  const model = {
    name: "Fixture",
    tool_call: true,
    limit: { context: 64000, output: 4000 },
    cost: { input: 0, output: 0 },
  }
  const role = (mode, readOnly = false) => ({
    mode,
    model: "gryphon-check/primary",
    options: { fallback: ["gryphon-check/backup"], fallbackPolicy: "declared-only", freeOnly: true },
    ...(readOnly ? { permission: { edit: "deny" } } : {}),
  })
  const env = {
    ...process.env,
    XDG_DATA_HOME: path.join(directory, "data"),
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_CACHE_HOME: path.join(directory, "cache"),
    XDG_STATE_HOME: path.join(directory, "state"),
    OPENCODE_TEST_HOME: path.join(directory, "home"),
    OPENCODE_DISABLE_PROJECT_CONFIG: "true",
    OPENCODE_DISABLE_CLAUDE_CODE: "true",
    OPENCODE_MODELS_PATH: path.join(root, "packages/opencode/test/tool/fixtures/models-api.json"),
    OPENCODE_CONFIG_CONTENT: JSON.stringify({
      model: "gryphon-check/primary",
      enabled_providers: ["gryphon-check"],
      provider: {
        "gryphon-check": {
          npm: "@ai-sdk/openai-compatible",
          env: [],
          models: {
            primary: { ...model, name: "Primary Fixture" },
            backup: { ...model, name: "Backup Fixture" },
            undeclared: model,
          },
          options: { apiKey: "local-fixture-only", baseURL: `http://127.0.0.1:${server.address().port}/v1` },
        },
      },
      agent: {
        build: role("primary"),
        plan: role("primary", true),
        warrior: role("subagent"),
        scout: role("subagent", true),
      },
    }),
  }
  timer = setTimeout(() => finish("failed", `Timed out at ${stage}`), 45000)
  try {
    proc = pty.spawn(
      bun,
      ["run", "--cwd", path.join(root, "packages/opencode"), "--conditions=browser", "src/index.ts"],
      { name: "xterm-256color", cols: 140, rows: 40, cwd: directory, env },
    )
    proc.onData((data) => {
      output += data
      for (const [query, response] of [
        ["\x1b[>0q", "\x1bP>|xterm(388)\x1b\\"],
        ["\x1b[c", "\x1b[?62;22c"],
        ["\x1b[6n", "\x1b[1;1R"],
        ["\x1b[?u", "\x1b[?0u"],
        ["\x1b[?2026$p", "\x1b[?2026;2$y"],
        ["\x1b[14t", "\x1b[4;800;1400t"],
        ["\x1b[16t", "\x1b[6;20;10t"],
      ])
        if (data.includes(query)) proc.write(response)
      const plain = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
      if (stage === "startup" && ["King:", "Warrior:", "Scout:"].every((value) => plain.includes(value))) {
        stage = "prompt"
        proc.write("Verify the Gryphon terminal fixture.")
        setTimeout(() => {
          if (!ended) proc.write("\r")
        }, 350)
      }
      if (scenario === "resume" && stage === "prompt" && plain.includes("GRYPHON_BACKUP_CONTINUED")) {
        stage = "followup"
        setTimeout(() => {
          if (ended) return
          followup = true
          proc.write("Continue the same task after the automatic switch.")
          setTimeout(() => {
            if (!ended) proc.write("\r")
          }, 350)
        }, 2200)
      }
      if (scenario === "resume" && stage === "followup" && plain.includes("GRYPHON_RESUME_OK")) {
        if (!plain.includes("gryphon-check/backup replaces gryphon-check/primary"))
          finish("failed", "Automatic switch notice was not rendered.")
        else finish("passed", "Actual terminal shows the switch and follow-up uses the backup.")
      }
      if (scenario === "manual" && stage === "prompt" && plain.includes("GRYPHON_BACKUP_CONTINUED")) {
        stage = "role-dialog"
        setTimeout(() => {
          if (ended) return
          proc.write("/models")
          setTimeout(() => {
            if (!ended) proc.write("\r")
          }, 350)
        }, 2200)
      }
      if (scenario === "manual" && stage === "role-dialog" && plain.includes("Switch model by role")) {
        stage = "model-dialog"
        viewMark = output.length
        proc.write("\r")
      }
      if (
        scenario === "manual" &&
        stage === "model-dialog" &&
        output
          .slice(viewMark)
          .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
          .includes("Primary Fixture")
      ) {
        stage = "saving"
        proc.write("Primary Fixture")
        setTimeout(() => {
          if (!ended) proc.write("\r")
        }, 350)
      }
      if (scenario === "manual" && stage === "saving" && plain.includes("King model saved")) {
        stage = "manual-retry"
        proc.write("Retry the primary I explicitly selected.")
        setTimeout(() => {
          if (!ended) proc.write("\r")
        }, 350)
      }
      if (scenario === "manual" && stage === "manual-retry" && plain.includes("GRYPHON_MANUAL_BACKUP")) {
        stage = "manual-followup"
        setTimeout(() => {
          if (ended) return
          followup = true
          proc.write("Continue after that primary failed again.")
          setTimeout(() => {
            if (!ended) proc.write("\r")
          }, 350)
        }, 2200)
      }
      if (scenario === "manual" && stage === "manual-followup" && plain.includes("GRYPHON_MANUAL_RESUME_OK")) {
        finish("passed", "King picker honors an explicit primary choice; a later automatic switch supersedes it.")
      }
      if (
        scenario === "exhaust" &&
        plain.includes("No eligible backup is") &&
        plain.includes("available. Check the provider's usage limits")
      ) {
        if (requests.map((item) => item.model).join(",") !== "primary,backup")
          finish("failed", "Unexpected requests after pair exhaustion.")
        else finish("passed", "Actual terminal displays bounded pair exhaustion.")
      }
    })
    proc.onExit((event) => finish("failed", `Terminal exited ${event.exitCode} at ${stage}`))
  } catch (error) {
    finish("failed", error.message)
  }
  const result = await done
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  return result
}

;(async () => {
  const results = []
  for (const scenario of ["resume", "exhaust", "manual"]) results.push(await run(scenario))
  const receipt = {
    results,
    scope:
      "Original source under ConPTY; localhost provider fixtures; isolated configuration. No live provider or installed-user acceptance.",
  }
  fs.writeFileSync(path.join(artifacts, "gryphon-live-terminal-result.json"), JSON.stringify(receipt, null, 2))
  console.log(JSON.stringify({ ...receipt, artifacts }, null, 2))
  process.exitCode = results.every((result) => result.status === "passed") ? 0 : 1
})().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
