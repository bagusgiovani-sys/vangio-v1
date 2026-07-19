import { describe, expect, test } from "bun:test"
import VangioNotifier, { createNotifierPlugin } from "../src/plugin"
import type { OutgoingNotification } from "../src/watcher"
import type { Transport } from "../src/transport"

function recordingTransport(): Transport & { sent: OutgoingNotification[] } {
  const sent: OutgoingNotification[] = []
  return {
    sent,
    async send(notification) {
      sent.push(notification)
    },
  }
}

// The plugin only reads `directory` from its input; everything else is unused in v1.
const input = { directory: "C:\\Exodus\\Projects\\demo-app" } as any

const permissionEvent = {
  event: {
    type: "permission.asked",
    properties: { id: "per_1", sessionID: "ses_1", permission: "bash", patterns: ["rm *"], metadata: {}, always: [] },
  } as any,
}

describe("createNotifierPlugin", () => {
  test("without VANGIO_NTFY_TOPIC the plugin is inert", async () => {
    const hooks = await createNotifierPlugin({ env: {} })(input)
    expect(hooks.event).toBeUndefined()
  })

  test("permission.asked flows through to the transport with project folder name", async () => {
    const transport = recordingTransport()
    const hooks = await createNotifierPlugin({
      transport,
      env: { VANGIO_NTFY_TOPIC: "t", VANGIO_CLICK_BASE_URL: "https://laptop.ts.net/" },
      now: () => 1_000,
    })(input)
    await hooks.event!({ event: permissionEvent.event })
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]!.title).toBe("Needs approval - demo-app")
    // click URL uses the app's URL-safe base64 of the directory, trailing slash trimmed from base
    expect(transport.sent[0]!.clickUrl).toMatch(/^https:\/\/laptop\.ts\.net\/[A-Za-z0-9_-]+\/session\/ses_1$/)
  })

  test("a hook call never throws, even on malformed events", async () => {
    const transport = recordingTransport()
    const hooks = await createNotifierPlugin({ transport, env: { VANGIO_NTFY_TOPIC: "t" } })(input)
    await expect(
      hooks.event!({ event: { type: "session.status", properties: { status: 42 } } as any }),
    ).resolves.toBeUndefined()
    expect(transport.sent).toHaveLength(0)
  })

  test("VANGIO_MIN_RUNTIME_MS is honored", async () => {
    const transport = recordingTransport()
    let clock = 0
    const hooks = await createNotifierPlugin({
      transport,
      env: { VANGIO_NTFY_TOPIC: "t", VANGIO_MIN_RUNTIME_MS: "5000" },
      now: () => clock,
    })(input)
    const status = (type: string) => ({
      event: { type: "session.status", properties: { sessionID: "s", status: { type } } } as any,
    })
    await hooks.event!(status("busy"))
    clock = 6_000
    await hooks.event!(status("idle"))
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0]!.title).toBe("Done - demo-app")
  })
})

describe("dispose drains in-flight sends", () => {
  // The host dispatches events without awaiting the hook (void hook.event(...)), so a
  // short-lived process (`vangio run`) can exit while the ntfy POST is still in flight.
  // Instance teardown DOES await dispose — the plugin must drain pending sends there.
  test("dispose resolves only after a slow send completes", async () => {
    const sent: OutgoingNotification[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slowTransport: Transport = {
      async send(notification) {
        await gate
        sent.push(notification)
      },
    }
    const hooks = await createNotifierPlugin({
      transport: slowTransport,
      env: { VANGIO_NTFY_TOPIC: "t" },
      now: () => 1_000,
    })(input)

    // Fire without awaiting, like the host does.
    void hooks.event!({ event: permissionEvent.event })
    await Bun.sleep(0) // let the hook reach the transport
    expect(sent).toHaveLength(0)

    let disposed = false
    const disposal = hooks.dispose!().then(() => (disposed = true))
    await Bun.sleep(10)
    expect(disposed).toBe(false) // still waiting on the in-flight send

    release()
    await disposal
    expect(disposed).toBe(true)
    expect(sent).toHaveLength(1)
  })
})

describe("plugin module shape", () => {
  // File plugins load through readV1Plugin (packages/opencode/src/plugin/shared.ts): the default
  // export must be an object with an `id` and a `server` function, or the legacy fallback would
  // invoke every named export - including the factory - as a plugin.
  test("default export is { id, server } for the v1 plugin loader", () => {
    expect(VangioNotifier.id).toBe("vangio-notifier")
    expect(typeof VangioNotifier.server).toBe("function")
  })
})
