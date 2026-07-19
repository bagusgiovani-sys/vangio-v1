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
