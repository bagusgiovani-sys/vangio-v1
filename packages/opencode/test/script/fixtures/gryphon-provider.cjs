// Deterministic HTTP boundary for the real source CLI, never a live provider.
const fs = require("node:fs")
const path = require("node:path")
const http = require("node:http")

const server = http.createServer(async (request, response) => {
  try {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    const context = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
    const messages = body.messages ?? []
    const history = messages.flatMap((message) => message.tool_calls ?? [])
    const file = path.join(context.directory, context.role === "warrior" ? "change.txt" : "fact.txt")
    const value = fs.readFileSync(file, "utf8").trim()
    const warrior = context.role === "warrior"
    const title = JSON.stringify(messages).includes("Generate a title")
    const tool = title ? undefined : history.length === 0 ? { name: "read", arguments: { filePath: file } }
      : warrior && history.length === 1 ? { name: "edit", arguments: { filePath: file, oldString: value, newString: value.replace("before-", "after-") } }
      : warrior && history.length === 2 ? { name: "read", arguments: { filePath: file } } : undefined
    const delta = tool
      ? { tool_calls: [{ index: 0, id: "fixture-tool-" + history.length, type: "function", function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }] }
      : { content: title ? "Fixture task" : value.replace("fact: ", "") }
    response.writeHead(200, { "content-type": "text/event-stream" })
    for (const [change, finish] of [[{ role: "assistant" }], [delta], [{}, tool ? "tool_calls" : "stop"]]) {
      response.write("data: " + JSON.stringify({ id: "fixture-response", object: "chat.completion.chunk", model: body.model,
        choices: [{ index: 0, delta: change, ...(finish ? { finish_reason: finish } : {}) }] }) + "\n\n")
    }
    response.end("data: [DONE]\n\n")
  } catch {
    response.writeHead(500)
    response.end("{}")
  }
})
server.listen(0, "127.0.0.1", () => process.send({ port: server.address().port }))
process.on("disconnect", () => server.close(() => process.exit(0)))
