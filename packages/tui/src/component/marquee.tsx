import type { RGBA } from "@opentui/core"
import { createSignal, onCleanup, onMount } from "solid-js"

export function Marquee(props: { text: string; width: number; fg: RGBA; interval?: number }) {
  const [offset, setOffset] = createSignal(0)

  onMount(() => {
    const timer = setInterval(() => setOffset((value) => value + 1), props.interval ?? 150)
    onCleanup(() => clearInterval(timer))
  })

  const frame = () => {
    const source = props.text + "   "
    const start = offset() % source.length
    return (source + source).slice(start, start + Math.min(props.width, source.length))
  }

  return (
    <text fg={props.fg} selectable={false}>
      {frame()}
    </text>
  )
}
