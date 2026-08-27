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
import { loadCandidates, type CandidateSource, type SdkModel } from "./available"
import {
  canFinish,
  cloneParadigm,
  emptyDraft,
  firstStep,
  nextStep,
  stepBack,
  toParadigm,
  validateName,
  type Draft,
  type Step,
} from "./craft"
import { pickForRole, toDraft, builderFallbacks } from "./builder"
import { generateDraft, degradationNotice, type PromptFn } from "./generate"
import { parseParadigm, type Paradigm } from "./schema"

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

/**
 * GET /api/model is the only list that knows which providers actually have
 * credentials (see ./available for the measurement). api.state.provider is the
 * degraded fallback for when that call fails, and nothing else - it is every
 * provider opencode.json DECLARES, key or no key.
 */
function candidateSource(api: TuiPluginApi): CandidateSource {
  return {
    available: async () => {
      const result = await api.client.v2.model.list({}, { throwOnError: true })
      return result.data.data satisfies SdkModel[]
    },
    configured: () =>
      api.state.provider.flatMap((provider) =>
        Object.values(provider.models).map((model) => model as CandidateModel),
      ),
  }
}

/**
 * Everything the coding agent normally carries, switched off for the builder.
 *
 * Measured 2026-08-27: left on, the model reaches for `todowrite` instead of
 * the StructuredOutput tool and the turn ends with StructuredOutputError. The
 * builder is not writing code, so none of these earn their place in the prompt.
 * Ids come from GET /experimental/tool/ids.
 */
const BUILDER_TOOLS_OFF: Record<string, boolean> = Object.fromEntries(
  [
    "invalid", "question", "bash", "read", "glob", "grep", "edit", "write",
    "task", "webfetch", "todowrite", "websearch", "skill", "apply_patch",
  ].map((id) => [id, false]),
)

function splitRef(ref: string): { providerID: string; modelID: string } | undefined {
  const slash = ref.indexOf("/")
  if (slash <= 0) return undefined
  return { providerID: ref.slice(0, slash), modelID: ref.slice(slash + 1) }
}

/**
 * One generation attempt, on a throwaway session.
 *
 * A scratch session rather than the user's own: the builder turn is a system
 * prompt plus a JSON blob, and dropping that into the transcript the user is
 * reading is a poor trade for one saved round trip. The session is deleted
 * afterwards on both paths.
 */
function builderPrompt(api: TuiPluginApi): PromptFn {
  return async ({ model, system, text, schema }) => {
    const created = await api.client.session.create({ title: "paradigm builder" }, { throwOnError: true })
    const sessionID = created.data.id
    try {
      const reply = await api.client.session.prompt(
        {
          sessionID,
          system,
          tools: BUILDER_TOOLS_OFF,
          format: { type: "json_schema", schema: schema as Record<string, unknown>, retryCount: 1 },
          ...(model ? { model: splitRef(model) } : {}),
          parts: [{ type: "text", text }],
        },
        { throwOnError: true },
      )
      // `structured` is set on the assistant message by prompt.ts:1317 and DOES
      // come back over the wire - verified against a live server 2026-08-27 -
      // but the generated SDK type does not declare it. Hence the cast.
      const info = reply.data?.info as unknown as
        | { structured?: unknown; error?: { name?: string } }
        | undefined
      return { structured: info?.structured, errorName: info?.error?.name }
    } finally {
      void api.client.session.delete({ sessionID }).catch(() => {})
    }
  }
}

function Craft(props: { api: TuiPluginApi }) {
  const [draft, setDraft] = createSignal<Draft>(emptyDraft())
  const [step, setStep] = createSignal<Step>(firstStep())
  const [existing, setExisting] = createSignal<string[]>([])
  const [error, setError] = createSignal<string | undefined>(undefined)
  // undefined means the answer has not arrived yet, which the model step has to
  // paint - an empty list is a real answer (nothing on this machine has
  // credentials) and must not read as "still loading".
  const [candidates, setCandidates] = createSignal<CandidateModel[] | undefined>(undefined)
  const DialogSelect = props.api.ui.DialogSelect
  const DialogPrompt = props.api.ui.DialogPrompt

  onMount(() => {
    void listParadigms(PARADIGM_DIR).then(({ paradigms }) => setExisting(Object.keys(paradigms)))
  })

  // Measured live under ConPTY 2026-08-18: a plain reactive <Show when={step()}
  // keyed> inside one dialog.replace() call does NOT repaint when step()
  // changes - the signal advances (confirmed by instrumentation) but the
  // screen stays on the first dialog forever. The proven mechanism (F9 in the
  // design spec) is calling dialog.replace() again at every transition, so
  // that is what advance()/back()/the error path do here.
  const rerender = () => props.api.ui.dialog.replace(() => render())

  onMount(() => {
    void loadCandidates(candidateSource(props.api)).then((result) => {
      setCandidates(result.models)
      if (result.warning) {
        props.api.ui.toast({ variant: "warning", title: "Paradigm", message: result.warning })
      }
      // Repaint ONLY when the user is already sitting on the model step waiting
      // for this list. rerender() rebuilds the dialog from scratch, so doing it
      // on the name step would throw away a half-typed name.
      if (step().kind === "model") rerender()
    })
  })

  const advance = (answer: string) => {
    const before = step()
    const result = nextStep(draft(), before, answer)
    setDraft(result.draft)
    setStep(result.step)
    if (result.step.kind === "done") {
      finish(result.draft)
      return
    }
    if (result.step.kind === "generating") {
      rerender()
      void build(result.draft)
      return
    }
    // nextStep refusing to move is only expected when "done" is answered
    // before every head has a model. Surface the reason instead of silently
    // repainting an identical dialog, so any future divergence is visible.
    if (JSON.stringify(result.step) === JSON.stringify(before)) {
      props.api.ui.toast({
        variant: "warning",
        title: "Paradigm",
        message: "Every head needs a model before you can finish.",
      })
    }
    rerender()
  }

  const back = () => {
    setStep(stepBack(draft(), step()))
    rerender()
  }

  /**
   * Ask for a team, bind it, and land the user on review.
   *
   * Every failure path ends on a PAINTED step. A generation that dies leaving
   * the wizard on "generating" would be a dialog that never repaints - the
   * exact 2026-08-18 trap - so the fallback is always the v5 name step, which
   * is also the honest answer: choose the heads yourself.
   */
  const build = async (working: Draft) => {
    const goal = working.goal ?? ""
    const available = candidates() ?? []
    const result = await generateDraft({
      goal,
      existing: existing(),
      // Exactly the curated scout picks from roles.json, nothing else. The
      // king is tried first by omission, so this list only matters when the
      // king cannot comply - and a builder that quietly degrades onto a PAID
      // model would spend money the user never opted into, on a step that is
      // not even their actual task. Free cannot be DETECTED - a subscription
      // plan reports cost 0 like everything else - so curation, not a filter,
      // is what keeps this list honest. Paid stays opt-in: bind a paid king
      // yourself and it is tried first.
      fallbacks: builderFallbacks(available),
      prompt: builderPrompt(props.api),
    })

    if (!result.ok) {
      props.api.ui.toast({
        variant: "error",
        title: "Paradigm",
        message: `Could not build a team: ${result.errors.join("; ")}. Choose the heads yourself.`,
      })
      setStep({ kind: "name" })
      rerender()
      return
    }

    const { draft: built, unbindable } = toDraft(
      result.generated,
      (roleId) => pickForRole(roleId, available),
      goal,
    )

    if (!canFinish(built)) {
      props.api.ui.toast({
        variant: "error",
        title: "Paradigm",
        message: `Nothing this machine can reach fits ${unbindable.join(", ")}. Choose the heads yourself.`,
      })
      setStep({ kind: "name" })
      rerender()
      return
    }

    // Both notices are advisory - the draft is good either way, and the user is
    // about to see it. Never silently drop a head; say which one and why.
    if (unbindable.length > 0) {
      props.api.ui.toast({
        variant: "warning",
        title: "Paradigm",
        message: `Left out ${unbindable.join(", ")} - no model this machine can reach meets that role.`,
      })
    }
    const notice = degradationNotice(result.attempts)
    if (notice) props.api.ui.toast({ variant: "warning", title: "Paradigm", message: notice })

    setDraft(built)
    setStep({ kind: "review" })
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

    if (current.kind === "goal") {
      return (
        <DialogPrompt
          title="New paradigm - what is this team for?"
          placeholder="describe the job, or leave blank to choose heads yourself"
          description={() => (
            <text>Describe the work and VanGio assembles a team. Blank goes to the manual wizard.</text>
          )}
          onConfirm={(value) => advance(value)}
        />
      )
    }

    if (current.kind === "generating") {
      // A step is painted explicitly in this TUI or it is not painted at all,
      // so the waiting state gets a real dialog rather than an absent one.
      // Measured 2026-08-27: 12s to 135s depending on which model answers.
      return (
        <DialogSelect
          title="New paradigm - assembling the team"
          options={[]}
          placeholder="Asking the king for a team. This takes a few seconds."
          onSelect={() => {}}
        />
      )
    }

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
      const done = canFinish(draft())
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
      const available = candidates()
      // A localhost round trip started several keystrokes ago, so this is all
      // but unreachable - but a step that paints nothing is a dead end, and in
      // this TUI a step is painted explicitly or not at all.
      if (available === undefined) {
        return (
          <DialogSelect
            title="New paradigm - checking which models this machine can reach"
            options={withBack([])}
            onSelect={(option) => onRow(String(option.value))}
          />
        )
      }
      if (available.length === 0) {
        return (
          <DialogSelect
            title="New paradigm - no model has credentials"
            options={withBack([])}
            placeholder="Run /connect to add a provider key, then start again"
            onSelect={(option) => onRow(String(option.value))}
          />
        )
      }
      const choices = modelOptions({
        needs: role?.needs ?? {},
        picks: role?.picks ?? [],
        models: available,
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
        .map(([id, head]) => `${id}: ${head.model}${head.permission ? " (read-only)" : ""}`)
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

/**
 * Clone reuses the wizard's write path but not its multi-step machine: there
 * are only two dialogs (pick a source, then name the copy), so they are
 * driven by the same explicit dialog.replace()-per-transition pattern proven
 * in Craft above, rather than a reactive <Show> (see the comment on Craft's
 * `rerender`).
 */
function Clone(props: { api: TuiPluginApi }) {
  const [source, setSource] = createSignal<Paradigm | undefined>(undefined)
  const [options, setOptions] = createSignal<PickerOption[]>([])
  const [existing, setExisting] = createSignal<string[]>([])
  const [error, setError] = createSignal<string | undefined>(undefined)
  const [all, setAll] = createSignal<Record<string, Paradigm>>({})
  const DialogSelect = props.api.ui.DialogSelect
  const DialogPrompt = props.api.ui.DialogPrompt

  onMount(() => {
    void listParadigms(PARADIGM_DIR).then(({ paradigms }) => {
      setAll(paradigms)
      setExisting(Object.keys(paradigms))
      setOptions(pickerOptions({ paradigms }))
    })
  })

  const rerender = () => props.api.ui.dialog.replace(() => render())

  const finish = (chosen: Paradigm, name: string) => {
    // Previously this routed through draftFromParadigm/toParadigm, which only
    // carries {role, model} per head and silently dropped routing, discipline,
    // description, and every head's role text and prompt. cloneParadigm is a
    // straight copy under a new name - nothing else changes.
    const paradigm: Paradigm = cloneParadigm(chosen, name)
    // Same write-gate /craft uses: never let a paradigm parseParadigm would
    // reject reach disk, even though the source that seeded this draft was
    // itself already a valid paradigm.
    const result = parseParadigm(paradigm)
    if (!result.ok) {
      props.api.ui.toast({
        variant: "error",
        title: "Paradigm",
        message: result.errors.join("; "),
      })
      rerender()
      return
    }
    props.api.ui.dialog.clear()
    void writeParadigm(PARADIGM_DIR, paradigm)
      .then(() => {
        props.api.ui.toast({
          title: "Paradigm",
          message: `Cloned "${chosen.name}" to "${paradigm.name}". Use /paradigm to switch - it applies when you restart VanGio.`,
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

  function render() {
    const chosen = source()

    if (!chosen) {
      return (
        <DialogSelect
          title="Clone a paradigm - pick the source"
          placeholder="Search paradigms"
          options={options()}
          onSelect={(option) => {
            setSource(all()[String(option.value)])
            rerender()
          }}
        />
      )
    }

    return (
      <DialogPrompt
        title={`Clone "${chosen.name}" - new name`}
        placeholder="lowercase, numbers and hyphens"
        description={() => <text>{error() ?? "The copy gets its own file."}</text>}
        onConfirm={(value) => {
          const problem = validateName(value, existing())
          if (problem) {
            setError(problem)
            rerender()
            return
          }
          setError(undefined)
          finish(chosen, value.trim())
        }}
      />
    )
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
      {
        name: "paradigm.clone",
        title: "Clone paradigm",
        desc: "Copy an existing paradigm under a new name",
        category: "VanGio",
        namespace: "palette",
        slashName: "clone",
        run() {
          api.ui.dialog.replace(() => <Clone api={api} />)
        },
      },
    ],
    bindings: api.tuiConfig.keybinds.gather("paradigm.palette", [
      "paradigm.list",
      "paradigm.craft",
      "paradigm.clone",
    ]),
  })
}

export default { id, tui }
