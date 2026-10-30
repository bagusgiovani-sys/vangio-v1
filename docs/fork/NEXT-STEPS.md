# VanGio implementation handoff and progress

Updated: 2026-10-29. Audience: the next coding agent, including Sol or Luna.
Status: scoped and inspected; core delivery is NOT complete.

## 1. Read this first

The user wants a small, reliable VanGio on the existing OpenCode fork:

1. **Gryphon:** three roles, each with a primary and a backup free model.
2. **Paradigm Shift:** a role automatically switches to its backup when its primary runs out, and continues its work.
3. **Next after those pass:** phone access through Tailscale.

Custom schemata creation is **Coming soon**. All other feature development is postponed.
Do not migrate to Pi, build a new runtime, expand the preset gallery, improve the builder,
resume compression work, or start desktop/branding/ecosystem work in this task.
Fix a prerequisite defect only if it blocks the core acceptance tests below, and explain that dependency.

This document and `FOCUS.md` express the latest user direction. Historical roadmaps and
older RESUME sections describe prior work, not today's queue. Follow repository `AGENTS.md`
for coding conventions, the relevant package instructions, and `OVERVIEW.md` section 6.
Read relevant entries in `errors.md`; do not delete or rewrite its history.

The user requested this handoff, not more feature implementation in the documentation turn.
The following unchecked tasks are instructions for the next implementation session.

## 2. Exact product contract

| Role / internal ID | Responsibility | Required model slots |
| --- | --- | --- |
| Head / `king` | Main reasoning, planning, delegation, supervision, review | One primary, one backup |
| Worker / `warrior` | Implement specified code changes and run verification | One primary, one backup |
| Scout / `scout` | Read-only research, codebase exploration, factual reports | One primary, one backup |

Six distinct working free model bindings are required. This does not mean six agents running
at once. A backup is a replacement model for the same role, not a new role or a second supervisor.
Keep role instructions, permissions, task history and completed tool results through the switch.
Scout must remain read-only after switching. Do not add an unverified new research integration.

For this delivery, use a bounded pair for each Gryphon role. If both are unavailable, report
that clearly. Do not silently spill into a seventh, unverified model or a paid model.
Independent provider quota pools within each pair are preferred: two names on one exhausted
provider may share the same allowance. Establish this with evidence rather than assuming it.

The normal user flow is: work starts on primary -> quota exhaustion -> visible automatic
switch -> backup continues the same task. No model picker, restart, or manual retry is required.
Changing an entire preset through `/paradigm` is a separate existing feature that currently
requires restart; do not confuse it with this live per-role switch.

## 3. Progress and evidence

| Item | Status | Evidence / remaining work |
| --- | --- | --- |
| Keep OpenCode foundation | Decided | User confirmed; no migration |
| Narrow scope and sequence | Recorded | `FOCUS.md` and this handoff |
| Role primary bindings | Existing, unverified today | `paradigms/gryphon.json` has three historical bindings |
| Explicit role backups | Missing | Gryphon declares no `fallback` arrays |
| Fallback selector | Implemented; isolated tests pass | 36 tests, 0 failures, 63 assertions on unchanged copied source |
| Full retry/handoff integration | Existing, not verified today | Runtime startup blocked; inspect and test before claiming success |
| Six live free models | Not established | No current six-model tool-use receipts |
| Pause custom creation UI | Patch prepared only | `../verification/gryphon-scope.patch` from repo root; applies cleanly in check mode |
| UI patch applied / installed | Not done | Existing source write denied |
| Phone/Tailscale | Next, not current | Reuse existing mobile docs after core gate passes |
| Commit / push | Blocked | `.git/index.lock` creation denied |

The isolated test copied ONLY `fallback.ts` and its existing `fallback.test.ts` into
`%TEMP%/vangio-gryphon-scope-check`, preserving `src/session` and `test/session` layout,
with an empty `tsconfig.json`. `bun test ./test/session/fallback.test.ts` passed there.
That proves selector behavior, not HTTP retries, session persistence, live models, or TUI behavior.

Current bundled primary names, recorded for identification only:

- king: `opencode/nemotron-3-ultra-free`
- warrior: `opencode/nemotron-3.5-lightning-free`
- scout: `opencode/hy3-free`

Do NOT treat these dated bindings as recommendations or known-working models.
Previous conversation provider suggestions are research leads, not verified configuration.

## 4. Environment blockers and safe startup

Workspace: `C:/Exodus/Projects/VanGio-AI Agent`
Repository: `C:/Exodus/Projects/VanGio-AI Agent/vangio-v1`
Platform: native Windows + PowerShell. WSL is not part of this project.

Observed on 2026-10-29:

- `bun test ./test` in `packages/paradigm` fails before test discovery with EPERM reading source/tsconfig.
- `vangio models` fails with EPERM loading `@opentui/solid` and `preload not found`.
- Editing existing `packages/paradigm/src/tui.tsx` is denied.
- `git add -- docs/fork/CURRENT.md` fails creating `.git/index.lock`.
- New documentation files can be written. This does not establish permission to edit existing files.
- Bun itself runs: `bun -e "console.log('runtime probe')"` succeeded.

Start with these commands, in order; inspect failures before moving on:

```powershell
Set-Location 'C:/Exodus/Projects/VanGio-AI Agent/vangio-v1'
git status --short
git branch --show-current
git diff --stat
git apply --check ../verification/gryphon-scope.patch
```

Then try the package tests and `vangio models` again. Record actual output. Do not repeatedly
retry the identical denied operation, change ACLs broadly, run as administrator, delete locks,
or copy a whole runtime just to conceal the failure. Use the environment's permitted access
mechanism. If blocked, preserve a reviewable patch and a precise checkpoint; independent code
and tests may continue in a permitted scratch location with that limitation clearly recorded.
Never label scratch verification as installed production verification.

At this checkpoint, `CURRENT.md` was already untracked before this work; `FOCUS.md` and this
file are new. Preserve prior work. The outer `verification/` directory also contains older,
unapplied compression patches: do not apply them as part of this scope.

## 5. Code map: edit the existing mechanism

All paths in this table are relative to `vangio-v1`.

| File | Purpose and what to inspect/change |
| --- | --- |
| `paradigms/gryphon.json` | Three role definitions, model bindings, capability needs, permissions and routing |
| `packages/paradigm/src/schema.ts` | `Head.fallback?: string[]`, `Paradigm.shift`, parsing and validation |
| `packages/paradigm/src/compile.ts` | Copies fallback/needs into agent `options`; king becomes `build` and `plan`, others become subagents |
| `packages/paradigm/src/index.ts` | Merges compiled entries with user config; existing user fields win, including individual options |
| `packages/paradigm/src/tui.tsx` | `/craft`, `/clone`, `/paradigm` registration; apply Coming soon handlers here |
| `packages/paradigm/script/install.ts` | Bundles server/TUI plugins, copies presets, selects active preset; installed plugins are snapshots |
| `packages/opencode/src/session/fallback.ts` | Pure static and derived selection, eligibility, exhaustion and swap cap |
| `packages/opencode/src/session/fallback-swap.ts` | Reads agent options, resolves reachable models, tracks exhaustion, emits switch event and terminal notices |
| `packages/opencode/src/session/retry.ts` | Error classification and retry hook entry point |
| `packages/opencode/src/session/processor.ts` | Calls into retry/swap handling during model execution |
| `packages/opencode/src/session/prompt.ts` | Model selection and continuation across steps |
| `packages/opencode/src/session/switched-model.ts` | Honors persisted model changes after a turn begins |

Do not rewrite the agent loop. Add narrow options/functions only where existing mechanisms
cannot express the requirement. Preserve behavior for unrelated presets by default.

## 6. Implementation work packets — do in order

### A. Pause custom creation

- [ ] Check and apply the prepared `../verification/gryphon-scope.patch`, or reproduce its tiny edit if lines have moved.
- [ ] `/craft` and `/clone` remain discoverable but say **Coming soon** and show a short notice.
- [ ] Neither handler opens manual or AI-assisted creation, calls a generation provider, or writes a preset.
- [ ] Keep creation implementation dormant; do not delete whole subsystems or existing user schemata.
- [ ] Keep `/paradigm` selection available; this is not a redesign of the preset picker.
- [ ] Verify both command entry paths in the actual TUI after installation.

### B. Make Gryphon's primary/backup policy explicit and bounded

- [ ] Add exactly one backup per role using existing `fallback: ["provider/model"]` declarations once models are verified in packet D.
- [ ] Make automatic switching explicit with `shift: { "auto": true }` in Gryphon.
- [ ] Ensure the compiled king backup reaches BOTH `build` and `plan`; worker/scout backups reach their own agents.
- [ ] Add a narrowly scoped declared-only fallback policy if needed. Suggested implementation name: `fallbackPolicy: "declared-only"` on a head; this is a proposal, NOT an existing field.
- [ ] If introducing that option, validate it in schema, carry it through `compile.ts` agent options, read it in `fallback-swap.ts`, and consume it in `fallback.ts` before derived selection.
- [ ] Default omitted policy to current behavior so unrelated paradigms keep working. Enable declared-only for Gryphon's three roles.
- [ ] Preserve exhaustion tracking: failed primary cannot be chosen again; failed backup ends this pair without catalog wandering.
- [ ] Inspect effective user overrides before testing: `index.ts` lets existing config override preset models and fallback options. Do not silently erase custom config.

Important source findings to address with regressions:

1. `Fallback.resolve()` currently tries the declared chain, then derives another model from the catalog when that chain fails. One backup entry alone does NOT enforce a two-model pair.
2. `resolveStatic()` currently checks resolution, exhaustion and capabilities, but has no price check. `resolveDerived()` filters paid models unless allowed. Apply a coherent free-only policy to the actual Gryphon path, including declared candidates.
3. Missing cost data is currently treated as free. Do not mistake catalog defaults for evidence of free access. Packet D must establish the six bindings' actual free entitlement; avoid broad pricing-schema redesign.
4. `terminalMessage()` currently uses a 00:00 UTC reset statement for exhausted quota/rate-limit paths. That is not established for arbitrary providers. Use provider evidence if available, otherwise say the role and backup are unavailable without inventing a reset time.
5. `schema.ts` comments distinguish empty fallback arrays from absent ones, but `resolve()` can derive for either. Do not assume comments prove runtime behavior. The explicit Gryphon policy must have tests.

### C. Prove role isolation, continuation and retry behavior

- [ ] Add failing tests first for each concrete gap found in B; then patch the smallest responsible code path.
- [ ] Test king, warrior and scout independently through the swap adapter and retry loop, not only the pure selector.
- [ ] Confirm head labels versus compiled names: king is usually `build`/`plan` at runtime, not a standalone primary named `king`.
- [ ] Confirm a scout/warrior child session's switch does not mutate the parent king's model or another role's session.
- [ ] On the next model request, backup receives prior task text and completed tool results.
- [ ] After a successful tool mutation followed by quota failure, continuation must not replay that completed mutation. Test recorded tool calls/results; do not assume a model will always avoid duplicates.
- [ ] Confirm backup stays selected across subsequent tool steps and a resumed session according to persisted state. Record what is process-local versus durable.
- [ ] Keep temporary throttling retries bounded; distinguish a short retryable 429 from exhausted allowance using the existing classifier and real provider error shapes.
- [ ] If backup is missing, paid, incapable or exhausted, stop with a clear role-specific reason and no infinite retry/picker loop.
- [ ] Visible switch notice names the role, old/new models and reason. Existing `SessionEvent.ModelSwitched` is the mechanism to reuse.

### D. Establish six real free models

Do not hardcode guessed replacements just to make a JSON checklist green.
Only Groq was found in the auth-store provider keys during this session; the config also declares
other providers. Keys were not printed or changed. Some providers may be usable without stored
credentials, so use the resolved runtime catalog rather than equating config declarations with access.

- [ ] Restore `vangio models`, then record the actual bindable catalog.
- [ ] Verify current free access and tool capabilities against official provider documentation; dated chat suggestions are not sufficient.
- [ ] Check which providers have usable credentials without exposing secret values. Ask only for missing account setup through the normal credential mechanism, never for a key pasted into chat/docs.
- [ ] For every proposed slot, run THREE real tool-using turns with realistic role instructions and context.
- [ ] King must demonstrate reasoning/delegation, warrior must edit and verify a scratch fixture, scout must locate/read and report facts without writing.
- [ ] Record request count, elapsed time, failures, output allowance and quota behavior; a text-only OK response is not a pass.
- [ ] Choose distinct models and preferably independent quota pools in each pair. A model's free-tier entitlement is separate from its catalog price.
- [ ] Check Gryphon warrior's current `needs.minOutput: 100000`: this rejects smaller-output backups. Do not lower it merely to pass selection; first test a realistic multi-file implementation and justify any new threshold.
- [ ] Update the preset only with tested bindings. Use environment references or auth storage for credentials.

Create `docs/fork/GRYPHON-VERIFICATION.md` with this matrix and receipts when implementation starts:

| Slot | Provider/model | Free entitlement evidence/date | Quota pool | Tool turns passed | Role task passed | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| King primary | TBD | TBD | TBD | 0/3 | Pending | Unverified |
| King backup | TBD | TBD | TBD | 0/3 | Pending | Unverified |
| Warrior primary | TBD | TBD | TBD | 0/3 | Pending | Unverified |
| Warrior backup | TBD | TBD | TBD | 0/3 | Pending | Unverified |
| Scout primary | TBD | TBD | TBD | 0/3 | Pending | Unverified |
| Scout backup | TBD | TBD | TBD | 0/3 | Pending | Unverified |

Do not intentionally burn whole daily quotas. Use a controlled provider/error fixture to force
exhaustion through the real retry integration, then verify continuation. Label simulated quota
tests separately from live-provider tool-use receipts; neither replaces the other.

### E. Install and verify the shipped experience

- [ ] Back up the live config, relevant plugin bundles, preset files and active marker before replacing them. Config backup convention: `opencode.json.bak-<date>-<reason>`.
- [ ] Read the install script before running it: it copies ALL bundled preset JSON files, not only Gryphon, and writes the active marker.
- [ ] Once global writes are permitted, from repository root run `bun run packages/paradigm/script/install.ts gryphon`.
- [ ] Confirm installed snapshot matches the changed source and effective model options match the verified six-slot matrix.
- [ ] Start the actual TUI under the Node-hosted ConPTY procedure in `.claude/skills/verify/SKILL.md`. `--version` is not a UI test.
- [ ] Observe Coming soon behavior, automatic role switch notices, continuation and exhaustion messages.
- [ ] Re-run only checks affected by new changes. Record exact commands, outcomes and remaining limitations.
- [ ] Commit and push scoped verified changes to `origin/dev` per repository policy when Git access works; never claim a push if denied.

## 7. Test commands and expected assertions

Run package commands from package directories. Root `bun test` is intentionally blocked.

```powershell
Set-Location 'C:/Exodus/Projects/VanGio-AI Agent/vangio-v1/packages/paradigm'
bun test ./test
bun typecheck

Set-Location 'C:/Exodus/Projects/VanGio-AI Agent/vangio-v1/packages/opencode'
bun test ./test/session/fallback.test.ts ./test/session/fallback-swap.test.ts ./test/session/retry-swap-hook.test.ts ./test/session/retry-model-swap.test.ts ./test/session/switched-model.test.ts ./test/session/retry.test.ts
bun typecheck
```

Extend relevant existing tests rather than creating an unrelated harness:

| Test area | Required assertion |
| --- | --- |
| Paradigm schema | Valid new policy, malformed policy rejected, older presets remain valid |
| Compile/apply | Exactly one backup per Gryphon role; options survive merging; king options reach Build and Plan |
| Gryphon preset | Six distinct verified refs; automatic switching on; scout edit denied |
| Selector | Declared backup wins; paid/ineligible/exhausted backup rejected; strict policy cannot derive a seventh model |
| Retry adapter | Exhaustion triggers correct role backup without manual confirmation; temporary rate-limit behavior stays bounded |
| Session continuation | Completed tool results retained; completed mutation not replayed; backup persists after next step |
| Role isolation | Child role switch leaves parent/other role model unchanged |
| Exhaustion UI | Clear terminal result if both fail; no made-up universal quota reset time |
| Live TUI | Both creation commands show Coming soon; switches visibly announced |

Follow `packages/opencode/test/AGENTS.md` and existing Effect fixtures. Prefer readiness events
over arbitrary sleeps. Use a provider fixture at the external boundary for deterministic failures;
exercise the production retry/selector code rather than recreating it in a test.

## 8. Completion gate and the next task

Gryphon/Paradigm Shift is done ONLY when all are true:

- [ ] Six real free bindings recorded and each passes three tool-using turns.
- [ ] Each role uses exactly its intended primary/backup pair with correct permissions.
- [ ] Forced exhaustion of each primary automatically continues on its backup through the real integration.
- [ ] Session continuity, role isolation, bounded exhaustion and no paid fallback are verified.
- [ ] Creation UI is Coming soon in the installed TUI.
- [ ] Relevant package tests/typechecks pass, or any remaining failure is explicitly explained; blocked live acceptance means NOT done.
- [ ] Verification report and progress are updated; installed state and source state are distinguished.

Then, and only then, start phone/Tailscale acceptance using:

- `docs/fork/mobile-control-setup.md`
- `docs/superpowers/specs/2026-07-17-mobile-session-control-design.md`
- `docs/superpowers/plans/2026-07-17-mobile-session-control.md`

Recheck the actual server and Tailscale setup; do not assume old ports, addresses or Serve commands
are current. Acceptance is opening the correct live session on the phone, seeing updates, replying,
and approving an actual pending permission request. User interaction on the physical phone may be
required; mark it pending until witnessed. Other roadmap work remains postponed afterward.

## 9. Mandatory checkpoint format

At each natural checkpoint update this document's status and append actual evidence to the
verification report. Include: files changed, tests with results, six-slot matrix status, installed
plugin/config changes, blockers, commit/push outcome, and the exact next unchecked packet.
Do not turn a source patch, a catalog listing or an isolated selector test into a claim of end-to-end delivery.

**Next action now:** packet A after the access probe; proceed with B/C independently of provider
credentials where possible. Packet D must finish before declaring the shipped six-model configuration.
