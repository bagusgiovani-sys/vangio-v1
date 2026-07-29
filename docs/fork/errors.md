# Error Log — VanGio
> Append-only. Never edit existing entries. Never delete.
> Read this at the start of every coding session.

## Entry Format
---
## [YYYY-MM-DD HH:MM] [Short title]
#[type] #[concept]
**Context:** What you were building
**Error:** Exact error message or description
**Root cause:** Why it actually happened
**Fix:** Exactly what resolved it
**Prevention:** Rule to add to OVERVIEW.md > What NOT To Do
**Files affected:** List of changed files
---

## [2026-07-20 07:10] Global `vangio` dead outside the repo — bun reads jsxImportSource from cwd, not from the file
#[environment] #[tooling] #[bun] #[tui] #[jsx]
**Context:** Running the global `vangio` command from another project (`C:\Exodus\Projects\Kodecoon LMS\KodeHub`) to start a TUI session there.
**Error:** `Error: Unexpected error` / `Cannot find module 'react/jsx-dev-runtime' from 'C:\Exodus\Projects\VanGio-AI Agent\vangio-v1\packages\tui\src\config\index.tsx'` — TUI never rendered.
**Root cause:** bun resolves `jsxImportSource` from the tsconfig.json nearest the **current working directory**, NOT the one nearest the file being transpiled. The TUI's JSX targets `@opentui/solid`, set in `packages/opencode/tsconfig.json` and `packages/tui/tsconfig.json`. The session-10 shim deliberately did not change cwd (so `vangio` opens the folder you are standing in), so bun read whatever tsconfig was near that folder — KodeHub's says `"jsx": "react-jsx"`, and the repo root's sets no JSX at all — and both fall back to the default runtime `react`, which is not installed. Confirmed by controlled experiment: identical command **succeeds** from `packages/opencode`, **fails** from the repo root AND from KodeHub. So this was never about the other project's React config; any cwd without the right tsconfig breaks it. Why it went unnoticed since session 10: that session verified only `vangio --version`, which short-circuits before any TUI module loads. `vangio run` was never affected because upstream already pins the runtime per-file with `@jsxImportSource` pragmas in `packages/opencode/src/cli/cmd/run/footer.*.tsx`.
**Fix:** New `script/vangio-launcher.ts` plus rewritten shims. The shims now start bun with `--cwd <repo>/packages/opencode` (correct tsconfig at startup) and pass the invocation directory in `VANGIO_ORIGINAL_CWD`; the launcher does `process.chdir()` back to it — and also restores `process.env.PWD`, because `resolveThreadDirectory()` resolves a relative project positional against PWD — before importing the CLI. Verified end-to-end with the real `vangio` command: bare TUI from KodeHub, repo root, and home dir all open the correct project; `vangio ..` resolves to the parent; `--version`, `models`, and `serve` all work, with `serve`'s `/path` confirming `worktree`/`directory` = the invoking folder. Both the sh and .cmd shims tested.
**Rejected alternatives:** `--tsconfig-override` is a `bun build` flag only — the runtime ignores it (and emitted an internal "directory mismatch" bug notice). Adding `@jsxImportSource` pragmas the way upstream does would mean touching 103 `.tsx` files in `packages/tui` and conflicting with every future upstream merge. Compiling a binary would fix cwd entirely but makes a stale build fail **silently** after source edits — the wrong trade for a fork under active development.
**Prevention:** When verifying that a from-source launcher works, never accept `--version` (or `--help`) as proof — both exit before the TUI module graph loads. Exercise the actual default command. More generally: for anything run from source outside its own repo, assume bun's transpiler config follows cwd, so pin cwd to the package and restore the user's directory at runtime.
**Files affected:** script/vangio-launcher.ts (new), ~/.bun/bin/vangio + ~/.bun/bin/vangio.cmd (machine-level, contents recorded in build-progress.md)
---

## [2026-07-19 21:50] Notifier fired but no push arrived — short-lived `vangio run` kills in-flight sends
#[plugins] #[async] #[verification] #[mobile-control]
**Context:** Verifying the new `packages/notifier` plugin (v3 mobile session control) end-to-end for the first time. Unit tests were all green and the bundle sent correctly when driven in isolation, but a real `vangio run "say pong"` session produced no notification on the ntfy topic.
**Error:** Silent. No error, no log line, no dropped-send warning — the notification simply never arrived. `curl` polls of the topic showed only the earlier manual test message.
**Root cause:** Found by instrumenting the *installed bundle* (not the source) with file logging at each stage. The plugin loaded, `server()` was called with the topic visible, and `decide()` correctly returned `Done - vangio-v1` — then `FETCH START` logged and nothing more. The POST to ntfy.sh takes ~4 s from this machine, but `vangio run` is a short-lived CLI that exits as soon as the run completes, killing the in-flight request. Two contributing details: (1) the host dispatches event hooks fire-and-forget (`void hook.event(...)` in packages/opencode/src/plugin/index.ts) so nothing awaits the send; (2) `run` creates TWO plugin instances (one for `packages/opencode`, one for the repo root) with separate state — the dispose that ran belonged to the *other* instance and logged `pending=0`, while the instance holding the real in-flight send was never drained before exit.
**Fix:** Added a `dispose` hook to the notifier that drains in-flight sends (`await Promise.all(pending)`), covered by a test that proves dispose blocks until a slow send resolves. This does NOT rescue the `run` CLI case (that instance's dispose isn't awaited before process exit) — but it is correct for the actual deployment, and verified there: under `vangio serve` (long-lived, the mode mobile control actually uses), a real session driven through `POST /session` + `POST /session/:id/message` logged `FETCH RESPONSE 200` and the phone topic received `Done - vangio-v1 / Session finished after 8 s`.
**Prevention:** Never accept "unit tests pass + isolated script works" as end-to-end proof for a plugin — the host's process lifetime is part of the contract. When a fire-and-forget hook shows no error and no effect, instrument the INSTALLED artifact stage by stage (module evaluated → hook called → decision → request start → response) rather than guessing; that log pinned this in one run. Also remember multi-instance loading: per-directory plugin instances have independent state, so a clean-looking dispose may belong to a different instance than the one holding your work.
**Files affected:** packages/notifier/src/plugin.ts, packages/notifier/test/plugin.test.ts, docs/fork/mobile-control-setup.md
---

## Known-Risk Watchlist (from planning — not errors yet, but expect these)
- **GLM phone verification** may reject your number at open.bigmodel.cn → fallback: z.ai international portal
- **Provider baseURLs drift** — Qwen/Kimi endpoints change; a wrong URL = silent failure. Always verify at setup
- **Free-model tool-calling quirks** — free/open models (Qwen, possibly GLM) may not stop cleanly after a tool call (documented OpenCode issue). Not a crash, an expected rough edge
- **GLM free vs paid endpoint mixup** — `/api/paas/v4` (free) vs `/api/coding/paas/v4` (paid Coding Plan) are NOT interchangeable
- **Kimi** requires min $1 top-up before the API works at all — not truly free
- **Local Ollama** on this hardware (16GB RAM, integrated graphics) will be slow — expected, not a bug
- **Zen free-tier limits are unpublished but real** — users report hitting a hard "Free usage exceeded, add credits" wall after "two huge sessions for six hours" (opencode issue #28055). Cooldown/reset behavior is undocumented and unreliable. Some users resort to Cloudflare WARP proxies (oplire tool) to work around it. Pooled across all Zen free models or per-model: unknown. Treat as a finite trial, not unlimited free access.
- **`.vangio` project-dir support exists in only ONE of two live config paths** (added 2026-07-29) — VanGio patched `packages/opencode/src/config/paths.ts` + `config/config.ts` (v1 path) to read `.vangio` project dirs. Upstream's newer `packages/core/src/config.ts` hardcodes `.opencode` in three places (lines 181, 189, 195) and is NOT patched. Verified 2026-07-29 that `.vangio/opencode.json` IS honored today (a `debug config` run in a scratch project returned the marker model from `.vangio/`), so the v1 path is the live one for project-config discovery — this is a **latent** risk, not a current bug. Upstream is mid-migration from v1 to v2 (84 commits in the agent/config surface over 6 months: "remove domain layer exports", "integrate into v2", "add v2 effect host"). When that migration completes, `.vangio` project dirs will stop resolving **silently** — exactly the failure shape as the 2026-07-18 path-rebrand entry below, where Gryphon vanished with no error message. Re-run the `.vangio` marker test after every upstream merge.
- **Project-plugin init can stall CLI commands in this repo** (added 2026-07-18) — `vangio models` run from source hung 3+ minutes with the repo's `.opencode` config loading (graphify, opencode-mem, codegraph MCP), but completed in under a minute with `OPENCODE_DISABLE_PROJECT_CONFIG=1`. Plugin loading was silently OFF between the `.vangio` path rename and the legacy-fallback fix, so this only became visible again on 2026-07-18. Matches the standing open item "Graphify and opencode-mem work correctly in practice: unverified." Investigate before trusting those plugins; workaround for quick CLI checks is the env var above.

## Log

---
## [2026-07-19 10:30] Plugin-init stall root-caused (one-time npm install) + graphify confirmed incompatible
#[plugins] #[performance] #[verification]
**Context:** Investigating the 2026-07-18 watchlist item: `vangio models` in this repo hung 3+ minutes with project config, fast without it.
**Error:** No error — silent stall. Log for the hung run ends at `loading .opencode\opencode.jsonc`, nothing after. Separately, every full boot since logs `ERROR failed to load plugin path=@sentropic/graphify error="Plugin export is not a function"`.
**Root cause:** Two independent things. (1) The stall was the ONE-TIME cold `npm install` of the plugin framework dep tree (`@opencode-ai/plugin` + effect + ai-sdk) into `.opencode/node_modules` — restored plugin loading (legacy-fallback fix) triggered it for the first time, network install took minutes, and killing the command left it to finish on the next boot. Both later boots with project config completed in seconds. Not a code bug. (2) graphify's latest release (0.17.1, 2026-06-23, verified via npm) predates the current plugin API: its module exports neither a function nor a `{server}` shape, so `getLegacyPlugins` throws. No compatible version exists to upgrade to.
**Fix:** (1) None needed — documented behavior: first boot after adding plugins/config dirs does a silent network install and can take minutes; don't kill it, or run once with `OPENCODE_DISABLE_PROJECT_CONFIG=1` if in a hurry. (2) Removed `@sentropic/graphify` from `.opencode/opencode.jsonc` (comment in the file explains; CodeGraph MCP covers the need). `opencode-mem` kept — loads without errors, live behavior still unverified.
**Prevention:** Before treating a "hang" as a bug, read `~/.local/share/vangio/log/opencode.log` first — the last line tells you which phase stalled. And never assume a config-only plugin install works: watch the boot log for `failed to load plugin` the first time it actually loads.
**Files affected:** .opencode/opencode.jsonc
---
## [2026-07-18 21:30] Path rebrand orphaned all user config — Gryphon vanished, model fell back to GLM 5
#[migration] #[config] #[rebranding]
**Context:** Phase 8 rebranding. A prior commit changed the XDG app dir constant from `opencode` to `vangio` (packages/core/src/global.ts), so VanGio started reading `~/.config/vangio/`, `~/.local/share/vangio/`, `~/.local/state/vangio/` — all freshly created and empty.
**Error:** No error message at all — the failure was silent. The Gryphon/premium-gryphon/scout/warrior agents disappeared from the TUI, and the model silently changed to `zhipu/glm-5`.
**Root cause:** The rename shipped without a data migration. The real config (agents, Zen provider, DeepSeek default), auth DB, and model history stayed in the old `opencode` dirs. With no config model, provider auto-detection found only the `ZHIPU_API_KEY` user env var and default-model selection took the top-ranked catalog model for the only available provider → GLM 5. Three more rename leftovers compounded it: config.ts still matched dirs ending `.opencode` (so `.vangio` project config never loaded), plugin install still wrote to `.opencode`, and one TUI permission string was missed.
**Fix:** `feat(core): migrate legacy opencode dirs to vangio on first start` (7027e69a1) — one-time entry-by-entry copy of legacy config/data/state at bootstrap (never overwrites, skips old logs, marker file in state dir, partial failures retry next start; 5 bun tests + sandboxed XDG end-to-end). Project-level `.opencode` dirs stay readable as a fallback with `.vangio` winning. Leftover spots fixed in the same commit. Migration ran for real on this machine: config hash-identical, Gryphon back, `vangio models` lists the Zen models + anthropic from the migrated config.
**Prevention:** Any rename of a storage path (config dir, data dir, DB file, marker file) MUST ship the migration in the same commit — never as a follow-up. Silent-fallback design means orphaned data produces no error, only wrong behavior, so grep for every consumer of the old path (here: config dir match, install target, docs/skill text) before calling a rename done.
**Files affected:** packages/core/src/legacy-dirs.ts (new), packages/core/test/legacy-dirs.test.ts (new), packages/core/src/global.ts, packages/opencode/src/config/paths.ts, packages/opencode/src/config/config.ts, packages/opencode/src/plugin/install.ts
---
## [2026-07-17 22:10] ConPTY test harness: bun host breaks node-pty stdin; TUI dies without terminal query replies
#[environment] #[windows] #[verification] #[tooling]
**Context:** Verifying the Phase 6.6 marquee animation live. Animations need a real PTY (piped `bun dev` renders exactly one frame), so a `@lydell/node-pty` harness spawns the TUI in ConPTY and captures/injects terminal traffic.
**Error:** Two stacked failures. (1) With **bun** as the harness host runtime, every `proc.write()` to the PTY threw async `ERR_SOCKET_CLOSED` — the ConPTY input pipe was dead from the start, so the TUI got no input and no query replies. (2) Even with output flowing, the TUI writes terminal capability queries (XTVERSION `ESC[>0q`, kitty `ESC[?u`, ...) ~5s after launch and, receiving no replies, exits without rendering a single frame.
**Root cause:** (1) Bun's `node:net` named-pipe handling doesn't keep @lydell/node-pty's conin socket alive on Windows — node-pty's supported host is Node. (2) Under a PTY, opentui waits on capability negotiation before first render; a silent fake terminal fails that handshake (piped mode skips the handshake entirely, which is why `bun dev | ...` still shows one frame).
**Fix:** Run the harness with `node` (v22 works) and auto-respond to the queries like an xterm: XTVERSION → `ESC P>|xterm(388) ESC\`, DA1 → `ESC[?62;22c`, DSR 6n → `ESC[1;1R`, kitty → `ESC[?0u`, DECRQM 2026 → `ESC[?2026;2$y`, XTWINOPS 14/16 → sizes. Full TUI then boots, renders, animates, and exits cleanly on Ctrl+C.
**Prevention:** Recipe persisted in `.claude/skills/verify/SKILL.md` — future TUI verification starts from the working harness instead of rediscovering these two traps. Note the session-3 blink test presumably ran under node, which is why this never surfaced before.
**Files affected:** none in-repo (harness lives in session scratchpad; recipe in `.claude/skills/verify/SKILL.md`)
---
## [2026-07-17 00:30] Scout agent (North Mini Code) attempted unrequested file edit
#[model-behavior] #[free-model-quirk] #[agents]
**Context:** Live-testing the new `scout` agent (opencode/north-mini-code-free) with a read-only lookup question: "where is the owl logo rendered? which file do I edit to remove it?"
**Error:** Instead of answering, the model located the file and then attempted an Edit to remove the owl itself — an action nobody requested — then failed the edit (path resolution) and timed out (90s) without ever giving a final answer.
**Root cause:** Known category weakness of small free models: poor instruction discipline ("answer only, don't act"). The prompt phrasing "which file do I edit to remove it" was read as an instruction to edit. Confirms the pre-existing watchlist item "free-model tool-calling quirks."
**Fix:** Added `"permission": { "edit": "deny" }` to the scout agent config (same lock the king has) + rephrased test prompt. Retest: correct answer (packages/tui/src/component/logo.tsx) in 23s with minimal tool calls.
**Prevention:** ANY agent whose role is advisory/lookup-only must have edit denied in config — never rely on the prompt alone to keep a free model read-only. Rule generalizes: capability limits belong in permissions, not prose.
**Files affected:** ~/.config/opencode/opencode.json (out-of-repo config)
---
## [2026-07-16 22:00] Git symlinks materialized as text files broke pre-push typecheck
#[environment] #[git] #[windows]
**Context:** First `git push` from the fork on native Windows (docs/fork setup commit)
**Error:** Husky pre-push `bun turbo typecheck` failed: `packages/enterprise/src/custom-elements.d.ts(1,1): error TS1128: Declaration or statement expected.`
**Root cause:** The repo has 60 committed symlinks (git mode 120000). Git had `core.symlinks=false` locally (Windows default without symlink privilege), so each "symlink" was checked out as a plain text file containing only its target path — TypeScript then tried to parse the path string as a `.d.ts`. Pre-existing checkout issue, unrelated to any code change.
**Fix:** Enabled Windows Developer Mode (Settings → Privacy & Security → For developers), then `git config core.symlinks true`, deleted the 60 affected files, `git checkout --` them — all re-materialized as real symlinks. Typecheck passed; push succeeded.
**Prevention:** On any fresh clone of this repo on Windows: Developer Mode must be ON and `core.symlinks` must be true BEFORE `git clone` (or re-checkout symlinks after enabling). If typecheck ever fails with TS1128 on a tiny `.d.ts`, check `git ls-files --stage <file>` for mode 120000 first — don't debug it as a TypeScript problem.
**Files affected:** None (working-tree state only; no committed changes)
---
