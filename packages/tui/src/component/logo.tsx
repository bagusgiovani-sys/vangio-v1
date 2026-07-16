import { RGBA, TextAttributes } from "@opentui/core"
import { createSignal, For, onCleanup, onMount, type JSX } from "solid-js"
import { tint, useTheme } from "../context/theme"
import { logo } from "../logo"

export function Logo() {
  const { theme } = useTheme()
  const [cursor, setCursor] = createSignal(true)

  onMount(() => {
    const timer = setInterval(() => setCursor((value) => !value), 500)
    onCleanup(() => clearInterval(timer))
  })

  const renderLine = (line: string, fg: RGBA, bold: boolean): JSX.Element[] => {
    const shadow = tint(theme.background, fg, 0.25)
    const attrs = bold ? TextAttributes.BOLD : undefined
    return Array.from(line).map((char) => {
      if (char === "_") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            {" "}
          </text>
        )
      }
      if (char === "^") {
        return (
          <text fg={fg} bg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === "~") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▀
          </text>
        )
      }
      if (char === ",") {
        return (
          <text fg={shadow} attributes={attrs} selectable={false}>
            ▄
          </text>
        )
      }
      return (
        <text fg={fg} attributes={attrs} selectable={false}>
          {char}
        </text>
      )
    })
  }

  return (
    <box alignItems="center">
      <box flexDirection="row" alignItems="center" gap={2}>
        <box alignItems="center">
          <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
            ▲   ▲
          </text>
          <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
            ●   ●
          </text>
          <text fg={theme.text} attributes={TextAttributes.BOLD} selectable={false}>
            ▼
          </text>
        </box>
        <box>
          <For each={logo.left}>
            {(line, index) => (
              <box flexDirection="row" gap={1}>
                <box flexDirection="row">{renderLine(line, theme.textMuted, false)}</box>
                <box flexDirection="row">{renderLine(logo.right[index()], theme.text, true)}</box>
              </box>
            )}
          </For>
        </box>
      </box>
      <box height={1} />
      <box flexDirection="row">
        <text fg={theme.textMuted} selectable={false}>
          by bagusgiovani
        </text>
        <text fg={theme.text} selectable={false}>
          {cursor() ? "█" : " "}
        </text>
      </box>
    </box>
  )
}
