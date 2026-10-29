import { createMemo, createSignal } from "solid-js"
import { useLocal } from "../context/local"
import { map, pipe, flatMap, entries, filter, sortBy, take } from "remeda"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { createDialogProviderOptions, DialogProvider } from "./dialog-provider"
import { DialogVariant } from "./dialog-variant"
import * as fuzzysort from "fuzzysort"
import { useConnected } from "./use-connected"
import { useSync } from "../context/sync"
import { useSDK } from "../context/sdk"
import { useProject } from "../context/project"
import { useToast } from "../ui/toast"
import { hasRoleModels, MODEL_ROLES, roleModelPatch, type ModelRole } from "../util/role-models"

export function DialogModel(props: { providerID?: string; role?: ModelRole }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  if (props.role || props.providerID || !hasRoleModels(sync.data.agent)) return <ModelPicker {...props} />
  return (
    <DialogSelect
      title="Switch model by role"
      placeholder="Choose King, Warrior, or Scout"
      options={MODEL_ROLES.map((role) => {
        const model = role === "king" ? local.model.current() : sync.data.agent.find((agent) => agent.name === role)?.model
        return {
          value: role,
          title: role[0].toUpperCase() + role.slice(1),
          description: model ? `${model.providerID}/${model.modelID}` : "Not configured",
        }
      })}
      onSelect={(option) => dialog.replace(() => <ModelPicker role={option.value} />)}
    />
  )
}

function ModelPicker(props: { providerID?: string; role?: ModelRole }) {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const project = useProject()
  const toast = useToast()
  const [query, setQuery] = createSignal("")
  const [saving, setSaving] = createSignal(false)

  const connected = useConnected()
  const providers = createDialogProviderOptions()

  const showExtra = createMemo(() => connected() && !props.providerID)

  const options = createMemo(() => {
    const needle = query().trim()
    const showSections = showExtra() && needle.length === 0
    const favorites = connected() ? local.model.favorite() : []
    const recents = local.model.recent()

    function toOptions(items: typeof favorites, category: string) {
      if (!showSections) return []
      return items.flatMap((item) => {
        const provider = sync.data.provider.find((provider) => provider.id === item.providerID)
        if (!provider) return []
        const model = provider.models[item.modelID]
        if (!model) return []
        return [
          {
            key: item,
            value: { providerID: provider.id, modelID: model.id },
            title: model.name ?? item.modelID,
            description: provider.name,
            category,
            disabled: provider.id === "opencode" && model.id.includes("-nano"),
            footer: model.cost?.input === 0 && provider.id === "opencode" ? "Free" : undefined,
            onSelect: () => {
              onSelect(provider.id, model.id)
            },
          },
        ]
      })
    }

    const favoriteOptions = toOptions(favorites, "Favorites")
    const recentOptions = toOptions(
      recents.filter(
        (item) => !favorites.some((fav) => fav.providerID === item.providerID && fav.modelID === item.modelID),
      ),
      "Recent",
    )

    const providerOptions = pipe(
      sync.data.provider,
      sortBy(
        (provider) => provider.id !== "opencode",
        (provider) => provider.name,
      ),
      flatMap((provider) =>
        pipe(
          provider.models,
          entries(),
          filter(([_, info]) => info.status !== "deprecated"),
          filter(([_, info]) => (props.providerID ? info.providerID === props.providerID : true)),
          map(([model, info]) => ({
            value: { providerID: provider.id, modelID: model },
            title: info.name ?? model,
            releaseDate: info.release_date,
            description: favorites.some((item) => item.providerID === provider.id && item.modelID === model)
              ? "(Favorite)"
              : undefined,
            category: connected() ? provider.name : undefined,
            disabled: provider.id === "opencode" && model.includes("-nano"),
            footer: info.cost?.input === 0 && provider.id === "opencode" ? "Free" : undefined,
            onSelect() {
              onSelect(provider.id, model)
            },
          })),
          filter((option) => {
            if (!showSections) return true
            if (
              favorites.some(
                (item) => item.providerID === option.value.providerID && item.modelID === option.value.modelID,
              )
            )
              return false
            if (
              recents.some(
                (item) => item.providerID === option.value.providerID && item.modelID === option.value.modelID,
              )
            )
              return false
            return true
          }),
          (options) => sortModelOptions(options, props.providerID !== undefined),
        ),
      ),
    )

    const popularProviders = !connected()
      ? pipe(
          providers(),
          map((option) => ({
            ...option,
            category: "Popular providers",
          })),
          take(6),
        )
      : []

    if (needle) {
      return [
        ...sortModelOptions(
          fuzzysort.go(needle, providerOptions, { keys: ["title", "category"] }).map((x) => x.obj),
          false,
        ),
        ...fuzzysort.go(needle, popularProviders, { keys: ["title"] }).map((x) => x.obj),
      ]
    }

    return [...favoriteOptions, ...recentOptions, ...providerOptions, ...popularProviders]
  })

  const provider = createMemo(() =>
    props.providerID ? sync.data.provider.find((item) => item.id === props.providerID) : null,
  )

  const title = createMemo(() => {
    if (saving()) return "Saving role model..."
    if (props.role) return `Select model for ${props.role[0].toUpperCase() + props.role.slice(1)}`
    const value = provider()
    if (!value) return "Select model"
    return value.name
  })

  function onSelect(providerID: string, modelID: string) {
    if (saving()) return
    if (props.role) {
      void saveRole(props.role, { providerID, modelID })
      return
    }
    local.model.set({ providerID, modelID }, { recent: true })
    const list = local.model.variant.list()
    const cur = local.model.variant.selected()
    if (cur === "default" || (cur && list.includes(cur))) {
      dialog.clear()
      return
    }
    if (list.length > 0) {
      dialog.replace(() => <DialogVariant />)
      return
    }
    dialog.clear()
  }

  async function saveRole(role: ModelRole, model: { providerID: string; modelID: string }) {
    setSaving(true)
    const workspace = project.workspace.current()
    let saved = false
    try {
      // Config updates dispose the instance. Never knowingly interrupt an agent
      // just to change the model used for its next task.
      const status = await sdk.client.session.status({ workspace }, { throwOnError: true })
      if (Object.values(status.data).some((value) => value.type !== "idle")) {
        toast.show({ variant: "warning", message: "Wait for running tasks to finish before switching role models." })
        return
      }
      await sdk.client.config.update({ workspace, config: roleModelPatch(role, model) }, { throwOnError: true })
      saved = true
      const agents = await sdk.client.app.agents({ workspace }, { throwOnError: true })
      sync.set("agent", agents.data)
      const names = role === "king" ? ["build", "plan"] : [role]
      if (!names.every((name) => agents.data.some((agent) =>
        agent.name === name && agent.model?.providerID === model.providerID && agent.model.modelID === model.modelID,
      ))) throw new Error("The runtime did not confirm the selected model. Check agent configuration overrides.")
      if (role === "king") {
        local.model.set(model, { agent: "build", recent: true })
        local.model.set(model, { agent: "plan" })
      }
      toast.show({ variant: "success", message: `${role[0].toUpperCase() + role.slice(1)} model saved for this project. Applies to subsequent tasks.` })
      dialog.clear()
    } catch (error) {
      toast.show({
        variant: "error",
        message: `${saved ? "Role model saved, but activation could not be confirmed" : "Could not save role model"}: ${error instanceof Error ? error.message : String(error)}`,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogSelect<ReturnType<typeof options>[number]["value"]>
      options={options()}
      locked={saving()}
      actions={[
        {
          command: "model.dialog.provider",
          title: connected() ? "Connect provider" : "View all providers",
          onTrigger() {
            dialog.replace(() => <DialogProvider />)
          },
        },
        {
          command: "model.dialog.favorite",
          title: "Favorite",
          hidden: !connected(),
          onTrigger: (option) => {
            local.model.toggleFavorite(option.value as { providerID: string; modelID: string })
          },
        },
      ]}
      onFilter={setQuery}
      flat={true}
      skipFilter={true}
      title={title()}
      current={
        props.role && props.role !== "king"
          ? sync.data.agent.find((agent) => agent.name === props.role)?.model
          : local.model.current()
      }
    />
  )
}

export function sortModelOptions<T extends { footer?: string; releaseDate: string | number; title: string }>(
  options: T[],
  newestFirst: boolean,
) {
  if (newestFirst) return sortBy(options, [(option) => option.releaseDate, "desc"], (option) => option.title)
  return sortBy(
    options,
    (option) => option.footer !== "Free",
    [(option) => option.releaseDate, "desc"],
    (option) => option.title,
  )
}
