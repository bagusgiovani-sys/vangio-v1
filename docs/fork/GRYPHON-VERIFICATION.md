# Gryphon acceptance evidence

Updated: 2026-11-03. Core acceptance remains incomplete.

## Host catalog checkpoint, 2026-11-03

The owner's normal terminal successfully pushed `dev` and recorded 82 installed
model identifiers in `verification/host-completion-result.json` on November 2.
Its enriched receipt also contains eight OpenCode candidates with known zero
catalog prices and declared tool support. This supersedes the earlier pending
catalog and push gates; it does not establish live tool use or entitlement.

Three candidates meet Warrior's existing `minOutput: 100000` requirement:
`opencode/beam-free` (131072), `opencode/nemotron-3.5-lightning-free` (262144),
and `opencode/nemotron-3.5-super-vl-free` (131072). The other five recorded
candidates have smaller output limits. These are candidates, not selected or
verified bindings. Shared provider quota independence remains unknown.

An isolated source `models opencode` check on November 3 exited 1 with
`TimeoutError` before listing models. XDG data/config/cache/state and test home
were placed under `verification/live-2026-11-03`; project configuration and
Claude discovery were disabled, and no installed configuration or credentials
were copied. This does not diagnose the timeout or the reported Zhipu failure.
No live model turn was completed and no model binding was changed.

The host checker now records a restricted summary of installed role models,
fallbacks and admission policy, but the existing receipt lacks that field.
Next host command, from the workspace root in the owner's normal terminal:

```cmd
verification\finish-host-check.cmd
```

The checker records model identifiers/capability metadata and role bindings;
it does not save raw configuration or credentials. Then verify three actual
role-appropriate tool turns per candidate before selecting six bindings and
installing the bounded pairs. Expanded provider error text is still needed
to diagnose the user's Zhipu failure. Phone access remains gated.

The repeatable per-candidate live check is now
`packages/opencode/script/verify-gryphon-model.cjs`. From the repository root,
run `node packages/opencode/script/verify-gryphon-model.cjs <role> <provider/model>`
for each of three attempts (role is `king`, `warrior` or `scout`). It launches
the source CLI with the installed user config against a disposable temporary
workspace. King/Scout must complete a real read and report a random on-disk
value; Warrior must use edit to change a fixture and report the change. A pass
requires the expected completed tool call and its verifiable result each time.
It prints only the role, model, pass count, tool names/statuses and timing; it
does not persist prompts, responses, provider errors or configuration. Run it
from the owner's normal terminal because the managed session cannot read the
installed config or complete the provider request.

## Current source checkpoint

November 2 fixes project role-model persistence and extends native terminal
acceptance to Worker/Scout saves, busy-task refusal and failed-save recovery.
See the dated entry below. Six live free bindings and installed acceptance
remain pending; no user configuration or provider credentials were changed.

The October 30 checkpoint verified source typechecks, fallback/retry tests and
isolated ConPTY creation-pause and role-picker rendering. See
[VERIFICATION-2026-10-30.md](VERIFICATION-2026-10-30.md).

October 31 adds an opt-in `freeOnly` head flag. Parsing, compilation and config
merging carry it to Build, Plan, Warrior and Scout. The shared LLM request path
rejects paid, Coding Plan and unknown-price selections before provider transport.
The same price predicate protects declared and derived fallbacks. Explicit paid
fallback opt-in remains supported for other presets; `freeOnly` roles still refuse
such a model at request time.

Provider normalization now records `cost.known`: numeric accounting defaults no
longer count as evidence of a supplied price. Config model overrides retain
catalog pricing tiers, including prices for large contexts. Free eligibility
checks input, output, cache and tier prices. These checks establish price
eligibility only; they do not establish account entitlement or model usability.

No shipped Gryphon model bindings, installed plugins, user config or credentials
have changed in this session. The new role flag is available but is not enabled
in Gryphon pending the six-model gate.

## Automated receipts

- New regressions failed before the corresponding changes: missing role flags,
  defaulted zero pricing, cache/tier prices and dropped inherited tiers.
- `packages/paradigm`: `bun test ./test --only-failures`: 247 pass, 0 fail,
  642 assertions. `bun typecheck`: pass.
- `packages/opencode`: fallback, provider and LLM suites: 191 pass, 0 fail,
  470 assertions before the additional inherited-tier regression. This includes
  20 HTTP-boundary cases across Build, Plan, Warrior and Scout: free selections
  make one local request; paid/unknown/subscription selections make zero;
  omitted policy preserves existing paid-model behavior.
- Final provider/retry regression, including inherited-tier preservation:
  234 pass, 0 fail, 467 assertions across six suites. Final
  `packages/opencode` `bun typecheck`: pass.

Outer workspace receipts: `verification/free-admission-tests.log`,
`verification/free-admission-typecheck.log`, and
`verification/free-admission-regression.log`. Provider fixtures use localhost
and test credentials. They are not live-provider tool-use evidence.

## Six-slot matrix

| Slot | Provider/model | Free entitlement evidence/date | Quota pool | Tool turns | Role task | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| King primary | TBD | Pending | Unknown | 0/3 | Pending | Unverified |
| King backup | TBD | Pending | Unknown | 0/3 | Pending | Unverified |
| Warrior primary | TBD | Pending | Unknown | 0/3 | Pending | Unverified |
| Warrior backup | TBD | Pending | Unknown | 0/3 | Pending | Unverified |
| Scout primary | TBD | Pending | Unknown | 0/3 | Pending | Unverified |
| Scout backup | TBD | Pending | Unknown | 0/3 | Pending | Unverified |

## Production continuation and exhaustion, 2026-10-31

New localhost HTTP fixtures exercise the production prompt loop, processor,
LLM transport, retry schedule and session projector for Build, Plan, Warrior and
Scout. They exposed two defects and failed before the corresponding repairs:

- Exhaustion of a declared pair produced a third request to its failed backup.
  A terminal hook result now stops the retry schedule when a declared-only
  chain is exhausted. The persisted error includes the role and the lack of an
  eligible backup. No seventh model is selected even when a free third model
  exists in the fixture's catalog.
- A resumed prompt restored the configured primary instead of the saved backup.
  Declared-only roles now honor a saved backup in that same role's chain when
  restarting a loop from stored state or creating an implicit new turn.
  Explicit model selection still takes precedence.

The eight integration cases verify original task text, role instructions,
completed tool inputs/results, one completed write for writable roles, no
write/edit tool exposure for Plan/Scout after handoff, subsequent backup tool
steps, resumed loops and new turns, and unchanged parent/sibling model rows.
Read-only role fixture files remain unchanged. These tests do not launch a new
OS process or prove live provider availability.

Exhaustion messages now distinguish account limits from free-tier limits and
omit an unsupported universal midnight reset. Retirement and stall wording
remain specific to those failures.

The initial combined seven-suite run reported 227 pass, 14 skip, 1 fail. The
failure was an existing subtask error-metadata fixture expecting a missing
model to fail while automatic rescue was enabled. The same failure reproduced
with all four runtime files temporarily restored to committed `4a06c359c2`;
current source was then restored byte for byte. The fixture now explicitly
disables automatic shifting for that error-path test. Its focused run passes
all eight assertions. Final results are recorded below.

Final validation: complete prompt suite **52 pass, 14 skip, 0 fail, 279
assertions**. The six fallback/retry suites passed their 176 tests in the
preceding combined run; that run's sole failure was the now-corrected subtask
fixture. Across these latest runs: **228 passing tests and 14 skips**. The final
OpenCode package typecheck passes. Skips are recorded, not counted as passes.

The pricing checkpoint was committed and pushed to `origin/dev` as
`4a06c359c2`. This continuation checkpoint contains the bounded-exhaustion and
persisted-backup fixes, their tests, the fixture correction and this report.

Additional receipts in the outer workspace: `verification/resumed-backup-red.log`,
`verification/role-continuation-final.log`, `verification/bounded-exhaustion-tests.log`,
`verification/subtask-baseline.log`, `verification/subtask-fixture-tests.log`,
and `verification/prompt-final-tests.log`.

## Terminal continuation follow-up, 2026-10-31

Actual ConPTY verification found an additional client defect after the runtime
checkpoint: the next typed prompt explicitly reselected the primary. Before the
fix, the localhost provider recorded `primary, backup, primary`. The TUI sync
store now applies native model-switch events to the matching session. Its local
selector uses that same role's saved declared backup while retaining explicit
manual selection behavior. Parent/sibling session models and configured role
bindings are not changed by the event.

The corrected first two ConPTY cases pass: visible automatic switch followed by
a second typed prompt on the backup (`primary, backup, backup`), and visible
pair exhaustion after exactly `primary, backup`. The explanation wraps across
terminal lines, which the harness checks as rendered fragments.

Reproduce on native Windows from the repository root:

```powershell
node packages/tui/script/verify-gryphon-fallback.cjs ../verification
```

This launches original source against a localhost provider with isolated XDG
directories and test credentials. It writes raw terminal logs and a JSON receipt
to the supplied output directory (a fresh temporary directory if omitted).
It does not install plugins or access the user's live provider configuration.
`BUN_BINARY` can select a Bun executable outside the default user install.
The fixture directory is also passed explicitly as the CLI project argument;
Bun's `--cwd` sets the runtime/package directory and does not isolate project
config writes by itself. An earlier picker run generated a test-only
`packages/opencode/config.json`; its fixture model bindings were checked and
that generated file was removed. The corrected three-case run passes and a
follow-up check confirms the saved config exists in the scratch project while
the checkout config file is absent.

Current regression evidence: TUI context/sync suites **12 pass, 0 fail, 28
assertions**; paradigm suite **248 pass, 0 fail, 649 assertions**; TUI and paradigm
package typechecks pass. TUI tests used isolated XDG directories because imports
otherwise encounter the denied user config directory.

Final ConPTY receipt: **3 pass, 0 fail**. The King picker case opens `/models`,
selects King and the primary, confirms the save, observes another automatic
switch, and types another prompt. Its exact request sequence is
`primary, backup, primary, backup, backup`. Manual selection is honored; a later
automatic switch invalidates that old manual choice so it cannot become active
again when the session returns to the same backup.

Receipts: outer workspace `verification/gryphon-live-terminal-result.json`,
`verification/gryphon-{resume,exhaust,manual}-terminal.txt`, and
`verification/tui-fallback-regression.log`. These are local-provider source
checks. Installed-user plugin/config acceptance, Worker/Scout picker interaction,
picker busy/error flows and the six live model bindings remain pending.

## Static prompt metadata, 2026-11-01

The user reported vertical movement in a narrow VS Code terminal. The prompt's
agent description used a marquee updating every 150ms, beside a long model name,
provider and paradigm label. Removed that description and its marquee from the
prompt. Removed the redundant provider label and parenthesized model-name
suffixes, leaving e.g. `Build · Nemotron 3.5 Lightning`. Mode, auto-permission
indicator and selected reasoning variant remain visible. The metadata occupies
one clipped line; the paradigm slot keeps its own space and cannot wrap it.

TUI package typecheck passes. Three actual ConPTY source launches pass at 80 and
160 columns, including a fixture named `Nemotron 3.5 Lightning (free, 262k output)`.
The rendered label retains the model name without the suffix or agent description.
Mode switching, responsive prompt width, Night Owl default and explicit theme/
width overrides still pass. Updated local receipt: outer workspace
`verification/home-presentation-result.json` and corresponding terminal logs.

No provider settings or model bindings changed. The screenshot's model stall is
a separate live-provider problem; shortening metadata does not establish a
working King model. Restart VanGio to load the static prompt line.

## Retry-loop follow-up, 2026-11-01

The user reported retry attempt 6 with a Zhipu King binding. Source inspection
found that older agents without `fallbackPolicy: declared-only` kept retrying
after fallback exhaustion. All handled no-replacement outcomes now stop the
retry schedule, including auto-swap disabled. Generic repeated failures now
say `model failed repeatedly`; they no longer claim the model was retired.
Actual model-resolution retirement retains its separate explanation.

Validation: **165 tests pass, 0 fail, 296 assertions** across fallback,
fallback-swap, retry-swap-hook and retry suites; OpenCode package typecheck passes.
Native ConPTY checks: **4 pass, 0 fail**, covering successful backup continuation,
pair exhaustion, manual King selection and repeated 503 failures with no strict
fallback policy. The last case makes exactly `primary, primary, primary, backup`
requests, then displays terminal failure without a false retirement claim.
Receipts: outer workspace `verification/retry-2026-11-01/`;
reproduce with `node packages/tui/script/verify-gryphon-fallback.cjs ../verification/retry-2026-11-01`.

The live provider failure is **not diagnosed**. User config access remains
denied to the managed agent. The screenshot's `zhipuai/glm-4.5-flash` King differs
from the bundled Gryphon primary; neither credentials nor bindings were changed.
The user was asked to expand and paste the provider error. Restart VanGio to
load the retry fix; installed model acceptance and the six-model gate remain open.

## TUI presentation follow-up, 2026-11-01

User-requested presentation fixes are applied to the source used by the Windows
`vangio.cmd` launcher:

- The prompt footer now says `tab mode`. Forward/reverse command descriptions
  and Build/Plan tips use the same wording; keybindings and behavior are unchanged.
- The home prompt defaults to 90% of terminal width, with a 75-column minimum
  bounded by the available space after side padding. Explicit numeric caps still
  work; `auto` uses the same responsive behavior. Session content already fills
  its available width.
- The bundled `nightowl` theme is the startup default and fallback. Explicit
  `tui.json` or saved theme choices retain precedence. No installed user settings
  were edited; a previously selected theme can be changed with `/themes`.

Verification: TUI package typecheck passes; focused theme/config/keymap tests
report **19 pass, 0 fail, 45 assertions**. Actual source launches under native
ConPTY with isolated configuration verify the `tab mode` footer, Tab to Plan,
Shift+Tab to Build, and Night Owl background color. The rendered home prompt is
**144 columns at terminal width 160** and **75 columns at width 80**. A third
launch confirms an explicit Matrix theme and 90-column cap remain effective.
No model requests were submitted.

Local receipts: outer workspace `verification/home-presentation-result.json`,
`verification/home-{160,80}-default-terminal.txt`, and
`verification/home-160-matrix-terminal.txt`. Reproduce with
`node verification/home-presentation-2026-11-01.cjs` from the outer workspace.
These are isolated source checks; installed-user configuration acceptance and
the six live model bindings remain pending.

## Provider research, 2026-10-31

- [OpenCode Console models](https://opencode.ai/v2/docs/console/models/) lists
  several temporary free offers, including Nemotron 3 Ultra and Nemotron 3.5
  Lightning. It also states that free chat models require OpenCode. Access from
  this fork must therefore be demonstrated; catalog entries do not establish it.
- [Groq limits](https://console.groq.com/docs/rate-limits) distinguishes plan
  limits and directs users to their account for exact allowances. No current
  account entitlement or quota independence has been verified here.
- [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits) distinguishes
  credit, budget and free-model rate limits. No OpenRouter credential access or
  usable binding has been established in this session.

These are research leads, not recommended or configured model pairs.

## Environment and next work

`vangio models` failed before listing models with `EEXIST: file already exists,
mkdir 'C:\Users\kodec\.config\vangio'`. The managed agent cannot currently
access the user config directory. The user has been asked to run the command in
their ordinary Windows terminal to distinguish installed-host access from the
agent environment. No ACLs, SSH trust settings or credentials were changed.
A read-only file-open probe confirmed access denied on
`C:\Users\kodec\.config\vangio\opencode.json` without reading or printing its contents.

Next: obtain the actual configured catalog and run three real role-appropriate
tool turns for each proposed binding. Deterministic role continuation and
bounded exhaustion now have production-loop fixtures. Visible installed-TUI
switch/exhaustion acceptance and the live six-model matrix remain pending. Preserve
the warrior output requirement until realistic implementation evidence supports
changing it. Install only after verified pairs are established. Phone/Tailscale
remains gated on completion of the core acceptance in NEXT-STEPS.md.

## Project role-model persistence, 2026-11-02

New Worker/Scout terminal acceptance exposed a prerequisite defect:
`Config.update` saved `config.json`, but project discovery only reads
`opencode.json` and `opencode.jsonc`. A changed model was written without
becoming effective. The earlier King fixture chose its existing primary and
therefore did not expose this mismatch.

Project updates now write `opencode.json`, or patch existing `opencode.jsonc`
in place. JSONC retains its comments and wins when both formats exist, matching
loader precedence. Existing project settings and unrelated role bindings survive.
Generic `config.json` files are left untouched because they may belong to other
tooling; their contents were never loaded as project configuration.

The picker fixture now puts defaults in an isolated base file rather than
`OPENCODE_CONFIG_CONTENT`, which intentionally overrides project configuration.
It selects a different model and requires the UI's runtime activation confirmation
as well as the saved binding. Idle picker tests make zero provider requests.

Validation:

- Config suite: **99 pass, 0 fail, 170 assertions**. Three focused tests failed
  before the fix. Coverage includes new files, existing JSON/JSONC settings,
  preserved JSONC comments, both formats together and the empty shell sentinel.
- OpenCode package `bun typecheck`: **pass** after the final source change.
- Native ConPTY: the eight-case run passed seven cases. Its busy-case assertion
  timed out because cursor movement rendered the warning without literal spaces
  in the stripped transcript. The warning and absent config were observed.
  After correcting only that assertion, the focused busy case passes.
  Across those runs **all eight scenarios pass**: continuation, bounded pair
  exhaustion, manual King selection, persistent errors, Warrior save/activation,
  Scout save/activation, refusal during active work, and visible write failure
  followed by successful retry. No source defect was found in the busy/error UI.
- No generated `config.json` or `opencode.json` exists in `packages/opencode`.

Receipts in the outer workspace: `verification/config-save-2026-11-02.log`,
`verification/picker-2026-11-02-verified/gryphon-live-terminal-result.json`
(seven passes and the original busy assertion failure), and
`verification/picker-2026-11-02-busy/gryphon-live-terminal-result.json`
(corrected busy-case pass). Earlier failed exploratory harness receipts remain
separate and are not counted as acceptance passes.

Reproduce all eight with `node packages/tui/script/verify-gryphon-fallback.cjs`
from the repository root. An optional output directory and scenario names can
limit the run. These are source tests against a localhost provider, not live
model entitlement or installed-user acceptance.

Next: obtain the installed catalog and expanded Zhipu provider error from the
user's normal terminal, then complete the six-slot live matrix. Installed config
access remains denied in the managed session. Phone/Tailscale remains gated.
