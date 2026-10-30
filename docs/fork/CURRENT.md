# VanGio Code — current handoff

> Priority update, 2026-10-29: read [NEXT-STEPS.md](NEXT-STEPS.md) before acting on the historical
> handoff below. Only Gryphon's six verified primary/backup model bindings and automatic Paradigm
> Shift are current feature work. Phone/Tailscale is next; custom schemata are Coming soon;
> all other feature work is postponed. The new handoff records actual implementation status and blockers.

Updated 2026-10-08. This is the compact entry point; historical logs are read on demand.

## Delivered behavior

- Native Windows terminal agent, tracked OpenCode fork; patch rather than rewrite.
- Paradigms compose with Build/Plan. Tab changes mode. `/paradigm` changes the team on restart.
- Six bundled presets, manual `/craft` and `/clone`, and goal-based AI-assisted crafting.
- Capability-aware fallback for quota walls, retirements, persistent failures, and silent streams.
- October 1 compression: head-and-tail tool previews and an 8 KiB `read` content budget.

These delivery statements come from recorded prior verification. Provider availability is perishable.
`vangio models` establishes bindability; repeated real tool calls establish usability.

## Current verification work

The latest implementation handoff is the last `## RESUME HERE` in `build-progress.md`, dated
2026-10-01. Actual token savings still require 2–3 representative sessions and a ConPTY corpus smoke.
Keep byte savings, token savings, requests per task, and latency separate.

The October 4 audit found that the readable historical database has no post-change read calls.
Bun test startup is currently blocked by `EPERM` reading `tsconfig.json` and the Solid preload;
ConPTY named pipes were also denied in the October 4 probe. Package typecheck passed on the
unchanged working tree. On October 8 the patched snapshot passed semantic typecheck, including
the regression-test source, with a verification-only dependency overlay and GOMAXPROCS=2.
An isolated replay of the production reducer found incorrect omission counts with nonzero offsets
and incorrect EOF claims at line-window boundaries. All 11 patched-snapshot replay cases pass.
Source writes remain denied in this execution environment. See verification/STATUS.md in the
outer workspace for the proposed patch and current receipts; do not claim these findings are fixed
until the source patch is applied and checked. Bun package tests still stop before discovery.

## Next steps

1. Fix the two window-reporting defects with focused regressions; restore runtime verification.
2. Run the ConPTY smoke on a stable large fixture with fewer than 2,000 lines; test later windows
   explicitly. Record real-session tokens, output volume, step count, latency, and correctness.
3. Reconcile stale roadmap/setup docs and replace the broad history-loading instruction glob.
4. Verify VanGio-specific source installation on a clean Windows user environment.
5. Recheck Tailscale Serve setup and complete the phone acceptance ritual if mobile is selected.

Desktop work reuses the inherited Electron/SolidJS applications. Autonomous generation (v7) and
the capability-aware automation ecosystem (v8) remain deferred.

## Required context before editing

Read `docs/fork/README.md` for precedence, the latest resume block in `build-progress.md`, relevant
entries in append-only `errors.md`, and `OVERVIEW.md` section 6. Keep all error history intact.
Root `AGENTS.md` supplies the portable workflow rules. Consult package `AGENTS.md` files in scope.
Tests run per package; `--version` is not TUI proof. Use the Node-hosted ConPTY recipe in
`.claude/skills/verify/SKILL.md` for terminal behavior.

## Environment boundaries

Global config/auth/plugins/active-marker live outside Git. Do not confuse a clean working tree
with unchanged machine state. Installed paradigm plugins are snapshots; reinstall after changing
their source. Keep credentials in auth storage or env substitutions, never in source or reports.
Preserve OpenCode attribution, compatibility names, and storage migrations. Native Windows only;
do not reintroduce WSL2. Retain dated model observations as history rather than setup instructions.
