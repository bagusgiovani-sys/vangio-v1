/**
 * The TUI half of the paradigm layer: shows which paradigm is active, and offers
 * a picker that writes the marker.
 *
 * This is a SECOND plugin on purpose. A plugin module may export server() or
 * tui(), never both - the loader rejects a module carrying both
 * (packages/opencode/src/plugin/shared.ts). The server half lives in ./index.
 *
 * Switching cannot take effect until the next launch: the config hook fires once,
 * at boot, so agents are resolved from the paradigm that was active then. Every
 * string here is written to say that plainly rather than imply a live switch.
 */
import type { TuiPluginApi, TuiPlugin } from "@opencode-ai/plugin/tui"
import { createSignal, onMount, Show } from "solid-js"
import { ACTIVE_MARKER, PARADIGM_DIR } from "./index"
import { listParadigms, readActiveName, writeActiveName } from "./load"
import { pickerOptions, statusLabel, switchNotice, type PickerOption } from "./picker"

const id = "vangio-paradigm-tui"

// flexShrink={0} matters: the status row is space-between, and the agent
// description marquee to the left will otherwise squeeze this to nothing.
function Status(props: { api: TuiPluginApi; label: () => string | undefined }) {
  const theme = () => props.api.theme.current
  return (
    <Show when={props.label()}>
      {(value) => (
        <text flexShrink={0} fg={theme().textMuted}>
          {value()}
        </text>
      )}
    </Show>
  )
}

/**
 * Reads the paradigm directory on mount rather than before opening, for two
 * reasons. The dialog has to be pushed onto the stack SYNCHRONOUSLY inside the
 * command handler - whatever opened the command (the palette, the slash menu)
 * clears the stack once the handler returns, so a dialog pushed later from an
 * await is opened and then immediately wiped. Measured 2026-08-06: every step
 * ran, and the picker still never appeared.
 *
 * Reading here also means a paradigm added while the session is running shows up
 * without a restart. Only *applying* one needs the restart.
 */
function Picker(props: { api: TuiPluginApi; onPick: (name: string) => void }) {
  const [options, setOptions] = createSignal<PickerOption[]>([])
  const [current, setCurrent] = createSignal<string | undefined>(undefined)
  const DialogSelect = props.api.ui.DialogSelect

  const toast = (message: string, variant: "warning" | "error" = "warning") =>
    props.api.ui.toast({ variant, title: "Paradigm", message })

  onMount(() => {
    void (async () => {
      const { paradigms, errors } = await listParadigms(PARADIGM_DIR)
      const active = await readActiveName(ACTIVE_MARKER)
      setCurrent(active)
      setOptions(pickerOptions({ paradigms, active }))

      // A malformed file is skipped, never fatal - the valid ones still list.
      if (errors.length > 0) {
        toast(`Skipped ${errors.length} unreadable file${errors.length === 1 ? "" : "s"}: ${errors.join("; ")}`)
      }
      if (Object.keys(paradigms).length === 0) toast(`No paradigms found in ${PARADIGM_DIR}`)
    })().catch((error: unknown) => {
      toast(`Could not read ${PARADIGM_DIR}: ${error instanceof Error ? error.message : String(error)}`, "error")
    })
  })

  return (
    <DialogSelect
      title="Paradigm"
      placeholder="Search paradigms"
      current={current()}
      options={options()}
      onSelect={(option) => {
        const name = String(option.value)
        props.api.ui.dialog.clear()
        void writeActiveName(ACTIVE_MARKER, name)
          .then(() => {
            props.onPick(name)
            props.api.ui.toast({ title: "Paradigm", message: switchNotice(name) })
          })
          .catch((error: unknown) => {
            toast(
              `Could not write ${ACTIVE_MARKER}: ${error instanceof Error ? error.message : String(error)}`,
              "error",
            )
          })
      }}
    />
  )
}

const tui: TuiPlugin = async (api) => {
  // What this session actually booted with. Held separately from the marker so a
  // switch made here can be shown as pending instead of overwriting the truth.
  const booted = await readActiveName(ACTIVE_MARKER)
  const [pending, setPending] = createSignal<string | undefined>(undefined)
  const label = () => statusLabel({ booted, pending: pending() })

  api.slots.register({
    order: 100,
    slots: {
      home_prompt_right() {
        return <Status api={api} label={label} />
      },
      session_prompt_right() {
        return <Status api={api} label={label} />
      },
    },
  })

  api.keymap.registerLayer({
    commands: [
      {
        name: "paradigm.list",
        title: "Paradigm",
        desc: "Choose the paradigm applied under the active mode",
        category: "VanGio",
        namespace: "palette",
        slashName: "paradigm",
        run() {
          api.ui.dialog.replace(() => <Picker api={api} onPick={setPending} />)
        },
      },
    ],
    bindings: api.tuiConfig.keybinds.gather("paradigm.palette", ["paradigm.list"]),
  })
}

export default { id, tui }
