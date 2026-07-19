import { describe, expect, test } from "bun:test"
import { decide, initialState, type BusEvent, type WatcherConfig } from "../src/watcher"

const config: WatcherConfig = {
  minRuntimeMs: 30_000,
  dedupeWindowMs: 60_000,
  projectName: "vangio-v1",
  clickBaseUrl: "https://laptop.tail1234.ts.net",
  directoryB64: "QzpcRXhvZHVz",
}

const permissionAsked: BusEvent = {
  type: "permission.asked",
  properties: {
    id: "per_123",
    sessionID: "ses_abc",
    permission: "bash",
    patterns: ["bun test*"],
    metadata: {},
    always: [],
  },
}

const status = (sessionID: string, type: "busy" | "idle" | "retry"): BusEvent => ({
  type: "session.status",
  properties: { sessionID, status: { type } },
})

describe("permission.asked", () => {
  test("notifies at max priority with permission summary and deep link", () => {
    const result = decide(permissionAsked, initialState(), 1_000, config)
    expect(result).not.toBeNull()
    expect(result!.priority).toBe("max")
    expect(result!.title).toBe("Needs approval - vangio-v1")
    expect(result!.body).toBe("bash: bun test*")
    expect(result!.tags).toBe("warning")
    expect(result!.clickUrl).toBe("https://laptop.tail1234.ts.net/QzpcRXhvZHVz/session/ses_abc")
    expect(result!.dedupeKey).toBe("perm:per_123")
  })

  test("title and body are ASCII-only (HTTP header constraint)", () => {
    const result = decide(permissionAsked, initialState(), 1_000, config)
    expect(result!.title).toMatch(/^[\x20-\x7E]*$/)
  })

  test("duplicate within dedupe window is dropped", () => {
    const state = initialState()
    expect(decide(permissionAsked, state, 1_000, config)).not.toBeNull()
    expect(decide(permissionAsked, state, 30_000, config)).toBeNull()
    expect(decide(permissionAsked, state, 62_000, config)).not.toBeNull()
  })
})

describe("session.status busy → idle", () => {
  test("run longer than threshold notifies done with duration", () => {
    const state = initialState()
    expect(decide(status("ses_abc", "busy"), state, 0, config)).toBeNull()
    const result = decide(status("ses_abc", "idle"), state, 95_000, config)
    expect(result).not.toBeNull()
    expect(result!.priority).toBe("default")
    expect(result!.title).toBe("Done - vangio-v1")
    expect(result!.body).toBe("Session finished after 2 min")
    expect(result!.tags).toBe("white_check_mark")
    expect(result!.dedupeKey).toBe("idle:ses_abc")
  })

  test("run shorter than threshold stays silent", () => {
    const state = initialState()
    decide(status("ses_abc", "busy"), state, 0, config)
    expect(decide(status("ses_abc", "idle"), state, 5_000, config)).toBeNull()
  })

  test("idle without a recorded busy stays silent", () => {
    expect(decide(status("ses_abc", "idle"), initialState(), 99_000, config)).toBeNull()
  })

  test("retry status is ignored", () => {
    expect(decide(status("ses_abc", "retry"), initialState(), 1_000, config)).toBeNull()
  })

  test("second idle for the same run does not re-notify", () => {
    const state = initialState()
    decide(status("ses_abc", "busy"), state, 0, config)
    expect(decide(status("ses_abc", "idle"), state, 60_000, config)).not.toBeNull()
    expect(decide(status("ses_abc", "idle"), state, 61_000, config)).toBeNull()
  })
})

describe("session.error", () => {
  test("notifies at high priority WITHOUT error details in the body", () => {
    const event: BusEvent = {
      type: "session.error",
      properties: { sessionID: "ses_abc", error: "secret stack trace with code" },
    }
    const result = decide(event, initialState(), 1_000, config)
    expect(result).not.toBeNull()
    expect(result!.priority).toBe("high")
    expect(result!.title).toBe("Error - vangio-v1")
    expect(result!.body).toBe("A session hit an error and needs attention")
    expect(result!.body).not.toContain("secret")
    expect(result!.tags).toBe("x")
  })
})

describe("config edge cases", () => {
  test("no clickBaseUrl means no clickUrl", () => {
    const bare = { ...config, clickBaseUrl: undefined }
    const result = decide(permissionAsked, initialState(), 1_000, bare)
    expect(result!.clickUrl).toBeUndefined()
  })

  test("unknown event types are ignored", () => {
    expect(decide({ type: "message.updated" }, initialState(), 1_000, config)).toBeNull()
  })

  test("malformed properties do not throw", () => {
    expect(decide({ type: "permission.asked" }, initialState(), 1_000, config)).not.toBeNull()
    expect(decide({ type: "session.status", properties: { status: "nope" } }, initialState(), 1, config)).toBeNull()
  })
})
