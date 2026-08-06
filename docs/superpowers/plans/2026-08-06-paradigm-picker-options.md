# Status-row paradigm picker — options, and the decision

> **Status: DECIDED 2026-08-06 — build A + B.** C is rejected for now; D is not to be probed
> unless B's restart notice proves annoying in real use. Nothing is implemented yet: next session
> starts by writing the implementation plan for A+B, then executes it TDD.
>
> Split out of `2026-08-02-paradigm-layer.md`, whose Scope Split section deferred the picker to a
> separate plan because it is the only part of the feature that puts VanGio code into
> `packages/tui/` — upstream-churn territory at ~37 commits/day, i.e. permanent monthly merge cost
> rather than a one-time one.

## The blocker, measured twice

**A live paradigm switch is not reachable through the current mechanism.** This is measured, not
assumed, and it is what splits "a picker" into four different features.

| Probe | Method | Result |
|---|---|---|
| Does a running session pick up a marker change? | ConPTY harness: boot with `premium-gryphon` (Sonnet king), flip `~/.local/share/vangio/paradigm-active` to `gryphon`, force 3 repaints | **No.** Status row stayed Sonnet, never showed DeepSeek. |
| Does the v1 `config` hook ever re-fire? | Probe plugin appending to a log on every hook fire; then changed the marker, rewrote `opencode.json`, and sent Tab | **No.** Exactly 1 fire, at boot. Nothing re-triggered it. |

The v1 `config` hook runs once at config-load time. The compiled paradigm lands in `cfg.agent`,
agents resolve from that once, and nothing re-reads it. Both probes are in errors.md.

## The four options

### A — Show the active paradigm in the status row (display only)

Add the active paradigm name beside the model in the prompt status row
(`packages/tui/src/component/prompt/index.tsx`, where agent · model · description-marquee already
live). No switching.

- **Why it earns its place:** there is currently *no way to see which paradigm is active* short of
  `cat`-ing a file in the data dir. That is a real gap, and it gets worse as v4 adds presets.
- **Cost:** one additive change to one TUI file.

### B — A picker that switches, applying on restart

A dialog listing paradigms from `~/.config/vangio/paradigms/`; selecting one calls the existing
`writeActiveName()` (`packages/paradigm/src/load.ts`) and states plainly that it applies on next
launch.

- **Why:** removes the real friction, which is remembering the marker path and shell syntax.
- **Honesty requirement:** the UI must say it takes effect on restart. The paradigm plan's rule
  stands — do not ship something that appears to switch live and silently does not.
- **Cost:** one dialog, following an existing TUI dialog pattern; reuses `listParadigms` and
  `writeActiveName`, both already tested.

### C — A picker that switches live

What "picker" most likely means intuitively. Requires agent resolution to become mutable at
runtime rather than resolved once from config.

- **Cost is strategic, not just large.** `docs/fork/build-progress.md` lists *"the paradigm layer
  genuinely requiring a rewrite of the agent loop rather than a layer on top"* as one of **three
  observable events that would justify cutting ties with upstream entirely.** This is that event.
- **Do not start this** without deciding the upstream-tracking question first.

### D — Picker switches, then relaunches the TUI itself

Floated, not recommended, and **not yet probed**. Sessions persist in
`~/.local/share/vangio/opencode-local.db`, so a relaunch could resume where you were: a ~2-second
flash instead of a restart instruction.

- **Appeal:** honest, and touches agent resolution not at all — it sidesteps C's entire cost.
- **Unknown:** whether relaunch-and-resume is clean (session restoration, PTY handoff, scrollback,
  in-flight requests). Needs its own probe before it can be planned.

## Decision — 2026-08-06

**Build A + B.** A fills a genuine visibility gap; B removes the actual friction without lying
about what it does. Both are additive and confined to the status row plus one dialog — small
enough that the standing `packages/tui/` merge cost is worth paying.

**C is rejected for now** — it is gated on the upstream-tracking question, which is a separate
strategic decision and not part of this work.

**D is not to be probed** unless B's restart notice proves annoying after real use. Do not
pre-emptively build it.

### Acceptance criteria for A+B

1. The status row shows the active paradigm name alongside the model, and reads correctly at boot
   for both `gryphon` and `premium-gryphon`.
2. When no paradigm is active, the row degrades cleanly — no empty separator, no crash.
3. The picker lists every valid paradigm in `~/.config/vangio/paradigms/`; a malformed file is
   skipped, not fatal (`listParadigms` already returns errors rather than throwing).
4. Selecting one writes the marker via `writeActiveName()` and **states that it applies on
   restart** — no wording that implies a live switch.
5. Verified under the ConPTY harness, not by `--version` and not by unit tests alone: boot with
   each paradigm and confirm the row; open the picker; select the other one; restart; confirm the
   row and `debug agent build` both changed.
6. `bun test` per package green, `bun typecheck` 32/32, no upstream file modified outside the two
   TUI touch points.

## Reusable pieces already built and tested

- `listParadigms(dir)` / `readActiveName(path)` / `writeActiveName(path, name)` —
  `packages/paradigm/src/load.ts`, 5 tests.
- `PARADIGM_DIR`, `ACTIVE_MARKER` — `packages/paradigm/src/index.ts`.
- Re-run `bun run packages/paradigm/script/install.ts` after any change to `packages/paradigm/src`:
  the plugins dir holds a snapshot, not a live link.
- TUI verification requires the ConPTY harness (`.claude/skills/verify/SKILL.md`). `--version`
  proves nothing. `pty.spawn` needs an absolute `bun.exe` path on Windows.
