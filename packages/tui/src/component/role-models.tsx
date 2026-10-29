import { For, Show } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useTheme } from "../context/theme"
import { useDialog } from "../ui/dialog"
import { DialogModel } from "./dialog-model"
import { hasRoleModels, MODEL_ROLES, runningRoleModel, type ModelRole } from "../util/role-models"

export function useRoleModels() {
  const local = useLocal()
  const sync = useSync()
  return {
    enabled: () => hasRoleModels(sync.data.agent),
    model(role: ModelRole) {
      if (role === "king") return local.model.current()
      return sync.data.agent.find((agent) => agent.name === role)?.model
    },
  }
}

export function RoleModels(props: { sessionID?: string }) {
  const roles = useRoleModels()
  const sync = useSync()
  const dialog = useDialog()
  const { theme } = useTheme()
  return (
    <Show when={roles.enabled()}>
      <box flexDirection="column" paddingLeft={1}>
        <For each={MODEL_ROLES}>
          {(role) => {
            const running = () => runningRoleModel({
              role,
              sessionID: props.sessionID,
              sessions: sync.data.session,
              status: sync.data.session_status,
            })
            const model = () => running() ?? roles.model(role)
            return (
              <text fg={theme.textMuted} onMouseUp={() => dialog.replace(() => <DialogModel role={role} />)}>
                <span style={{ fg: theme.text }}>{role[0].toUpperCase() + role.slice(1)}: </span>
                {model() ? `${model()!.providerID}/${model()!.modelID}` : "Not configured"}
                {running() ? " (running)" : ""}
              </text>
            )
          }}
        </For>
      </box>
    </Show>
  )
}
