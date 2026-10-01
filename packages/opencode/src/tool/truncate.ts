import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { NodePath } from "@effect/platform-node"
import { Cause, Duration, Effect, Layer, Option, Schedule, Context } from "effect"
import path from "path"
import type { Agent } from "../agent/agent"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { evaluate } from "@/permission/evaluate"
import { Config } from "@/config/config"
import { ToolID } from "./schema"
import { TRUNCATION_DIR } from "./truncation-dir"

const RETENTION = Duration.days(7)

export const MAX_LINES = 2000
export const MAX_BYTES = 50 * 1024
export const DIR = TRUNCATION_DIR
export const GLOB = path.join(TRUNCATION_DIR, "*")

export type Result = { content: string; truncated: false } | { content: string; truncated: true; outputPath: string }

export interface Options {
  maxLines?: number
  maxBytes?: number
  direction?: "head" | "tail" | "headtail"
}

function hasTaskTool(agent?: Agent.Info) {
  if (!agent?.permission) return false
  return evaluate("task", "*", agent.permission).action !== "deny"
}

export interface Interface {
  readonly cleanup: () => Effect.Effect<void>
  readonly write: (text: string) => Effect.Effect<string>
  /**
   * Returns output unchanged when it fits within the limits, otherwise writes the full text
   * to the truncation directory and returns a preview plus a hint to inspect the saved file.
   */
  readonly output: (text: string, options?: Options, agent?: Agent.Info) => Effect.Effect<Result>
  /**
   * Resolved truncation limits: values from `tool_output` in opencode config, or MAX_LINES / MAX_BYTES if unset.
   */
  readonly limits: () => Effect.Effect<{ maxLines: number; maxBytes: number }>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Truncate") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service

    const cleanup = Effect.fn("Truncate.cleanup")(function* () {
      const cutoff = Date.now() - Duration.toMillis(RETENTION)
      const entries = yield* fs.readDirectory(TRUNCATION_DIR).pipe(
        Effect.map((all) => all.filter((name) => name.startsWith("tool_"))),
        Effect.catch(() => Effect.succeed([])),
      )
      for (const entry of entries) {
        const file = path.join(TRUNCATION_DIR, entry)
        const info = yield* fs.stat(file).pipe(Effect.catch(() => Effect.succeed(undefined)))
        const mtime = info && Option.getOrUndefined(info.mtime)
        if (!mtime || mtime.getTime() >= cutoff) continue
        yield* fs.remove(file).pipe(Effect.catch(() => Effect.void))
      }
    })

    const write = Effect.fn("Truncate.write")(function* (text: string) {
      const file = path.join(TRUNCATION_DIR, ToolID.ascending())
      yield* fs.ensureDir(TRUNCATION_DIR).pipe(Effect.orDie)
      yield* fs.writeFileString(file, text).pipe(Effect.orDie)
      return file
    })

    const limits = Effect.fn("Truncate.limits")(function* () {
      const configSvc = yield* Effect.serviceOption(Config.Service)
      if (Option.isNone(configSvc)) return { maxLines: MAX_LINES, maxBytes: MAX_BYTES }
      const cfg = yield* configSvc.value.get().pipe(Effect.catch(() => Effect.succeed(undefined)))
      return {
        maxLines: cfg?.tool_output?.max_lines ?? MAX_LINES,
        maxBytes: cfg?.tool_output?.max_bytes ?? MAX_BYTES,
      }
    })

    const headOnly = Effect.fn("Truncate.headOnly")(function* (
      lines: string[],
      maxLines: number,
      maxBytes: number,
      totalBytes: number,
      agent: Agent.Info | undefined,
    ) {
      const out: string[] = []
      let bytes = 0
      let hitBytes = false
      for (let i = 0; i < lines.length && out.length < maxLines; i++) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.push(lines[i])
        bytes += size
      }
      const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
      const unit = hitBytes ? "bytes" : "lines"
      const preview = out.join("\n")
      const file = yield* write(lines.join("\n"))
      const hint = hasTaskTool(agent)
        ? `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
        : `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`
      return {
        content: `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`,
        truncated: true,
        outputPath: file,
      } as const
    })

    const output = Effect.fn("Truncate.output")(function* (text: string, options: Options = {}, agent?: Agent.Info) {
      const resolved = yield* limits()
      const maxLines = options.maxLines ?? resolved.maxLines
      const maxBytes = options.maxBytes ?? resolved.maxBytes
      const direction = options.direction ?? "headtail"
      const lines = text.split("\n")
      const totalBytes = Buffer.byteLength(text, "utf-8")

      if (lines.length <= maxLines && totalBytes <= maxBytes) {
        return { content: text, truncated: false } as const
      }

      if (direction === "headtail") {
        const halfLines = Math.floor(maxLines / 2)
        const headLimit = halfLines
        const tailLimit = maxLines - halfLines // ties go to tail
        const halfBytes = Math.floor(maxBytes / 2)

        // Head pass: forward
        const head: string[] = []
        let headBytes = 0
        for (let i = 0; i < lines.length && head.length < headLimit; i++) {
          const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
          if (headBytes + size > halfBytes) break
          head.push(lines[i])
          headBytes += size
        }

        // Tail pass: backward, starting past what the head consumed
        const tail: string[] = []
        let tailBytes = 0
        for (let i = lines.length - 1; i >= head.length && tail.length < tailLimit; i--) {
          const size = Buffer.byteLength(lines[i], "utf-8") + (tail.length > 0 ? 1 : 0)
          if (tailBytes + size > halfBytes) break
          tail.unshift(lines[i])
          tailBytes += size
        }

        // Overlap fallback: head+tail cover the full input → head-only for the whole budget
        if (head.length + tail.length >= lines.length) {
          return yield* headOnly(lines, maxLines, maxBytes, totalBytes, agent)
        }

        const removedLines = lines.length - head.length - tail.length
        const removedBytes = totalBytes - headBytes - tailBytes
        const preview =
          head.join("\n") + `\n\n...[${removedLines} lines omitted, ${removedBytes} bytes removed]...\n\n` + tail.join("\n")
        const file = yield* write(text)
        const hint = hasTaskTool(agent)
          ? `The tool call succeeded but the output was truncated in the middle. First ${head.length} lines and last ${tail.length} lines shown; ${removedLines} lines omitted. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
          : `The tool call succeeded but the output was truncated in the middle. First ${head.length} lines and last ${tail.length} lines shown; ${removedLines} lines omitted. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to inspect the omitted middle.`

        return {
          content: `${preview}\n\n${hint}`,
          truncated: true,
          outputPath: file,
        } as const
      }

      // Existing head/tail behavior preserved
      if (direction === "head") {
        return yield* headOnly(lines, maxLines, maxBytes, totalBytes, agent)
      }

      // direction === "tail"
      const out: string[] = []
      let bytes = 0
      let hitBytes = false
      for (let i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
        const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
        if (bytes + size > maxBytes) {
          hitBytes = true
          break
        }
        out.unshift(lines[i])
        bytes += size
      }

      const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
      const unit = hitBytes ? "bytes" : "lines"
      const preview = out.join("\n")
      const file = yield* write(text)

      const hint = hasTaskTool(agent)
        ? `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
        : `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`

      return {
        content: `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`,
        truncated: true,
        outputPath: file,
      } as const
    })

    yield* cleanup().pipe(
      Effect.catchCause((cause) => Effect.logError("truncation cleanup failed", { cause: Cause.pretty(cause) })),
      Effect.repeat(Schedule.spaced(Duration.hours(1))),
      Effect.delay(Duration.minutes(1)),
      Effect.forkScoped,
    )

    return Service.of({ cleanup, write, output, limits })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [FSUtil.node] })

export * as Truncate from "./truncate"
