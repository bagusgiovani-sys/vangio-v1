import type { Paradigm } from "./schema"

export type PickerOption = {
  title: string
  value: string
  description?: string
}

/**
 * Turns what listParadigms() returns into rows for the picker dialog. Sorted by
 * name so the list does not reorder between launches, and the active one is
 * tagged in words rather than only by cursor position.
 */
export function pickerOptions(input: { paradigms: Record<string, Paradigm>; active?: string }): PickerOption[] {
  return Object.values(input.paradigms)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((paradigm) => {
      const parts = [paradigm.name === input.active ? "active" : undefined, paradigm.description].filter(
        (part): part is string => typeof part === "string" && part.length > 0,
      )
      return {
        title: paradigm.name,
        value: paradigm.name,
        description: parts.length > 0 ? parts.join(" · ") : undefined,
      }
    })
}

/**
 * The status-row text. `booted` is what this session actually started with;
 * `pending` is what the marker says after a switch made during this session.
 *
 * A switch cannot take effect until the next launch (the config hook fires once,
 * at boot), so a pending switch is shown as an arrow rather than by swapping the
 * name outright - the row must never claim a paradigm is running when it isn't.
 */
export function statusLabel(input: { booted?: string; pending?: string }): string | undefined {
  const pending = input.pending === input.booted ? undefined : input.pending
  if (!input.booted) return pending ? `→ ${pending}` : undefined
  return pending ? `${input.booted} → ${pending}` : input.booted
}

/** The one place the restart wording lives, so it cannot drift into implying a live switch. */
export function switchNotice(name: string): string {
  return `Saved. "${name}" applies when you restart VanGio.`
}
