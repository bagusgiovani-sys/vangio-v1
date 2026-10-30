# Current delivery scope

Updated 2026-10-29 by user direction. This scope supersedes older roadmap priorities.

Implementation entry point: [NEXT-STEPS.md](NEXT-STEPS.md). It contains the current progress,
ordered work packets, exact code paths, verification commands and completion gate.

1. Prove Gryphon and Paradigm Shift on the existing OpenCode runtime.
2. Complete phone access through Tailscale after the core acceptance checks pass.
3. Postpone all other work. Custom schemata creation, including craft, clone and AI-assisted creation, is Coming soon.

## Gryphon

- Head (king): main reasoning, task planning, delegation, supervision and review.
- Warrior: implement code and run the verification assigned by the head.
- Scout: read-only research, codebase exploration and factual findings for the head.
- Each role requires one primary and one backup: six distinct working free model bindings, not six simultaneous agents.

## Paradigm Shift acceptance

- Each of the six models completes three real tool-using turns with its role's tool permissions and realistic context.
- Exhausting a primary's quota switches that role to its designated backup automatically.
- The backup continues the task with preserved session context, role instructions and permissions; the switch is visible to the user.
- Exercise this separately for king, warrior and scout, including a failure after completed tool work so edits are not replayed.
- Reject paid fallbacks. If both models are unavailable, stop with a clear explanation rather than looping or silently selecting an unverified model.
- Prefer independent quota pools within each pair; two model names sharing an exhausted provider allowance are not proven redundancy.
- Test actual quota and retry classification, bounded retries, backup exhaustion and persisted model choice.

## Verification status

Pending. The bundled Gryphon preset currently has three primary bindings and no explicit backups.
Existing fallback infrastructure can derive other models from the catalog; that alone does not prove the required designated backups.
On 2026-10-29, package tests failed before discovery with EPERM; `vangio models` failed loading the Solid preload with EPERM.
Six usable free models have not yet been established. Do not report this scope as delivered until runtime and live model checks pass.

## Checkpoint — 2026-10-29

- The unchanged production fallback selector and its existing test file were copied into an isolated temporary directory. Bun ran 36 tests: 36 passed, 0 failed, 63 assertions. This verifies selector behavior only, not live retry integration, quota exhaustion or task continuation.
- Source modification was denied for `packages/paradigm/src/tui.tsx`. The proposed Coming soon handlers for `/craft` and `/clone` are saved in `../../../verification/gryphon-scope.patch` relative to this document. From the repository root, `git apply --check ../verification/gryphon-scope.patch` passes. The patch is NOT applied or installed.
- Git staging failed creating `.git/index.lock` with permission denied. No commit or push was possible.
- Auth-store inspection found Groq as the sole credentialed provider. Configured model names are not evidence of availability or working tool calls. No credentials were printed or changed.
- Resume by restoring source-write and runtime-read access, applying the prepared creation-pause patch, and establishing six verified model bindings before changing the shipped Gryphon preset. Keep the existing OpenCode foundation. Do not resume compression, desktop, custom schemata or other deferred feature work.
