# Mobile Session Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Watch, reply to, and approve VanGio sessions from an Android phone — laptop lid closed — via the existing web app over Tailscale, plus a new notifier plugin that pushes ntfy notifications.

**Architecture:** The VanGio server (`opencode serve`) and web app (`packages/app`) already exist; both get exposed to the owner's private Tailscale network via `tailscale serve` (HTTPS). The only new code is `packages/notifier`: an opencode plugin whose `event` hook filters bus events through a pure `decide()` watcher and sends notifications through a `Transport` interface (v1: ntfy POST; v2 will add Web Push without touching the watcher).

**Tech Stack:** TypeScript + Bun (bun:test), opencode plugin API (`@opencode-ai/plugin`), ntfy.sh, Tailscale. Zero new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-07-17-mobile-session-control-design.md`

## Verified facts this plan is built on (checked against source 2026-07-17)

| Fact | Source |
|---|---|
| Plugin type: `Plugin = (input: PluginInput, options?) => Promise<Hooks>`; `PluginInput` includes `directory`, `client`, `serverUrl` | `packages/plugin/src/index.ts:56-74` |
| Event hook: `event?: (input: { event: Event }) => Promise<void>` | `packages/plugin/src/index.ts:224` |
| Global plugin dir auto-loaded: `~/.config/opencode/plugins/` | `packages/web/src/content/docs/plugins.mdx:60` |
| Permission event is `permission.asked`, properties = `{ id, sessionID, permission: string, patterns: string[], metadata, always, tool? }` — **no `title` field** | `packages/schema/src/v1/permission.ts:27-35,61` |
| Session activity event is `session.status`, properties `{ sessionID, status: { type: "idle" \| "busy" \| "retry" } }`; `session.idle` exists but is deprecated | `packages/schema/src/session-status-event.ts:29-49` |
| Error event is `session.error` | `packages/schema/src/v1/session.ts:652` |
| Web app deep link shape: `/${base64Encode(directory)}/session/${sessionID}` | `packages/app/src/context/notification.tsx:380` |
| `base64Encode` = URL-safe base64, no padding | `packages/core/src/util/encode.ts:1-5` |
| Headless server: `opencode serve` (yargs `withNetworkOptions`) | `packages/opencode/src/cli/cmd/serve.ts:7-9` |
| Web app is plain Vite: `build` / `serve` (preview) scripts | `packages/app/package.json:19-20` |
| Web app already has permission approve/deny UI | `packages/app/src/pages/session/composer/session-permission-dock.tsx` |

**Deviations from the spec (all forced by verified reality):**
1. Permission notification body uses `permission` + `patterns` (e.g. `bash: bun test*`) because the v1 permission Request has no `title`.
2. "Done" notification shows project folder name + run duration, not session title (avoids an unverified SDK call; title enrichment is a v2 nicety).
3. Notification titles are ASCII-only with emoji delivered via ntfy `Tags` headers — HTTP header values must be ASCII, so literal `⚠/✅/❌` in a header would break `fetch`.

## Global Constraints

- **Commit at checkpoints.** Project rule (`.claude/CLAUDE.md`, changed 2026-07-17): commit AND push at every natural checkpoint without waiting to be asked; commits stay scoped to one logical change, and unverified work is never committed. Every "Commit" step below means: commit and push once that step's verification passes.
- **Post-v1 discipline:** this plan is parked until v1 Phases 7–8 ship, unless the user says otherwise (`docs/fork/build-progress.md`).
- Payload policy: notifications never contain code, diffs, prompts, or error message text — only project name, event type, permission summary, duration.
- The notifier must never crash or slow a session: every hook body is wrapped in try/catch; transport sends are fire-and-forget with one retry.
- Zero new npm dependencies. Type-only import from `@opencode-ai/plugin` (erased at build).
- All commands below run from the repo root `C:\Exodus\Projects\VanGio-AI Agent\vangio-v1` unless stated. Shell: Git Bash unless marked PowerShell.

## File Structure

```
packages/notifier/
├── package.json          # workspace member (packages/* glob already covers it)
├── tsconfig.json
├── src/
│   ├── watcher.ts        # pure decision logic: BusEvent → OutgoingNotification | null
│   ├── transport.ts      # Transport interface + createNtfyTransport
│   └── plugin.ts         # plugin entry: env config, wiring, fire-and-forget
└── test/
    ├── watcher.test.ts
    ├── transport.test.ts
    └── plugin.test.ts
docs/fork/mobile-control-setup.md   # laptop + phone setup guide (Task 4)
```

---

### Task 1: Watcher — pure notification decision logic

**Files:**
- Create: `packages/notifier/package.json`
- Create: `packages/notifier/tsconfig.json`
- Create: `packages/notifier/src/watcher.ts`
- Test: `packages/notifier/test/watcher.test.ts`

**Interfaces:**
- Consumes: nothing (dependency-free by design — testable without the plugin API).
- Produces: `OutgoingNotification { title: string; body: string; priority: "max"|"high"|"default"; tags: string; clickUrl?: string; dedupeKey: string }`, `WatcherConfig`, `WatcherState`, `initialState(): WatcherState`, `decide(event: BusEvent, state: WatcherState, now: number, config: WatcherConfig): OutgoingNotification | null`, `BusEvent { type: string; properties?: Record<string, unknown> }`. Tasks 2 and 3 rely on these exact names.

- [ ] **Step 1: Create the package scaffolding**

`packages/notifier/package.json`:

```json
{
  "name": "@vangio/notifier",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/plugin.ts"
  },
  "scripts": {
    "test": "bun test ./test",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "devDependencies": {
    "@opencode-ai/plugin": "workspace:*",
    "@types/bun": "catalog:",
    "typescript": "catalog:"
  }
}
```

`packages/notifier/tsconfig.json`:

```json
{
  "extends": "@tsconfig/bun/tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["bun"]
  },
  "include": ["src", "test"]
}
```

Run: `bun install`
Expected: completes without errors, links the new workspace package.

- [ ] **Step 2: Write the failing watcher tests**

`packages/notifier/test/watcher.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test packages/notifier/test/watcher.test.ts`
Expected: FAIL — cannot resolve `../src/watcher`.

- [ ] **Step 4: Implement the watcher**

`packages/notifier/src/watcher.ts`:

```ts
export type NotificationPriority = "max" | "high" | "default"

export type OutgoingNotification = {
  title: string
  body: string
  priority: NotificationPriority
  /** ntfy Tags header value — emoji shortcodes, since header values must stay ASCII */
  tags: string
  clickUrl?: string
  dedupeKey: string
}

export type WatcherConfig = {
  minRuntimeMs: number
  dedupeWindowMs: number
  projectName: string
  /** e.g. https://laptop.tail1234.ts.net — no trailing slash. Absent = no click links. */
  clickBaseUrl?: string
  /** base64Encode(directory), precomputed once by plugin.ts */
  directoryB64: string
}

export type WatcherState = {
  busySince: Map<string, number>
  lastSent: Map<string, number>
}

/** Structural view of bus events — keeps the watcher free of plugin-API imports for testing. */
export type BusEvent = { type: string; properties?: Record<string, unknown> }

export function initialState(): WatcherState {
  return { busySince: new Map(), lastSent: new Map() }
}

export function decide(
  event: BusEvent,
  state: WatcherState,
  now: number,
  config: WatcherConfig,
): OutgoingNotification | null {
  const candidate = evaluate(event, state, now, config)
  if (!candidate) return null
  const last = state.lastSent.get(candidate.dedupeKey)
  if (last !== undefined && now - last < config.dedupeWindowMs) return null
  state.lastSent.set(candidate.dedupeKey, now)
  return candidate
}

function evaluate(
  event: BusEvent,
  state: WatcherState,
  now: number,
  config: WatcherConfig,
): OutgoingNotification | null {
  const props = event.properties ?? {}

  if (event.type === "permission.asked") {
    const sessionID = str(props.sessionID)
    const permission = str(props.permission) ?? "unknown"
    const patterns = Array.isArray(props.patterns) ? props.patterns.filter((p) => typeof p === "string") : []
    return {
      title: `Needs approval - ${config.projectName}`,
      body: patterns.length ? `${permission}: ${patterns.join(", ")}` : permission,
      priority: "max",
      tags: "warning",
      clickUrl: sessionUrl(config, sessionID),
      dedupeKey: `perm:${str(props.id) ?? sessionID ?? "unknown"}`,
    }
  }

  if (event.type === "session.status") {
    const sessionID = str(props.sessionID) ?? "unknown"
    const statusType =
      typeof props.status === "object" && props.status !== null
        ? str((props.status as Record<string, unknown>).type)
        : undefined
    if (statusType === "busy") {
      if (!state.busySince.has(sessionID)) state.busySince.set(sessionID, now)
      return null
    }
    if (statusType === "idle") {
      const since = state.busySince.get(sessionID)
      state.busySince.delete(sessionID)
      if (since === undefined || now - since < config.minRuntimeMs) return null
      return {
        title: `Done - ${config.projectName}`,
        body: `Session finished after ${formatDuration(now - since)}`,
        priority: "default",
        tags: "white_check_mark",
        clickUrl: sessionUrl(config, sessionID),
        dedupeKey: `idle:${sessionID}`,
      }
    }
    return null
  }

  if (event.type === "session.error") {
    const sessionID = str(props.sessionID)
    // Deliberately generic: error text can contain code, which never leaves the laptop.
    return {
      title: `Error - ${config.projectName}`,
      body: "A session hit an error and needs attention",
      priority: "high",
      tags: "x",
      clickUrl: sessionUrl(config, sessionID),
      dedupeKey: `error:${sessionID ?? "unknown"}`,
    }
  }

  return null
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 90) return `${seconds} s`
  return `${Math.round(seconds / 60)} min`
}

function sessionUrl(config: WatcherConfig, sessionID: string | undefined): string | undefined {
  if (!config.clickBaseUrl) return undefined
  const base = `${config.clickBaseUrl}/${config.directoryB64}`
  return sessionID ? `${base}/session/${sessionID}` : base
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test packages/notifier/test/watcher.test.ts`
Expected: PASS, all tests green. (Note: the "2 min" duration case is 95 s → `Math.round(95/60)` = 2.)

- [ ] **Step 6: Typecheck**

Run: `bun x tsc --noEmit -p packages/notifier/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit (user-gated)**

Suggested message: `feat(notifier): watcher decision logic for mobile push notifications`
Ask the user before running any git command (Global Constraints).

---

### Task 2: NtfyTransport

**Files:**
- Create: `packages/notifier/src/transport.ts`
- Test: `packages/notifier/test/transport.test.ts`

**Interfaces:**
- Consumes: `OutgoingNotification` from `../src/watcher` (Task 1).
- Produces: `Transport { send(notification: OutgoingNotification): Promise<void> }` and `createNtfyTransport(input: { topic: string; server?: string; fetchFn?: typeof fetch }): Transport`. Task 3 relies on these exact names. `send` never rejects.

- [ ] **Step 1: Write the failing transport tests**

`packages/notifier/test/transport.test.ts`:

```ts
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
    expect(ntfy.seen[0].method).toBe("POST")
    expect(ntfy.seen[0].path).toBe("/my-secret-topic")
    expect(ntfy.seen[0].headers["title"]).toBe("Needs approval - vangio-v1")
    expect(ntfy.seen[0].headers["priority"]).toBe("5")
    expect(ntfy.seen[0].headers["tags"]).toBe("warning")
    expect(ntfy.seen[0].headers["click"]).toBe(notification.clickUrl)
    expect(ntfy.seen[0].body).toBe("bash: bun test*")
  })

  test("omits Click header when clickUrl is absent", async () => {
    const ntfy = fakeNtfy(() => new Response("ok"))
    await createNtfyTransport({ topic: "t", server: ntfy.url }).send({ ...notification, clickUrl: undefined })
    expect(ntfy.seen[0].headers["click"]).toBeUndefined()
  })

  test("maps priorities: high → 4, default → 3", async () => {
    const ntfy = fakeNtfy(() => new Response("ok"))
    const transport = createNtfyTransport({ topic: "t", server: ntfy.url })
    await transport.send({ ...notification, priority: "high" })
    await transport.send({ ...notification, priority: "default" })
    expect(ntfy.seen[0].headers["priority"]).toBe("4")
    expect(ntfy.seen[1].headers["priority"]).toBe("3")
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/notifier/test/transport.test.ts`
Expected: FAIL — cannot resolve `../src/transport`.

- [ ] **Step 3: Implement the transport**

`packages/notifier/src/transport.ts`:

```ts
import type { OutgoingNotification } from "./watcher"

export type Transport = {
  /** Fire-and-forget: resolves on success or after exhausting the single retry. Never rejects. */
  send(notification: OutgoingNotification): Promise<void>
}

const PRIORITY: Record<OutgoingNotification["priority"], string> = {
  max: "5",
  high: "4",
  default: "3",
}

export function createNtfyTransport(input: {
  topic: string
  server?: string
  fetchFn?: typeof fetch
}): Transport {
  const server = (input.server ?? "https://ntfy.sh").replace(/\/+$/, "")
  const url = `${server}/${input.topic}`
  const fetchFn = input.fetchFn ?? fetch

  return {
    async send(notification) {
      const headers: Record<string, string> = {
        Title: notification.title,
        Priority: PRIORITY[notification.priority],
        Tags: notification.tags,
      }
      if (notification.clickUrl) headers.Click = notification.clickUrl

      const attempt = async () => {
        const response = await fetchFn(url, {
          method: "POST",
          body: notification.body,
          headers,
          signal: AbortSignal.timeout(5000),
        })
        if (!response.ok) throw new Error(`ntfy responded ${response.status}`)
      }

      try {
        await attempt()
      } catch {
        try {
          await attempt()
        } catch (error) {
          console.error("[vangio-notifier] notification dropped:", error)
        }
      }
    },
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/notifier/test/transport.test.ts`
Expected: PASS. Then run the whole package: `bun test packages/notifier/test` — all green.

- [ ] **Step 5: Typecheck**

Run: `bun x tsc --noEmit -p packages/notifier/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit (user-gated)**

Suggested message: `feat(notifier): ntfy transport with single retry and ASCII-safe headers`

---

### Task 3: Plugin entry — wiring, env config, fire-and-forget

**Files:**
- Create: `packages/notifier/src/plugin.ts`
- Test: `packages/notifier/test/plugin.test.ts`

**Interfaces:**
- Consumes: `decide`, `initialState`, `WatcherConfig`, `BusEvent` (Task 1); `Transport`, `createNtfyTransport` (Task 2); `Plugin` type from `@opencode-ai/plugin`.
- Produces: `createNotifierPlugin(deps?: { transport?: Transport; now?: () => number; env?: Record<string, string | undefined> }): Plugin` and the default export `VangioNotifier` (what the opencode loader picks up). Env contract: `VANGIO_NTFY_TOPIC` (required — absent means the plugin loads but does nothing), `VANGIO_CLICK_BASE_URL` (optional), `VANGIO_MIN_RUNTIME_MS` (optional, default 30000), `VANGIO_NTFY_SERVER` (optional, default https://ntfy.sh).

- [ ] **Step 1: Write the failing plugin tests**

`packages/notifier/test/plugin.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { createNotifierPlugin } from "../src/plugin"
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
    expect(transport.sent[0].title).toBe("Needs approval - demo-app")
    // click URL uses the app's URL-safe base64 of the directory, trailing slash trimmed from base
    expect(transport.sent[0].clickUrl).toMatch(/^https:\/\/laptop\.ts\.net\/[A-Za-z0-9_-]+\/session\/ses_1$/)
  })

  test("a hook call never throws, even on malformed events", async () => {
    const transport = recordingTransport()
    const hooks = await createNotifierPlugin({ transport, env: { VANGIO_NTFY_TOPIC: "t" } })(input)
    await expect(hooks.event!({ event: { type: "session.status", properties: { status: 42 } } as any })).resolves.toBeUndefined()
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
    const status = (type: string) => ({ event: { type: "session.status", properties: { sessionID: "s", status: { type } } } as any })
    await hooks.event!(status("busy"))
    clock = 6_000
    await hooks.event!(status("idle"))
    expect(transport.sent).toHaveLength(1)
    expect(transport.sent[0].title).toBe("Done - demo-app")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/notifier/test/plugin.test.ts`
Expected: FAIL — cannot resolve `../src/plugin`.

- [ ] **Step 3: Implement the plugin entry**

`packages/notifier/src/plugin.ts`:

```ts
import type { Plugin } from "@opencode-ai/plugin"
import { decide, initialState, type BusEvent, type WatcherConfig } from "./watcher"
import { createNtfyTransport, type Transport } from "./transport"

/**
 * Must produce byte-identical output to packages/core/src/util/encode.ts:base64Encode —
 * the web app builds its routes with it, and our click URLs must land on the same route.
 * Duplicated (5 lines) instead of imported so the plugin bundles to a single dependency-free file.
 */
function base64Encode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("")
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

export function createNotifierPlugin(deps?: {
  transport?: Transport
  now?: () => number
  env?: Record<string, string | undefined>
}): Plugin {
  return async ({ directory }) => {
    const env = deps?.env ?? process.env
    const topic = env.VANGIO_NTFY_TOPIC
    if (!topic) return {} // not configured — stay inert rather than erroring at startup

    const config: WatcherConfig = {
      minRuntimeMs: Number(env.VANGIO_MIN_RUNTIME_MS ?? "") || 30_000,
      dedupeWindowMs: 60_000,
      projectName: directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory,
      clickBaseUrl: env.VANGIO_CLICK_BASE_URL?.replace(/\/+$/, ""),
      directoryB64: base64Encode(directory),
    }
    const transport = deps?.transport ?? createNtfyTransport({ topic, server: env.VANGIO_NTFY_SERVER })
    const state = initialState()
    const now = deps?.now ?? Date.now

    return {
      event: async ({ event }) => {
        try {
          const notification = decide(event as unknown as BusEvent, state, now(), config)
          if (notification) await transport.send(notification) // send() never rejects (Task 2)
        } catch (error) {
          // A notifier bug must never disturb a session.
          console.error("[vangio-notifier] hook error:", error)
        }
      },
    }
  }
}

export const VangioNotifier = createNotifierPlugin()
```

- [ ] **Step 4: Run the full package test suite**

Run: `bun test packages/notifier/test`
Expected: PASS — watcher, transport, and plugin tests all green.

- [ ] **Step 5: Typecheck**

Run: `bun x tsc --noEmit -p packages/notifier/tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit (user-gated)**

Suggested message: `feat(notifier): plugin entry with env config and fire-and-forget dispatch`

---

### Task 4: Install the plugin + laptop services + setup guide

Manual/deployment task — each step states the command and the observable proof. Write `docs/fork/mobile-control-setup.md` as you go: it records exactly what was run, so the setup is reproducible after an OS reinstall.

**Files:**
- Create: `docs/fork/mobile-control-setup.md` (grows step by step through Tasks 4–5)

- [ ] **Step 1: Bundle the plugin into the global plugins directory**

Run (Git Bash):
```bash
mkdir -p ~/.config/opencode/plugins
bun build packages/notifier/src/plugin.ts --target bun --outfile ~/.config/opencode/plugins/vangio-notifier.js
```
Expected: bundle written; type-only imports erased, so the file is fully self-contained. Verify with `head -5 ~/.config/opencode/plugins/vangio-notifier.js` — plain JS, no `import` of workspace packages.

- [ ] **Step 2: Set the environment variables** (PowerShell — persists for the user)

```powershell
$topic = "vangio-" + (-join ((48..57)+(97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}))
[System.Environment]::SetEnvironmentVariable("VANGIO_NTFY_TOPIC", $topic, "User")
Write-Host "Your secret ntfy topic: $topic"   # record it — the phone subscribes to this
```
`VANGIO_CLICK_BASE_URL` is set in Step 5 once the Tailscale hostname is known. Restart any terminal that will launch the server so it sees the new variable.

- [ ] **Step 3: Prove the pipeline with a manual ping**

```bash
curl -d "hello from the laptop" https://ntfy.sh/<your-topic>
```
Expected: nothing on the phone yet (app not installed) — but an HTTP 200 JSON response. The phone-side check happens in Task 5.

- [ ] **Step 4: Keep the laptop awake with the lid closed** (PowerShell, admin not required)

```powershell
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0   # lid close on AC: do nothing
powercfg /setactive SCHEME_CURRENT
powercfg /change standby-timeout-ac 0                              # never sleep on AC
```
Expected proof: close the lid for one minute while a `ping -t 8.8.8.8` runs; reopen — no gap in replies.

- [ ] **Step 5: Tailscale on the laptop**

Install: `winget install tailscale.tailscale`, then `tailscale up` (browser login). 
Run `tailscale status` — note the machine's DNS name (e.g. `laptop.tail1234.ts.net`), then (PowerShell):
```powershell
[System.Environment]::SetEnvironmentVariable("VANGIO_CLICK_BASE_URL", "https://<machine-name>.ts.net", "User")
```

- [ ] **Step 6: Start the VanGio server and confirm the plugin loads**

```bash
bun run --cwd packages/opencode src/index.ts serve --help
```
Expected: help output listing port/hostname (and possibly CORS) options from `withNetworkOptions` — note the exact flag names, then start it:
```bash
bun run --cwd packages/opencode src/index.ts serve --port 4096
```
Expected: server starts; no `[vangio-notifier]` errors in the log. Trigger any session from another terminal and watch for a buzz-less clean run (topic works end-to-end only after Task 5's phone setup).

- [ ] **Step 7: Build and serve the web app**

```bash
bun run --cwd packages/app build
bun run --cwd packages/app serve -- --host 127.0.0.1 --port 4173
```
Expected: `vite preview` reports `http://127.0.0.1:4173`. `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173` → `200`.

- [ ] **Step 8: Publish both onto the tailnet over HTTPS**

Check your version's syntax first: `tailscale serve --help`. Then (typical current syntax):
```bash
tailscale serve --bg --https=443  http://127.0.0.1:4173   # the web app
tailscale serve --bg --https=8443 http://127.0.0.1:4096   # the VanGio server API
```
Expected: `tailscale serve status` lists both mounts. From the laptop's own browser, `https://<machine>.ts.net` loads the web app.

- [ ] **Step 9: Connect the web app to the server over the tailnet**

In the web app (still on the laptop), use the server-selection dialog (`dialog-select-server.tsx` UI) to add `https://<machine>.ts.net:8443`. 
Expected: sessions list loads. **If the browser console shows CORS errors:** re-check `serve --help` from Step 6 — the server's listen options include CORS configuration (`CorsOptions` in `packages/opencode/src/server/server.ts:32`); restart `serve` allowing origin `https://<machine>.ts.net`. Record whatever flag was needed in the setup guide.

- [ ] **Step 10: Commit the setup guide (user-gated)**

Suggested message: `docs(fork): mobile control laptop setup guide`

---

### Task 5: Phone setup + acceptance ritual

Manual task, phone in hand. Append results to `docs/fork/mobile-control-setup.md`.

**Files:**
- Modify: `docs/fork/mobile-control-setup.md` (phone section + acceptance record)
- Modify: `docs/fork/build-progress.md` (mark the milestone with date + what was verified)

- [ ] **Step 1: Install Tailscale on the phone** — same account, toggle on. Proof: phone browser opens `https://<machine>.ts.net` and the web app renders.

- [ ] **Step 2: Install ntfy from Play Store, subscribe to your topic.** Proof: re-run Task 4 Step 3's `curl` — the phone buzzes within seconds.

- [ ] **Step 3: Add to Home Screen** in Chrome on `https://<machine>.ts.net`. Proof: opens full-screen from its own icon.

- [ ] **Step 4: Mobile UX pass (spec §9.4)** — on the phone: open a session, read the feed, send a reply, and trigger + answer a permission via the permission dock. Write down everything that is unusable or painful — that list is v2 (VanGio Pocket) input. If approve/deny is unusable on mobile, that's a blocking defect: file it in `docs/fork/errors.md` and fix before the ritual.

- [ ] **Step 5: THE ACCEPTANCE RITUAL (spec §10)**
1. At the desk: start a session task that will run > 1 minute and will hit a permission ask (e.g. instruct the agent to run a gated shell command).
2. Close the lid. Leave the room.
3. Phone buzzes: "Needs approval - <project>" (max priority) → tap → app opens on the session → approve.
4. Wait for "Done - <project>" buzz.
5. Return, open lid, verify the session output is correct and the laptop never slept.

Expected: every step observed. Record date + result in the setup guide and `build-progress.md`. **Passing = v1 shipped.**

- [ ] **Step 6: Commit records (user-gated)**

Suggested message: `docs(fork): mobile session control verified end-to-end`

---

## Plan self-review (done at writing time)

- **Spec coverage:** §4 architecture → Tasks 4–5; §5 notifier (watcher, transport, seam, config, failure posture) → Tasks 1–3; §6 setup → Tasks 4–5; §7 security (localhost bind, HTTPS, payload policy) → Task 4 Steps 6–8 + watcher tests; §8 failure modes → transport never-reject tests, hook try/catch test, lid/power Step 4; §9 verify-first list → resolved into the "Verified facts" table before task writing (9.1 → Task 4 Step 7, 9.2 → Task 5 Step 4, 9.3 → verified in table, 9.4 → Task 5 Step 4); §10 testing → per-task TDD + Task 5 Step 5 ritual; §11 out-of-scope respected (no Web Push, no session-start UI).
- **Placeholders:** none — every code step has complete code, every command has expected output. The two intentionally conditional steps (Task 4 Steps 8–9) name the exact file/flag source to consult and what to record.
- **Type consistency:** `OutgoingNotification`/`decide`/`initialState`/`BusEvent`/`WatcherConfig` (Task 1) match usage in Tasks 2–3; `Transport`/`createNtfyTransport` (Task 2) match Task 3; env var names consistent across Tasks 3–4.
