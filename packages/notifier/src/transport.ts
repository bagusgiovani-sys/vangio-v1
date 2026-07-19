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
