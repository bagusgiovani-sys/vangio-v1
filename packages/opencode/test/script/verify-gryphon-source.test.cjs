const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { fork, spawnSync } = require("node:child_process")
const { once } = require("node:events")
const jsonc = require("jsonc-parser")
const { verify } = require("../../script/verify-gryphon-model.cjs")

test("real source CLI executes King, Warrior and Scout fixture tools without default-agent fallback", { timeout: 180000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gryphon-source-test-"))
  const context = path.join(directory, "context.json")
  const server = fork(path.join(__dirname, "fixtures/gryphon-provider.cjs"), [context], { stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true })
  try {
    const [{ port }] = await once(server, "message")
    for (const role of ["king", "warrior", "scout"]) {
      const report = verify({ role, model: "gryphon-check/candidate", attempts: 1, execute: (binary, args, options) => {
        fs.writeFileSync(context, JSON.stringify({ directory: args[args.indexOf("--dir") + 1], role }))
        const config = jsonc.parse(options.env.OPENCODE_CONFIG_CONTENT)
        config.model = "gryphon-check/candidate"
        config.enabled_providers = ["gryphon-check"]
        config.provider = { "gryphon-check": {
          npm: "@ai-sdk/openai-compatible", env: [],
          models: { candidate: { name: "Local fixture", tool_call: true, limit: { context: 262144, output: 131072 }, cost: { input: 0, output: 0 } } },
          options: { apiKey: "local-fixture-only", baseURL: "http://127.0.0.1:" + port + "/v1" },
        } }
        return spawnSync(binary, args, { ...options, timeout: 45000, env: {
          ...options.env,
          XDG_DATA_HOME: path.join(directory, "data"), XDG_CONFIG_HOME: path.join(directory, "config"),
          XDG_CACHE_HOME: path.join(directory, "cache"), XDG_STATE_HOME: path.join(directory, "state"),
          OPENCODE_TEST_HOME: path.join(directory, "home"), OPENCODE_CONFIG: "",
          OPENCODE_DISABLE_PROJECT_CONFIG: "true", OPENCODE_DISABLE_CLAUDE_CODE: "true",
          OPENCODE_MODELS_PATH: path.resolve(__dirname, "../tool/fixtures/models-api.json"),
          OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
        } })
      } })
      assert.equal(report.passed, 1, JSON.stringify(report))
      assert.ok(report.results[0].providerSteps >= 2)
    }
  } finally {
    server.kill()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
