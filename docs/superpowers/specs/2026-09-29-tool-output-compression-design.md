# Tool-output compression — headtail at ingest

> Written 2026-09-29. Design pass on the item build-progress.md left open for weeks under the
> shorthand "RTK-style tool-output compression." The label came from an earlier conversation and
> is not defined anywhere in the repo. The idea it stood for — compress bash/grep/test output
> before it enters context — survives, with the actual scope determined by the data below rather
> than the label.

---

## 1. The whole feature in one paragraph

Add `"headtail"` as a third direction to `Truncate.output` alongside the existing `"head"` and
`"tail"`, and make it the default. Drop `read.ts`'s internal `MAX_BYTES` from 50 KB to 8 KB and
switch its own truncation from head-only to a wrapper-preserving headtail. Every large tool
result — currently shipped in full on every subsequent turn — becomes a first-N-lines + last-M-lines
form with a machine-parseable omission marker in between, and the full text stays on disk under
the existing `TRUNCATION_DIR` for 7 days. Two upstream files patched, not restructured. No new
subsystem, no new config schema, no gateway.

The design deliberately does NOT include ANSI stripping, dedupe, per-tool policy registries, a
split-ratio config knob, or lower thresholds for tools other than `read`. Each of those was
weighed and rejected on evidence from the current session db.

---

## 2. Verified findings this rests on

Measured 2026-09-29 against `~/.local/share/vangio/opencode-local.db` (9.7 MB, 891 messages,
118 completed tool parts across 6 real sessions). Queries via `vangio db "…"`.

1. **`read` is 5× the volume of every other tool combined.** 204 KB across 50 calls, max 55 KB.
   Bash — the tool the build-progress note singled out — is 32 KB across 23 calls, and 14 of
   those 23 are under 500 B. The note's hypothesis was wrong; the wedge is `read`.
2. **`read` opts out of framework `Truncate`.** `read.ts:343` sets `metadata.truncated` in its own
   result, which trips the opt-out at `tool.ts:131`. Any design that extends only `Truncate`
   cannot touch `read`, which means it cannot touch the biggest volume source. This is why the
   design has to modify `read.ts` directly.
3. **Compaction is dormant on tool-heavy sessions.** Zero compaction messages in any of the 7
   sessions with real tool volume. The 131 compaction messages in the db are all in a disjoint
   `ses_fb…` cluster with zero tool calls (debug runs of the compaction agent itself). Both
   `SessionCompaction.processCompaction` (never triggered — 100 KB of tool output is nowhere near
   a 128 K free-model context ceiling) and `SessionCompaction.prune` (off in config, defaults to
   `false`) are inactive. **The reducer is the only defense against tool-output growth on
   free-tier sessions, not the first layer of two.**
4. **Zero ANSI escape codes across all 118 tool outputs.** Git Bash on Windows strips them; other
   tools produce structured text. An ANSI-strip pass has nothing to remove in this environment.
5. **`Truncate.output` already exists.** `packages/opencode/src/tool/truncate.ts:85`, applied to
   every tool via `tool.ts:135` unless the tool opts out. Defaults `MAX_LINES=2000` /
   `MAX_BYTES=50*1024`. Full outputs written to `TRUNCATION_DIR/tool_<id>` with 7-day retention.
   Config knobs `tool_output.max_lines` and `tool_output.max_bytes` already in the schema at
   `packages/core/src/v1/config/config.ts:136-148`. Extending it IS the patch-don't-rewrite move
   (per `AGENTS.md` constraint #3); building a parallel assembly-time layer would be the rewrite.

---

## 3. The design choices, with the reasoning that led to each

Recorded here because two of them reversed mid-brainstorm on new evidence, and the dead ends are
the useful part.

**Ingest-time via extending `Truncate`, not assembly-time via a new layer.** First choice was
assembly-time (a new pass between stored parts and outgoing request), reasoning: respects
patch-don't-rewrite, reversible, TUI-honest, age-aware option available. Reversed after finding
`Truncate.output` already exists at ingest with full-to-disk and the config schema in place.
Three of four reasons for assembly-time didn't survive the discovery — "patch-don't-rewrite"
INVERTED (extending the existing thing IS the patch), reversibility is close-to-preserved by the
7-day disk retention, TUI already renders the truncated form. What survived (retroactive config
changes) was small enough to trade away.

**Deterministic per-output, not age-varying.** A given tool result's reduction is a pure function
of its content, independent of position in history. Preserves prompt-cache hits when the user
moves to a paid tier that caches (Zen paid, Anthropic). Simpler to unit-test — a pure
`(content) → reduced_content` fits fixture strings. Age-varying would gain more aggressive
shrinkage of ancient outputs but bust cache and complicate reasoning.

**`SessionCompaction.prune` is NOT a complementary layer we're leaning on.** Earlier framing
called it that; verified findings above show it's off in config and finding #3 shows compaction
never fires on tool-heavy free-tier sessions anyway. The reducer stands alone; `prune` remains
optional extra credit for whenever the user flips it on.

**Two handlers, not a per-tool registry.** The default `Truncate.output` path handles everything
that goes through it (webfetch, grep, glob, edit, write). `read.ts` gets its own headtail
implementation because it opts out of framework Truncate and its output has a wrapper
(`<path>…</path>\n<type>file</type>\n<content>\n…\n</content>`) that a naive text-level cut
would break. This is a two-arm `switch`, not a registration mechanism. Tools that need custom
handling in the future — no evidence yet for webfetch/websearch shape sensitivity — get added
one at a time on evidence.

**Headtail as the default direction (default-on), not opt-in.** Reversed twice under devil's
advocacy. Landed on default-on because both options add the same config schema field
(`tool_output.direction`); the only difference is what the default value is. Under default-on,
rollback is one config line. Under opt-in, gaining the win requires opting in. Population of one
means measurement happens on the next real session either way, but default-on generates data
without further action. **Two flips on this question is a signal it's close** — opt-in is
defensible if a reviewer prefers the smaller blast radius.

**50/50 symmetric split, no config knob.** Reversed FOUR times under repeated devil's advocacy.
The strongest single argument in either direction is "lost-in-the-middle attention behavior
favors preserving both anchors equally," which lines up with 50/50. A config knob signals "we
didn't decide" and adds a permanent schema field for a benefit that may not materialize; better
to pick a defensible default and change it on evidence. **Four flips on this question is a
strong signal it's close** — 30/70 tail-weighted, 40/60, or a config knob are all defensible.
Ratios are numeric; if evidence later favors a shift, changing 50/50 to another split is a
one-constant patch, not a schema break.

**Threshold change limited to `read`.** Framework `Truncate` defaults stay at 2000 lines / 50 KB —
one behavior change per commit. `read`'s internal `MAX_BYTES` drops from 51,200 to 8,192, chosen
because 47 of 50 corpus reads are already under 8 KB, so the change affects only the outputs
actually causing growth. Other tools stay on their existing thresholds; if bash/webfetch/shell
prove painful later, they can move via `tool_output.max_bytes` in config or in a follow-up commit
with its own justification.

**Explicitly NOT in v1, with the reason each was cut:**
- **No ANSI strip.** 0/118 outputs contain ANSI in this corpus.
- **No consecutive-dupe collapse.** Speculative; land if a real bash log later shows repeated
  lines dominating.
- **No config knob for split ratio.** See above — signal of indecision, add on evidence.
- **No lower thresholds for framework `Truncate` in code.** Same reasoning as split-ratio;
  configurable today via `tool_output.max_bytes` in opencode.json for tools other than `read`.
- **No compaction/prune changes.** Out of scope. `prune` stays off in your config; you flip it
  when you want the second layer.

---

## 4. Files changed and where

**`packages/opencode/src/tool/truncate.ts`**

1. Add `"headtail"` to the `direction` option type at line 24.
2. Add the `"headtail"` branch in `output()` after the existing `head`/`tail` branches (around
   line 102). Behavior:
   - If `lines.length <= maxLines && totalBytes <= maxBytes`, passthrough as today.
   - Otherwise: split `maxLines` symmetrically (`Math.floor(maxLines / 2)` for head,
     `maxLines - headLimit` for tail — ties go to the tail). Split `maxBytes` symmetrically
     (`Math.floor(maxBytes / 2)` each half).
   - Head pass: walk lines forward until either half-line-budget or half-byte-budget is reached
     (matching the existing head loop's shape).
   - Tail pass: walk lines backward from the end until the tail half-budgets are reached
     (matching the existing tail loop's shape).
   - If the two selections would overlap (tiny input relative to budget), fall back to head-only
     behavior for the whole budget — headtail on a 100-line input with a 200-line budget makes
     no sense.
   - Join: `head.join("\n") + "\n\n...[K lines omitted, N bytes removed]...\n\n" + tail.join("\n")`,
     where K and N are computed from the full input minus what was kept.
3. Change the `direction` fallback at line 89 from `"head"` to `"headtail"`.
4. Rewrite the hint text at lines 130-131 to describe middle-cut behavior. Include the omitted
   line count and byte count. Keep the Task/Grep/Read guidance but adjust: "Use Grep to search
   the full content or Read with offset/limit to inspect the omitted middle range."

**`packages/opencode/src/tool/read.ts`**

1. Change `MAX_BYTES` at line 16 from `50 * 1024` to `8 * 1024`. Update `MAX_BYTES_LABEL`
   accordingly.
2. Modify `lines()` at line 137 to support headtail. New behavior:
   - Existing forward stream continues until either `maxLines / 2` or `maxBytes / 2` is reached.
     If EOF is reached first (small file), return the full result as today — no truncation.
   - If a half-budget is hit mid-file: mark the head as complete, note the last line number
     included, then continue draining the existing stream into a bounded ring buffer sized at
     `maxLines / 2` lines (dropping oldest as new lines arrive). At EOF, the ring buffer holds
     the tail. Single pass, no seek, no second stream open. Byte budget for the tail is enforced
     as lines are admitted to the ring (evict from the front if adding would exceed).
   - Emit output with the numbered-lines wrapper preserved:
     ```
     <path>…</path>
     <type>file</type>
     <content>
     1: <first head line>
     …
     <headLast>: <last head line>

     ...[K lines omitted, N bytes removed]...

     <tailFirst>: <first tail line>
     …
     <totalLines>: <last tail line>

     (End of file - total N lines. Middle omitted; use offset=<headLast+1> to inspect.)
     </content>
     ```
   - The trailing `<system-reminder>` block for LSP-loaded files (line 356) is appended AFTER
     `</content>` as today. Unchanged.
3. The directory-listing branch at lines 264-297 is out of scope — `<entries>` outputs are small
   (max 1.5 KB in corpus) and would not benefit.

**`packages/opencode/test/tool/truncation.test.ts`**

Add cases covering:
- `direction: "headtail"` on input that fits within budget → passthrough unchanged.
- `direction: "headtail"` on input larger than `maxLines` but small line lengths → symmetric line
  split, byte budget not the constraint.
- `direction: "headtail"` on input with very long lines → byte budget binds each half; line
  budget not the constraint.
- `direction: "headtail"` on input where head+tail would overlap → fallback to head behavior.
- Default direction (unspecified) exercises `"headtail"`, confirming the default flipped.
- Marker text is machine-parseable: `/\.{3}\[(\d+) lines omitted, (\d+) bytes removed\]\.{3}/`.

**`packages/opencode/test/tool/read.test.ts`**

Add cases covering:
- Small file (under 8 KB): output unchanged, no marker.
- Medium file (~20 KB, ~500 lines): headtail applied, wrapper intact, `<path>` / `<type>` /
  `<content>` / `</content>` boundaries preserved.
- Large file (>50 KB): same as medium, byte budget dominates.
- Line-number continuity: head numbers start at 1 (or `offset`), tail numbers end at total
  line count. Middle line numbers are omitted, not renumbered.
- The `(End of file - total N lines. Middle omitted; use offset=… to inspect.)` closing text
  matches the expected format.
- LSP-loaded `<system-reminder>` block appears AFTER `</content>` when applicable.

---

## 5. Data flow after the change

```
Tool completes
  └─ tool.ts:113 wrapper runs execute(), gets { output, metadata, … }
       ├─ if metadata.truncated is already set (tool opted out): skip Truncate.output
       └─ else: yield* truncate.output(result.output, {}, agent)
            ├─ under limits: passthrough
            └─ over limits: headtail via new branch
                 → returns { content, truncated: true, outputPath: file }
                 → tool.ts:137 stores { output: content, metadata: { truncated, outputPath } }
                 → full text at TRUNCATION_DIR/tool_<id> (7-day retention, unchanged)

Read tool (opts out of framework Truncate)
  └─ read.ts:229 run() invokes lines()
       ├─ streams first (maxLines / 2) OR (maxBytes / 2) worth from top
       ├─ if hit mid-file: collect tail into ring buffer, produce headtail
       ├─ wrap in <path>/<type>/<content>… </content>, append EOF marker
       └─ appends its own truncation hint referencing offset for the middle
```

Storage of the full text: framework Truncate uses `TRUNCATION_DIR/tool_<id>` today. `read.ts`
today does NOT save a full copy on truncation — the model is instructed to re-read with `offset`
if it needs the omitted section. This design does not add disk persistence for `read` outputs
that were headtail'd, on the grounds that `read` can be re-invoked deterministically against the
same file. If the file has changed since the original call, the re-invocation returns fresh
content, which is the correct behavior.

---

## 6. Expected impact on the corpus

Based on the 118-output db sample, applied per-session. Per-session numbers are estimates —
per-tool breakdowns within each session were not measured; the totals below assume that read
outputs above 8 KB collapse to the threshold and everything else stays as-is, applied against
the aggregate figures known for each session.

| session | today | after change (est.) | delta (est.) |
|---|---|---|---|
| `ses_00911031…` (7 tool calls) | 103 KB | ~35-45 KB | −60-70 KB per turn |
| `ses_0429d2c0…` (19 calls) | 80 KB | ~50-60 KB | −20-30 KB per turn |
| `ses_089a1795…` (23 calls) | 72 KB | ~55-65 KB | −10-20 KB per turn |

Actual per-session numbers should be recomputed by replaying each session against the
implemented reducer. The corpus-wide savings from the read.ts change specifically (across all
50 read calls in the db) are approximately 150-180 KB — the number that matters is 3 outputs
at >20 KB dropping to 8 KB each (~140 KB saved on those alone).

Growth savings scale with turn count — a session that runs 10 more turns after the reducer
lands saves 10× the per-turn delta. The 103 KB session, resent every turn from turn 8 to turn
18, would have re-sent 1 MB of tool output on the untouched design; ~350 KB under this design.

Framework Truncate at unchanged 50 KB threshold catches nothing in the current corpus (largest
non-read output is webfetch at 47 KB). The default direction change (`head` → `headtail`) is
visible only when a future output exceeds the framework threshold.

---

## 7. Verification

Per `AGENTS.md`: tests run per-package, not from repo root.

```
cd packages/opencode
bun test tool/truncation.test.ts
bun test tool/read.test.ts
bun typecheck   # if the direction enum change surfaces a downstream type mismatch
```

`--version` is NOT proof — it exits before the TUI module graph loads. Real verification is a
launch under the ConPTY harness against a fixture file of ~500 numbered lines, with the
resulting `part.state.output` inspected to confirm wrapper preservation and marker placement.
The 55 KB read from `build-progress.md` in the current corpus is a natural regression fixture:
run it, capture the stored `state.output`, assert wrapper tags and marker text.

Rollback if either the headtail default or the 8 KB threshold proves wrong: one line each in
`~/.config/vangio/opencode.json` — `tool_output.direction: "head"` reverts the framework
behavior; a manual `read` override would need a code change since `read.ts`'s 8 KB is not
exposed as config in v1. If that flexibility matters, add `read.max_bytes` in a follow-up.

---

## 8. Open questions for the next design pass

Not blocking v1; noted so they're not lost:

- **Should `read`'s new threshold be exposed as config (`read.max_bytes`)?** V1 hard-codes 8 KB.
  If the value proves wrong, exposing it as config is one commit — but also a schema commitment.
  Defer until we have evidence 8 KB is wrong for a workflow that matters.
- **Should webfetch/websearch get their own reducer?** Two calls in the corpus, 47 KB and 25 KB.
  Their content is markdown/HTML, not line-numbered; a line-based head+tail may cut mid-code-block
  or mid-JSON. If they become common in real sessions, add a webfetch-aware handler that respects
  the content type.
- **Consecutive-dupe collapse for bash-family tools.** Unmeasured. Would show up as a win on
  progress-bar-heavy bash outputs (npm install, docker pull). Not in current corpus.
- **Prune activation.** Orthogonal to this design but relevant to the same growth problem. Flip
  `compaction.prune: true` in config as a separate experiment, measure whether the 40 KB
  `PRUNE_PROTECT` window is right for tool-heavy sessions on free tiers.
