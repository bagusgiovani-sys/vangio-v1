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
import { listParadigms, readActiveName, writeActiveName, writeParadigm } from "./load"
import { pickerOptions, statusLabel, switchNotice, type PickerOption } from "./picker"
import { getRole, listRoles } from "./roles"
import { modelOptions, type CandidateModel } from "./resolve"
import {
  emptyDraft,
  firstStep,
  nextStep,
  stepBack,
  toParadigm,
  validateName,
  type Draft,
  type Step,
} from "./craft"
import { parseParadigm } from "./schema"

const id = "vangio-paradigm-tui"

// flexShrink={0} keeps the name intact when the agent-description marquee grows
// - the same declaration the model text carries upstream. Measured at 140 and
// 200 cols: the name sits on the status row itself, right-aligned (col 101 with
// Build at col 37), so it does not wrap.
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

function Craft(props: { api: TuiPluginApi }) {
  const [draft, setDraft] = createSignal<Draft>(emptyDraft())
  const [step, setStep] = createSignal<Step>(firstStep())
  const [existing, setExisting] = createSignal<string[]>([])
  const [error, setError] = createSignal<string | undefined>(undefined)
  const DialogSelect = props.api.ui.DialogSelect
  const DialogPrompt = props.api.ui.DialogPrompt

  onMount(() => {
    void listParadigms(PARADIGM_DIR).then(({ paradigms }) => setExisting(Object.keys(paradigms)))
  })

  // api.state.provider is already loaded and synchronous, so the model step
  // needs no await and no loading state.
  const candidates = (): CandidateModel[] =>
    props.api.state.provider.flatMap((provider) =>
      Object.values(provider.models).map((model) => model as unknown as CandidateModel),
    )

  // Measured live under ConPTY 2026-08-18: a plain reactive <Show when={step()}
  // keyed> inside one dialog.replace() call does NOT repaint when step()
  // changes - the signal advances (confirmed by instrumentation) but the
  // screen stays on the first dialog forever. The proven mechanism (F9 in the
  // design spec) is calling dialog.replace() again at every transition, so
  // that is what advance()/back()/the error path do here.
  const rerender = () => props.api.ui.dialog.replace(() => render())

  const advance = (answer: string) => {
    const result = nextStep(draft(), step(), answer)
    setDraft(result.draft)
    setStep(result.step)
    if (result.step.kind === "done") {
      finish(result.draft)
      return
    }
    rerender()
  }

  const back = () => {
    setStep(stepBack(draft(), step()))
    rerender()
  }

  const finish = (final: Draft) => {
    const paradigm = toParadigm(final)
    // Belt and braces: Task 4's state machine should never produce a paradigm
    // the parser rejects, but this is the last stop before disk - a silently
    // written invalid file is worse than a toast.
    const result = parseParadigm(paradigm)
    if (!result.ok) {
      props.api.ui.toast({
        variant: "error",
        title: "Paradigm",
        message: `Could not create paradigm: ${result.errors.join("; ")}`,
      })
      // The wizard already moved step() to "done" before finish() was called
      // (advance() sets it, then dispatches here). Nothing repainted the
      // dialog for that transition, so without this the review dialog would
      // be left on screen with step() pointing past it - repaint back to
      // review so the user can go back and correct.
      setStep({ kind: "review" })
      rerender()
      return
    }
    props.api.ui.dialog.clear()
    void writeParadigm(PARADIGM_DIR, paradigm)
      .then(() => {
        props.api.ui.toast({
          title: "Paradigm",
          message: `Created "${final.name}". Use /paradigm to switch - it applies when you restart VanGio.`,
        })
      })
      .catch((err: unknown) => {
        props.api.ui.toast({
          variant: "error",
          title: "Paradigm",
          message: `Could not write paradigm: ${err instanceof Error ? err.message : String(err)}`,
        })
      })
  }

  const BACK_ROW = { title: "← Back", value: "__back__", description: "return to the previous step" }

  const withBack = <T extends { title: string; value: string; description?: string }>(rows: T[]) =>
    [BACK_ROW as unknown as T, ...rows]

  const onRow = (value: string) => (value === "__back__" ? back() : advance(value))

  function render() {
    const current = step()
    if (current.kind === "name") {
      return (
        <DialogPrompt
          title="New paradigm - name"
          placeholder="lowercase, numbers and hyphens"
          description={() => <text>{error() ?? "This becomes the filename."}</text>}
          onConfirm={(value) => {
            const problem = validateName(value, existing())
            if (problem) {
              setError(problem)
              rerender()
              return
            }
            setError(undefined)
            advance(value)
          }}
        />
      )
    }

    if (current.kind === "shape") {
      return (
        <DialogSelect
          title="New paradigm - shape"
          options={withBack([
            { title: "Court", value: "court", description: "distinct roles, order matters" },
            { title: "Legion", value: "legion", description: "interchangeable workers in parallel" },
          ])}
          onSelect={(option) => onRow(String(option.value))}
        />
      )
    }

    if (current.kind === "role") {
      const rows = listRoles()
        .filter((role) => !role.mandatory)
        .map((role) => ({ title: role.title, value: role.id, description: role.summary }))
      const done =
        Object.keys(draft().heads).length >= 2
          ? [{ title: "Done - no more heads", value: "done", description: "go to review" }]
          : []
      return (
        <DialogSelect
          title={`New paradigm - head ${current.slot} role`}
          options={withBack([...rows, ...done])}
          onSelect={(option) => onRow(String(option.value))}
        />
      )
    }

    if (current.kind === "model") {
      const head = draft().heads[current.slot]
      const role = head ? getRole(head.role) : undefined
      const choices = modelOptions({
        needs: role?.needs ?? {},
        picks: role?.picks ?? [],
        models: candidates(),
      })
      // DialogSelectOption.disabled does not grey a row out - it drops it from
      // the list entirely (packages/tui/src/ui/dialog-select.tsx:154-160,
      // `filtered()` keeps only `disabled !== true`). Failing models must stay
      // VISIBLE with the reason, so `disabled` is never fed from `choice` into
      // the row here. `blocked` is the real gate: onSelect consults it and
      // refuses the pick with a toast instead of the row ever disappearing.
      const blocked = new Map(
        choices
          .filter((choice) => choice.disabled)
          .map((choice) => [choice.model, choice.description ?? "This model does not meet the role's requirements."] as const),
      )
      const rows = choices.map((choice) => ({
        title: choice.title,
        value: choice.model,
        description: choice.description,
      }))
      return (
        <DialogSelect
          title={`New paradigm - model for ${role?.title ?? head?.role ?? "head"}`}
          placeholder="Search models"
          options={withBack(rows)}
          onSelect={(option) => {
            const value = String(option.value)
            const reason = blocked.get(value)
            if (reason) {
              props.api.ui.toast({ variant: "error", title: "Paradigm", message: reason })
              return
            }
            onRow(value)
          }}
        />
      )
    }

    if (current.kind === "review") {
      const p = toParadigm(draft())
      const summary = Object.entries(p.heads)
        .map(([id, head]) => `${id}: ${head.model}`)
        .join(", ")
      return (
        <DialogSelect
          title={`Create "${p.name}"?`}
          options={withBack([{ title: "Create", value: "confirm", description: summary }])}
          onSelect={(option) => onRow(String(option.value))}
        />
      )
    }

    return null
  }

  return render()
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
      {
        name: "paradigm.craft",
        title: "Craft paradigm",
        desc: "Create a new paradigm - choose heads and a model for each",
        category: "VanGio",
        namespace: "palette",
        slashName: "craft",
        run() {
          api.ui.dialog.replace(() => <Craft api={api} />)
        },
      },
    ],
    bindings: api.tuiConfig.keybinds.gather("paradigm.palette", ["paradigm.list", "paradigm.craft"]),
  })
}

export default { id, tui }
