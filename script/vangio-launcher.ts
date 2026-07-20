#!/usr/bin/env bun
/**
 * Global launcher for running VanGio from source outside this repo.
 *
 * WHY THIS EXISTS
 *
 * bun resolves `jsxImportSource` from the tsconfig.json nearest the CURRENT WORKING
 * DIRECTORY -- not the one nearest the file it is transpiling. The TUI's JSX targets
 * `@opentui/solid` (set in packages/opencode/tsconfig.json and packages/tui/tsconfig.json).
 *
 * Launched from any other folder, bun finds either an unrelated tsconfig or none, falls back
 * to the default `react`, and the TUI dies at import time with:
 *
 *   Cannot find module 'react/jsx-dev-runtime'
 *     from packages/tui/src/config/index.tsx
 *
 * This is why `bun dev` works (it passes `--cwd packages/opencode`) while a launcher that
 * deliberately keeps your own cwd -- so `vangio` opens the folder you are standing in -- does
 * not. Confirmed by experiment: the same command succeeds from packages/opencode and fails
 * from both the repo root and an unrelated project.
 *
 * THE FIX
 *
 * The shims start bun with `--cwd <repo>/packages/opencode`, so the JSX setting is correct when
 * bun reads tsconfig at startup, and pass the directory you invoked from in VANGIO_ORIGINAL_CWD.
 * This file restores that directory before importing the CLI, so every command still targets the
 * folder you were standing in. Verified for the TUI, `--version`, `models`, and `serve`.
 *
 * Note: only the TUI needs this. Upstream already pins the runtime per-file in
 * packages/opencode/src/cli/cmd/run/footer.*.tsx via `@jsxImportSource` pragmas, which is why
 * `vangio run` never hit this. Doing the same across packages/tui would mean touching 103 files
 * and conflicting with every future upstream merge, so the fix lives in the launcher instead.
 */

const original = process.env["VANGIO_ORIGINAL_CWD"]
if (original) {
  process.chdir(original)
  // resolveThreadDirectory() (packages/opencode/src/cli/cmd/tui.ts) resolves a RELATIVE project
  // positional against process.env.PWD before falling back to cwd. The shim's own `cd` would
  // otherwise leave PWD pointing at packages/opencode and break `vangio ../some-project`.
  process.env["PWD"] = original
}

await import("../packages/opencode/src/index.ts")
