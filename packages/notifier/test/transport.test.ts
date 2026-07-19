import { afterEach, describe, expect, test } from "bun:test"
import { createNtfyTransport } from "../src/transport"
import type { OutgoingNotification } from "../src/watcher"

const notification: OutgoingNotification = {
  title: "Needs approval - vangio-v1",
  body: "bash: bun test*",
  priority: "max",
  tags: "warning",
  clickUrl: "https://laptop.tail1234.ts.net/abc/session/ses_1",
  dedupeKey: "perm:per_1",
}

type Seen = { method: string; path: string; headers: Record<string, string>; body: string }

let server: ReturnType<typeof Bun.serve> | undefined
afterEach(() => server?.stop(true))

function fakeNtfy(handler: (seen: Seen, n: number) => Response): { url: string; seen: Seen[] } {
  const seen: Seen[] = []
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      const record: Seen = {
        method: req.method,
        path: new URL(req.url).pathname,
        headers: Object.fromEntries(req.headers.entries()),
        body: await req.text(),
      }
      seen.push(record)
      return handler(record, seen.length)
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, seen }
}

describe("createNtfyTransport", () => {
  test("POSTs to the topic with Title/Priority/Tags/Click headers", async () => {
    const ntfy = fakeNtfy(() => new Response("ok"))
    await createNtfyTransport({ topic: "my-secret-topic", server: ntfy.url }).send(notification)
    expect(ntfy.seen).toHaveLength(1)
    expect(ntfy.seen[0]!.method).toBe("POST")
    expect(ntfy.seen[0]!.path).toBe("/my-secret-topic")
    expect(ntfy.seen[0]!.headers["title"]).toBe("Needs approval - vangio-v1")
    expect(ntfy.seen[0]!.headers["priority"]).toBe("5")
    expect(ntfy.seen[0]!.headers["tags"]).toBe("warning")
    expect(ntfy.seen[0]!.headers["click"]).toBe(notification.clickUrl)
    expect(ntfy.seen[0]!.body).toBe("bash: bun test*")
  })

  test("omits Click header when clickUrl is absent", async () => {
    const ntfy = fakeNtfy(() => new Response("ok"))
    await createNtfyTransport({ topic: "t", server: ntfy.url }).send({ ...notification, clickUrl: undefined })
    expect(ntfy.seen[0]!.headers["click"]).toBeUndefined()
  })

  test("maps priorities: high → 4, default → 3", async () => {
    const ntfy = fakeNtfy(() => new Response("ok"))
    const transport = createNtfyTransport({ topic: "t", server: ntfy.url })
    await transport.send({ ...notification, priority: "high" })
    await transport.send({ ...notification, priority: "default" })
    expect(ntfy.seen[0]!.headers["priority"]).toBe("4")
    expect(ntfy.seen[1]!.headers["priority"]).toBe("3")
  })

  test("retries once on server error, then succeeds", async () => {
    const ntfy = fakeNtfy((_seen, n) => (n === 1 ? new Response("boom", { status: 500 }) : new Response("ok")))
    await createNtfyTransport({ topic: "t", server: ntfy.url }).send(notification)
    expect(ntfy.seen).toHaveLength(2)
  })

  test("never rejects even when every attempt fails", async () => {
    const ntfy = fakeNtfy(() => new Response("boom", { status: 500 }))
    await expect(createNtfyTransport({ topic: "t", server: ntfy.url }).send(notification)).resolves.toBeUndefined()
    expect(ntfy.seen).toHaveLength(2)
  })

  test("never rejects when the server is unreachable", async () => {
    const transport = createNtfyTransport({ topic: "t", server: "http://127.0.0.1:1" })
    await expect(transport.send(notification)).resolves.toBeUndefined()
  })
})
