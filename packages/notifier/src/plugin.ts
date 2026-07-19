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
          if (notification) await transport.send(notification) // send() never rejects (transport contract)
        } catch (error) {
          // A notifier bug must never disturb a session.
          console.error("[vangio-notifier] hook error:", error)
        }
      },
    }
  }
}

/**
 * v1 plugin module shape (packages/plugin/src/index.ts:PluginModule). File plugins must default
 * export { id, server } — the loader's legacy fallback would otherwise call every named export,
 * including createNotifierPlugin itself, as a plugin.
 */
export default {
  id: "vangio-notifier",
  server: createNotifierPlugin(),
}
