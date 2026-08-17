/**
 * The Paradigm Craft wizard, as a state machine rather than a dialog stack.
 * api.ui.dialog.replace() swaps the top of the stack and leaves depth at 1
 * (measured under ConPTY 2026-08-17), so transitions are ours to drive anyway.
 * Everything here is pure so it can be tested without a running TUI.
 */

/**
 * install.ts copies paradigms/*.json over config on every install, so a
 * user file with one of these names is silently reverted. Refusing the name at
 * creation is the only place this can actually be enforced.
 */
export const BUNDLED_NAMES = [
  "gryphon",
  "premium-gryphon",
  "code-review",
  "documenter",
  "web-dev",
  "researcher",
]

const NAME_PATTERN = /^[a-z0-9-]+$/

export function validateName(name: string, existing: string[]): string | undefined {
  const trimmed = name.trim()
  if (trimmed.length === 0) return "Name cannot be empty"
  if (!NAME_PATTERN.test(trimmed)) return "Use lowercase letters, numbers and hyphens only"
  if (BUNDLED_NAMES.includes(trimmed)) return `"${trimmed}" is a bundled preset - clone it instead`
  if (existing.includes(trimmed)) return `"${trimmed}" already exists`
  return undefined
}
