# Gryphon verification — 2026-10-30

## Dependency access repaired

Bun's Windows hardlinks shared protected, owner-only file ACLs with the private
user cache. The sandbox could inspect project directories but could not read
TypeScript, Effect or node-pty files. The owner-side diagnostic confirmed
inheritance was disabled on those files, with grants only for the owner,
Administrators and SYSTEM.

The owner ran a frozen-lockfile install with `--backend copyfile`, preserving
the old .bun store as a backup. All 4689 packages installed. Follow-up diagnostics
confirm independent files with inherited project permissions. Private cache ACLs
were not changed. Future Windows installs in this environment should also use
`bun install --frozen-lockfile --backend copyfile` to avoid reintroducing hardlinks.

PowerShell displayed Bun's stderr progress as NativeCommandError, but installation
completed successfully. The repair helper now converts native output to strings
before displaying it to avoid that misleading formatting.

## Verified on original source

- `bun typecheck` passes in packages/paradigm, packages/tui and packages/opencode.
- Paradigm suite: 246 pass, 0 fail, 629 assertions.
- OpenCode fallback, fallback-swap, retry, retry-swap-hook, retry-model-swap and
  switched-model suites: 173 pass, 0 fail, 292 assertions. Run with the package's
  documented `--timeout 30000`; the initial default five-second hook timeout
  was insufficient.
- Two provider-recovery integration fixtures used Coding Plan candidates as
  free models. They now use a synthetic free provider, preserving the original
  one-model versus provider-wide failure assertions under the new free guard.
- Actual ConPTY launch of the original app: all three role rows render at
  140x40 and 80x30; /models opens the role picker; /craft and /clone each show
  Coming soon. This uses an isolated config and a bundle of current paradigm
  TUI source. No provider prompt was sent or installed user config changed.

Outer workspace receipts: verification/gryphon-runtime-tests.log,
verification/gryphon-terminal-result.json, verification/gryphon-terminal-output.txt,
verification/host-access-result.json and the dependency repair log.

## Remaining product acceptance

These results do not establish six usable free model bindings, real quota
exhaustion or live provider continuation. The declared-only policy is opt-in
and is not yet enabled in the shipped Gryphon preset. Primary free admission
and unknown-price provenance remain unfinished. Role-picker save/busy/error
flows and live backup display still need full UI acceptance. Phone/Tailscale
remains deferred until the core gate in NEXT-STEPS.md is met.
