# Tool-Output Compression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `Truncate.output` with a `"headtail"` direction (default-on, 50/50 symmetric), drop `read.ts`'s internal `MAX_BYTES` from 51,200 to 8,192, and switch `read.ts`'s own truncation to a wrapper-preserving headtail form — so growing tool-output history stops resending large `read` results in full on every turn.

**Architecture:** Two upstream files patched (not restructured), two test files extended. The design is a minimal extension of the existing framework-level `Truncate` service, plus a coupled change inside `read.ts` because `read` opts out of framework truncation via `metadata.truncated` at `tool.ts:131`. No new subsystem, no new config schema field.

**Tech Stack:** TypeScript, Bun (test runner), Effect-TS (framework the tool layer is built on), `bun:test` for assertions.

**Spec:** `docs/superpowers/specs/2026-09-29-tool-output-compression-design.md`

## Global Constraints

- **Patch, don't rewrite.** New behaviour goes in changes to existing files here because the design deliberately extends the existing `Truncate` mechanism. No new subsystem, no gateway, no assembly-time layer. Two files modified: `packages/opencode/src/tool/truncate.ts` and `packages/opencode/src/tool/read.ts`.
- **No AI attribution in any commit message, PR body, or tag.** Bagus Giovani is the sole author.
- **Tests run per package:** `cd packages/opencode && bun test tool/truncation.test.ts` and `cd packages/opencode && bun test tool/read.test.ts`. Root `bun test` is deliberately blocked.
- **Typecheck from the repo root:** `bun typecheck`.
- **Commit and push to `origin/dev` at every task boundary.** Never commit unverified work.
- **No `read.max_bytes` config field in v1.** The 8 KB threshold is hard-coded per the spec's decision; a config knob is a follow-up if evidence warrants.
- **The `<content>` wrapper on read output is load-bearing.** Consumers pattern-match on `<path>`, `<type>`, `<content>`, `</content>`, and the `(End of file - total N lines)` marker. All of these must survive headtail.
- **`--version` is NOT proof** the change works — it exits before the TUI module graph loads. Real proof after implementation is a launch via the `verify` skill's ConPTY harness against a fixture ≥500 numbered lines, with the returned `part.state.output` inspected for wrapper preservation and marker placement.

## Review Focus

Inputs the spec implies but no task's tests exercise by default. Each line has a test added to the owning task; the section below records why the test exists.

- **Read of a file that is one very long line** — byte cap triggers on a 1-line file; head-and-tail of one line is the same line. Owning task: **Task 3**. Expected: fall back to head-only truncation (existing single-line MAX_LINE_LENGTH shape), no headtail marker emitted.
- **Read with explicit `offset`+`limit` that lands mid-file above the 8 KB byte cap** — the model's own offsetting interacts with the new byte cap. Owning task: **Task 3**. Expected: headtail applies within the requested window; head line numbers start at `offset`, tail line numbers end at `offset + effectiveLines - 1`.
- **Read of an empty file (0 bytes / 0 lines)** — no lines to truncate. Owning task: **Task 3**. Expected: passthrough — wrapper intact, `(End of file - total 0 lines)` marker, no headtail marker.
- **Read where LSP `<system-reminder>` is appended AFTER truncation fires** — the `loaded` block at `read.ts:356` must survive the new output shape. Owning task: **Task 3**. Expected: the `<system-reminder>` block appears after `</content>` exactly as today, unaffected by the middle marker.
- **`Truncate.output("")` on an empty string** — degenerate input. Owning task: **Task 1**. Expected: passthrough with `truncated: false`, empty content returned unchanged.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/opencode/src/tool/truncate.ts` | **Modify.** Add `"headtail"` to direction option; implement headtail branch with overlap fallback; change default direction; rewrite hint text. |
| `packages/opencode/src/tool/read.ts` | **Modify.** Drop `MAX_BYTES` from 51,200 to 8,192; extend `lines()` to collect tail via ring buffer during the same stream pass; emit wrapper-preserved headtail output with updated hint. |
| `packages/opencode/test/tool/truncation.test.ts` | **Modify.** Add headtail direction tests (explicit + default). Update existing "truncates from head by default" test after Task 2 flips the default. |
| `packages/opencode/test/tool/read.test.ts` | **Modify.** Add wrapper-preservation tests, small-file passthrough, headtail with `offset`, empty-file, single-long-line, `<system-reminder>` preservation. |

---

### Task 1: Add `"headtail"` direction to `Truncate.output` (mechanism only, default unchanged)

**Files:**
- Modify: `packages/opencode/src/tool/truncate.ts` (Options type at line 24, output function at lines 85-141)
- Modify: `packages/opencode/test/tool/truncation.test.ts` (add tests after existing head/tail tests)

**Interfaces:**
- Consumes: `Truncate.Options` (existing), `Truncate.Result` (existing)
- Produces: `Options.direction` type now includes `"headtail"`; `Truncate.output(text, { direction: "headtail" })` returns a symmetric head+tail preview with middle omission marker

- [ ] **Step 1: Write the failing test — explicit headtail direction**

Add to `packages/opencode/test/tool/truncation.test.ts` after the existing `"truncates from tail when direction is tail"` test (around line 100):

```ts
it.live("truncates from headtail when direction is headtail", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
    const result = yield* svc.output(lines, { maxLines: 4, direction: "headtail" })

    expect(result.truncated).toBe(true)
    expect(result.content).toContain("line0")
    expect(result.content).toContain("line1")
    expect(result.content).toContain("line8")
    expect(result.content).toContain("line9")
    expect(result.content).not.toContain("line4")
    expect(result.content).not.toContain("line5")
    expect(result.content).toMatch(/\.{3}\[\d+ lines omitted, \d+ bytes removed\]\.{3}/)
  }),
)

it.live("headtail ties go to the tail on odd budgets", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
    const result = yield* svc.output(lines, { maxLines: 5, direction: "headtail" })

    // 5 total: floor(5/2)=2 head, 5-2=3 tail
    expect(result.content).toContain("line0")
    expect(result.content).toContain("line1")
    expect(result.content).not.toContain("line2")
    expect(result.content).toContain("line7")
    expect(result.content).toContain("line8")
    expect(result.content).toContain("line9")
  }),
)

it.live("headtail falls back to head when head+tail would cover full input", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const lines = Array.from({ length: 4 }, (_, i) => `line${i}`).join("\n")
    // maxLines=6 > input length 4 → fits, no truncation happens at all
    const result = yield* svc.output(lines, { maxLines: 6, direction: "headtail" })
    expect(result.truncated).toBe(false)
    expect(result.content).toBe(lines)
  }),
)

it.live("headtail with empty input passes through", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const result = yield* svc.output("", { direction: "headtail" })
    expect(result.truncated).toBe(false)
    expect(result.content).toBe("")
  }),
)

it.live("headtail enforces byte budget per half", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    // Each line is 100 bytes; 20 lines = 2100 bytes with newlines
    const line = "a".repeat(100)
    const content = Array.from({ length: 20 }, () => line).join("\n")
    const result = yield* svc.output(content, { maxBytes: 400, direction: "headtail" })

    expect(result.truncated).toBe(true)
    // 400 bytes total / 2 = 200 per half → 2 lines per half at 100+1 bytes each
    expect(result.content).toMatch(/^a{100}\na{100}/)
    expect(result.content).toMatch(/a{100}\na{100}$/)
  }),
)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/opencode && bun test tool/truncation.test.ts -t "headtail"`

Expected: All five tests FAIL — either with a TypeScript error on `direction: "headtail"` (not in the union type yet) or a runtime error because the branch isn't implemented.

- [ ] **Step 3: Extend the `direction` option type**

In `packages/opencode/src/tool/truncate.ts`, change line 24:

```ts
export interface Options {
  maxLines?: number
  maxBytes?: number
  direction?: "head" | "tail" | "headtail"
}
```

- [ ] **Step 4: Implement the headtail branch in `output()`**

In `packages/opencode/src/tool/truncate.ts`, after the existing `if (direction === "head") { ... } else { ... }` block (around lines 102-122), replace the head/tail conditional with a three-way branch. The full body of `output` becomes:

```ts
const output = Effect.fn("Truncate.output")(function* (text: string, options: Options = {}, agent?: Agent.Info) {
  const resolved = yield* limits()
  const maxLines = options.maxLines ?? resolved.maxLines
  const maxBytes = options.maxBytes ?? resolved.maxBytes
  const direction = options.direction ?? "head" // default flip happens in Task 2
  const lines = text.split("\n")
  const totalBytes = Buffer.byteLength(text, "utf-8")

  if (lines.length <= maxLines && totalBytes <= maxBytes) {
    return { content: text, truncated: false } as const
  }

  if (direction === "headtail") {
    const halfLines = Math.floor(maxLines / 2)
    const headLimit = halfLines
    const tailLimit = maxLines - halfLines // ties go to tail
    const halfBytes = Math.floor(maxBytes / 2)

    // Head pass: forward
    const head: string[] = []
    let headBytes = 0
    for (let i = 0; i < lines.length && head.length < headLimit; i++) {
      const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
      if (headBytes + size > halfBytes) break
      head.push(lines[i])
      headBytes += size
    }

    // Tail pass: backward, starting past what the head consumed
    const tail: string[] = []
    let tailBytes = 0
    for (let i = lines.length - 1; i >= head.length && tail.length < tailLimit; i--) {
      const size = Buffer.byteLength(lines[i], "utf-8") + (tail.length > 0 ? 1 : 0)
      if (tailBytes + size > halfBytes) break
      tail.unshift(lines[i])
      tailBytes += size
    }

    // Overlap fallback: head+tail cover the full input → head-only for the whole budget
    if (head.length + tail.length >= lines.length) {
      return yield* headOnly(lines, maxLines, maxBytes, totalBytes, agent)
    }

    const removedLines = lines.length - head.length - tail.length
    const removedBytes = totalBytes - headBytes - tailBytes
    const preview =
      head.join("\n") + `\n\n...[${removedLines} lines omitted, ${removedBytes} bytes removed]...\n\n` + tail.join("\n")
    const file = yield* write(text)
    const hint = hasTaskTool(agent)
      ? `The tool call succeeded but the output was truncated in the middle. First ${head.length} lines and last ${tail.length} lines shown; ${removedLines} lines omitted. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
      : `The tool call succeeded but the output was truncated in the middle. First ${head.length} lines and last ${tail.length} lines shown; ${removedLines} lines omitted. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to inspect the omitted middle.`

    return {
      content: `${preview}\n\n${hint}`,
      truncated: true,
      outputPath: file,
    } as const
  }

  // Existing head/tail behavior preserved
  const out: string[] = []
  let i = 0
  let bytes = 0
  let hitBytes = false

  if (direction === "head") {
    for (i = 0; i < lines.length && i < maxLines; i++) {
      const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
      if (bytes + size > maxBytes) {
        hitBytes = true
        break
      }
      out.push(lines[i])
      bytes += size
    }
  } else {
    for (i = lines.length - 1; i >= 0 && out.length < maxLines; i--) {
      const size = Buffer.byteLength(lines[i], "utf-8") + (out.length > 0 ? 1 : 0)
      if (bytes + size > maxBytes) {
        hitBytes = true
        break
      }
      out.unshift(lines[i])
      bytes += size
    }
  }

  const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
  const unit = hitBytes ? "bytes" : "lines"
  const preview = out.join("\n")
  const file = yield* write(text)

  const hint = hasTaskTool(agent)
    ? `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
    : `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`

  return {
    content:
      direction === "head"
        ? `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`
        : `...${removed} ${unit} truncated...\n\n${hint}\n\n${preview}`,
    truncated: true,
    outputPath: file,
  } as const
})
```

Also extract the head-only inline path into a helper function `headOnly` above `output`, so the overlap-fallback can call it. Place after `write`, before `limits`:

```ts
const headOnly = Effect.fn("Truncate.headOnly")(function* (
  lines: string[],
  maxLines: number,
  maxBytes: number,
  totalBytes: number,
  agent: Agent.Info | undefined,
) {
  const out: string[] = []
  let bytes = 0
  let hitBytes = false
  for (let i = 0; i < lines.length && out.length < maxLines; i++) {
    const size = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0)
    if (bytes + size > maxBytes) {
      hitBytes = true
      break
    }
    out.push(lines[i])
    bytes += size
  }
  const removed = hitBytes ? totalBytes - bytes : lines.length - out.length
  const unit = hitBytes ? "bytes" : "lines"
  const preview = out.join("\n")
  const file = yield* write(lines.join("\n"))
  const hint = hasTaskTool(agent)
    ? `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse the Task tool to have explore agent process this file with Grep and Read (with offset/limit). Do NOT read the full file yourself - delegate to save context.`
    : `The tool call succeeded but the output was truncated. Full output saved to: ${file}\nUse Grep to search the full content or Read with offset/limit to view specific sections.`
  return {
    content: `${preview}\n\n...${removed} ${unit} truncated...\n\n${hint}`,
    truncated: true,
    outputPath: file,
  } as const
})
```

Then in the head branch of `output`, replace the inline logic with a call to `headOnly(lines, maxLines, maxBytes, totalBytes, agent)` and return its result.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/opencode && bun test tool/truncation.test.ts -t "headtail"`

Expected: All five new headtail tests PASS. All existing tests (head, tail, etc.) still PASS.

Also run the full file: `cd packages/opencode && bun test tool/truncation.test.ts`

Expected: All tests pass. The existing "truncates from head by default" test still passes because the default is still `"head"` in this task.

- [ ] **Step 6: Typecheck**

Run from repo root: `bun typecheck`

Expected: PASS. No downstream types break because we only *added* an enum value.

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/tool/truncate.ts packages/opencode/test/tool/truncation.test.ts
git commit -m "feat(tool): headtail direction on Truncate.output - opt-in via direction=headtail"
git push origin dev
```

---

### Task 2: Change `Truncate` default direction to `"headtail"` and rewrite the framework hint text

**Files:**
- Modify: `packages/opencode/src/tool/truncate.ts` (direction fallback at line 89)
- Modify: `packages/opencode/test/tool/truncation.test.ts` (update the existing "truncates from head by default" test)

**Interfaces:**
- Consumes: `Truncate.Options.direction` (existing) with `"headtail"` variant added by Task 1
- Produces: `Truncate.output(text, {})` now returns headtail-shaped result when truncation fires

- [ ] **Step 1: Write the failing test — default direction is headtail**

Update the existing test at `packages/opencode/test/tool/truncation.test.ts` around line 75. Rename `"truncates from head by default"` and rewrite:

```ts
it.live("truncates from headtail by default", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n")
    const result = yield* svc.output(lines, { maxLines: 4 })

    expect(result.truncated).toBe(true)
    expect(result.content).toContain("line0")
    expect(result.content).toContain("line1")
    expect(result.content).toContain("line8")
    expect(result.content).toContain("line9")
    expect(result.content).toMatch(/\.{3}\[\d+ lines omitted, \d+ bytes removed\]\.{3}/)
  }),
)
```

Also add a test confirming the new hint text is emitted:

```ts
it.live("headtail hint mentions middle omission", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
    const result = yield* svc.output(lines, { maxLines: 10 })

    expect(result.truncated).toBe(true)
    expect(result.content).toContain("truncated in the middle")
    expect(result.content).toContain("lines omitted")
  }),
)
```

- [ ] **Step 2: Run tests to verify the default-direction test fails**

Run: `cd packages/opencode && bun test tool/truncation.test.ts -t "default"`

Expected: FAIL — output has `...90 lines truncated...` shape (head-only), not the headtail marker with `line8`/`line9` present.

- [ ] **Step 3: Change the default direction**

In `packages/opencode/src/tool/truncate.ts`, change line 89 of the `output` function:

```ts
const direction = options.direction ?? "headtail"
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/opencode && bun test tool/truncation.test.ts`

Expected: All tests PASS. Any test that previously asserted head-only output shape via the default `{}` options may fail — inspect and update them to either explicitly request `direction: "head"` (preserving the intended head-only assertion) or accept the new headtail shape.

Specifically, the existing test at line 53 (`"truncates by line count"`) asserts `expect(result.content).toContain("...90 lines truncated...")`. Under the new default this becomes `...[N lines omitted, M bytes removed]...`. Update it:

```ts
it.live("truncates by line count", () =>
  Effect.gen(function* () {
    const svc = yield* Truncate.Service
    const lines = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n")
    const result = yield* svc.output(lines, { maxLines: 10 })

    expect(result.truncated).toBe(true)
    expect(result.content).toMatch(/\.{3}\[\d+ lines omitted, \d+ bytes removed\]\.{3}/)
  }),
)
```

The existing "truncates large json file by bytes" test at line 29 asserts `expect(result.content).toContain("truncated...")` which is a substring match — both `"truncated..."` and `"truncated in the middle..."` satisfy it, so that test is unaffected.

- [ ] **Step 5: Run every truncation-adjacent test that might have taken the default direction**

Run: `cd packages/opencode && bun test tool/`

Expected: All tests pass. If any test in `read.test.ts`, `shell.test.ts`, `grep.test.ts`, `glob.test.ts`, `webfetch.test.ts`, `write.test.ts`, `edit.test.ts`, or others asserts on truncation output shape via the framework default, update it to either pin the direction explicitly or accept the new marker.

- [ ] **Step 6: Typecheck**

Run from repo root: `bun typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/opencode/src/tool/truncate.ts packages/opencode/test/tool/
git commit -m "feat(tool): flip Truncate default to headtail - the framework win from the compression design"
git push origin dev
```

---

### Task 3: Drop `read.ts` `MAX_BYTES` to 8 KB and implement wrapper-preserving headtail

**Files:**
- Modify: `packages/opencode/src/tool/read.ts` (constant at line 16, `lines` function at lines 137-180, output-emission block at lines 338-351)
- Modify: `packages/opencode/test/tool/read.test.ts` (add wrapper-preservation and edge-case tests)

**Interfaces:**
- Consumes: `read.ts`'s existing `<path>/<type>/<content>` wrapper shape, `file.raw` line array from `lines()`, `MAX_LINE_LENGTH` and `MAX_LINE_SUFFIX` constants
- Produces: `read` tool output whose `<content>` block contains a head half + omission marker + tail half when the file's byte payload exceeds 8 KB. Wrapper tags and `<system-reminder>` suffix behavior preserved.

- [ ] **Step 1: Write failing tests for the new read behavior**

Add to `packages/opencode/test/tool/read.test.ts`. First check the file's existing pattern for how it constructs test files and calls `exec` (from `lines 62-80` of the read.test.ts snippet shown earlier). Then add:

```ts
it.live("read passes through small files unchanged", () =>
  tmpdirScoped((dir) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const filepath = path.join(dir, "small.txt")
      const content = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n")
      yield* fs.writeFileString(filepath, content)

      const result = yield* exec(dir, { filePath: filepath })

      expect(result.output).toContain("<path>")
      expect(result.output).toContain("<content>")
      expect(result.output).toContain("</content>")
      expect(result.output).toContain("1: line0")
      expect(result.output).toContain("20: line19")
      expect(result.output).toContain("(End of file - total 20 lines)")
      expect(result.output).not.toContain("[lines omitted")
      expect(result.metadata.truncated).toBe(false)
    }),
  ),
)

it.live("read produces wrapper-preserved headtail on large files", () =>
  tmpdirScoped((dir) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const filepath = path.join(dir, "large.txt")
      // Each line ~50 bytes; 500 lines ~25 KB. Above the new 8 KB cap.
      const content = Array.from({ length: 500 }, (_, i) => `this is line ${i} with padding text abcdefg`).join("\n")
      yield* fs.writeFileString(filepath, content)

      const result = yield* exec(dir, { filePath: filepath })

      // Wrapper intact
      expect(result.output).toMatch(/<path>[^<]+<\/path>/)
      expect(result.output).toContain("<type>file</type>")
      expect(result.output).toContain("<content>")
      expect(result.output).toContain("</content>")

      // Head numbered lines present
      expect(result.output).toContain("1: this is line 0 with padding text abcdefg")

      // Tail numbered lines present (last line number is 499 since 0-indexed input)
      expect(result.output).toContain("500: this is line 499 with padding text abcdefg")

      // Middle marker
      expect(result.output).toMatch(/\.{3}\[\d+ lines omitted, \d+ bytes removed\]\.{3}/)

      // EOF marker mentions middle-omitted resumption
      expect(result.output).toContain("Middle omitted; use offset=")
      expect(result.metadata.truncated).toBe(true)
    }),
  ),
)

it.live("read preserves LSP system-reminder block after </content>", () =>
  // If the LSP layer surfaces loaded-file reminders, they must appear after </content>
  // even when headtail truncation fires. Use a large file with a symbol LSP would touch.
  tmpdirScoped((dir) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const filepath = path.join(dir, "large.ts")
      const content = Array.from({ length: 500 }, (_, i) => `export const line${i} = ${i};`).join("\n")
      yield* fs.writeFileString(filepath, content)

      const result = yield* exec(dir, { filePath: filepath })

      // If loaded[] populated, reminder appears AFTER </content> (may be empty on this fixture)
      const contentClose = result.output.lastIndexOf("</content>")
      const reminderOpen = result.output.indexOf("<system-reminder>")
      if (reminderOpen !== -1) {
        expect(reminderOpen).toBeGreaterThan(contentClose)
      }
    }),
  ),
)

it.live("read handles single-long-line files without breaking", () =>
  tmpdirScoped((dir) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const filepath = path.join(dir, "oneline.txt")
      // 60 KB on a single line — above byte cap, only 1 line
      const content = "a".repeat(60 * 1024)
      yield* fs.writeFileString(filepath, content)

      const result = yield* exec(dir, { filePath: filepath })

      expect(result.output).toContain("<content>")
      expect(result.output).toContain("</content>")
      // Line 1 present in some truncated form (MAX_LINE_LENGTH=2000 already truncates the line)
      expect(result.output).toMatch(/1: a+/)
      // No middle-omitted marker: with 1 line there is no middle
      expect(result.output).not.toMatch(/\.{3}\[\d+ lines omitted/)
    }),
  ),
)

it.live("read handles empty file", () =>
  tmpdirScoped((dir) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const filepath = path.join(dir, "empty.txt")
      yield* fs.writeFileString(filepath, "")

      const result = yield* exec(dir, { filePath: filepath })

      expect(result.output).toContain("(End of file - total 0 lines)")
      expect(result.output).not.toContain("[lines omitted")
      expect(result.metadata.truncated).toBe(false)
    }),
  ),
)

it.live("read respects offset with headtail applied within window", () =>
  tmpdirScoped((dir) =>
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const filepath = path.join(dir, "offset.txt")
      const content = Array.from({ length: 1000 }, (_, i) => `line ${i} with additional padding text zyxwvu`).join("\n")
      yield* fs.writeFileString(filepath, content)

      // Read from line 200, allow up to 400 lines; but byte cap at 8 KB will fire
      const result = yield* exec(dir, { filePath: filepath, offset: 200, limit: 400 })

      // Head numbering starts at 200
      expect(result.output).toContain("200: line 199")
      // Tail numbering ends within the requested window (200+400-1 = 599 max, or file end)
      expect(result.output).toMatch(/59\d: line 59\d/)
      expect(result.output).toMatch(/\.{3}\[\d+ lines omitted, \d+ bytes removed\]\.{3}/)
    }),
  ),
)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/opencode && bun test tool/read.test.ts -t "headtail|wrapper|empty|single-long|offset with headtail"`

Expected: FAIL. `MAX_BYTES` is still 50 KB so most tests won't fire truncation at the right point; wrapper-preservation isn't implemented.

- [ ] **Step 3: Drop `MAX_BYTES` in `read.ts`**

In `packages/opencode/src/tool/read.ts` at lines 16-17, change:

```ts
const MAX_BYTES = 8 * 1024
const MAX_BYTES_LABEL = `${MAX_BYTES / 1024} KB`
```

- [ ] **Step 4: Extend `lines()` for ring-buffer tail collection**

Replace the `lines` function in `packages/opencode/src/tool/read.ts` (currently at line 137) with:

```ts
const lines = Effect.fn("ReadTool.lines")(function* (filepath: string, opts: { limit: number; offset: number }) {
  const start = opts.offset - 1
  const halfLines = Math.floor(opts.limit / 2)
  const headLimit = halfLines
  const tailLimit = opts.limit - halfLines // ties to tail
  const halfBytes = Math.floor(MAX_BYTES / 2)

  const head: string[] = []
  const tail: string[] = []
  const flags = {
    headBytes: 0,
    tailBytes: 0,
    middleBytes: 0,
    count: 0,
    truncated: false,
    done: false,
    headComplete: false,
  }
  const headFirstNumber = opts.offset
  let headLastNumber = opts.offset - 1

  const decoder = new TextDecoder("utf-8")
  yield* fs.stream(filepath).pipe(
    Stream.map((bytes) => decoder.decode(bytes, { stream: true })),
    Stream.splitLines,
    Stream.runForEach((text) =>
      Effect.gen(function* () {
        if (flags.done) return yield* new ReadStop()
        flags.count += 1
        if (flags.count <= start) return

        const line = text.length > MAX_LINE_LENGTH ? text.substring(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX : text
        const lineByteSize = Buffer.byteLength(line, "utf-8")

        // Head phase
        if (!flags.headComplete && head.length < headLimit) {
          const size = lineByteSize + (head.length > 0 ? 1 : 0)
          if (flags.headBytes + size <= halfBytes) {
            head.push(line)
            flags.headBytes += size
            headLastNumber = flags.count
            return
          }
          // Head hit its budget mid-file
          flags.headComplete = true
        }

        // If we exhausted the requested window (offset+limit), stop
        if (flags.count > start + opts.limit) {
          flags.done = true
          return yield* new ReadStop()
        }

        // Tail phase: ring buffer with a middle-bytes accumulator
        flags.truncated = true
        const size = lineByteSize + (tail.length > 0 ? 1 : 0)
        tail.push(line)
        flags.tailBytes += size
        while (tail.length > tailLimit || flags.tailBytes > halfBytes) {
          const removed = tail.shift()!
          const removedSize = Buffer.byteLength(removed, "utf-8") + (tail.length > 0 ? 1 : 0)
          flags.tailBytes -= removedSize
          // Evicted from the tail ring → it becomes middle content
          flags.middleBytes += removedSize
        }
      }),
    ),
    Effect.catchTag("ReadStop", () => Effect.void),
  )

  return {
    raw: head,
    tail,
    count: flags.count,
    middleBytes: flags.middleBytes,
    truncated: flags.truncated,
    offset: opts.offset,
    headLastNumber,
    headFirstNumber,
  }
})
```

Note: the return shape is expanded — the caller (in `run`) needs to know about the tail array, line-number bookends, and the middle-bytes accumulator (bytes read past the head cap that were never in the final tail).

- [ ] **Step 5: Emit wrapper-preserved headtail output in `run()`**

In `packages/opencode/src/tool/read.ts`, replace the output-emission block at lines 338-351 with:

```ts
const file = yield* lines(filepath, { limit: params.limit ?? DEFAULT_READ_LIMIT, offset: params.offset || 1 })
if (file.count < file.offset && !(file.count === 0 && file.offset === 1)) {
  return yield* Effect.fail(
    new Error(`Offset ${file.offset} is out of range for this file (${file.count} lines)`),
  )
}

let output = [`<path>${filepath}</path>`, `<type>file</type>`, "<content>\n"].join("\n")

const headLast = file.headLastNumber
const tailFirst = file.count - file.tail.length + 1
const canHeadtail = file.truncated && file.raw.length > 0 && file.tail.length > 0 && tailFirst > headLast + 1

if (canHeadtail) {
  // Headtail shape: head + omission marker + tail
  const headBlock = file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n")
  const tailBlock = file.tail.map((line, i) => `${tailFirst + i}: ${line}`).join("\n")
  const removedLines = file.count - file.raw.length - file.tail.length
  output += `${headBlock}\n\n...[${removedLines} lines omitted, ${file.middleBytes} bytes removed]...\n\n${tailBlock}`
  output += `\n\n(End of file - total ${file.count} lines. Middle omitted; use offset=${headLast + 1} to inspect.)`
} else if (file.truncated && file.raw.length === 0 && file.tail.length > 0) {
  // Head was empty (e.g. single-long-line file). Show just the tail (or single line) with no middle marker.
  const tailBlock = file.tail.map((line, i) => `${tailFirst + i}: ${line}`).join("\n")
  output += tailBlock
  output += `\n\n(End of file - total ${file.count} lines. Head omitted due to size; use offset=1 to re-read from the beginning.)`
} else if (file.truncated) {
  // Overlap or empty tail: fall back to head-only shape (matches pre-change behavior)
  output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n")
  const next = file.offset + file.raw.length
  output += `\n\n(Output capped at ${MAX_BYTES_LABEL}. Showing lines ${file.offset}-${next - 1}. Use offset=${next} to continue.)`
} else {
  // No truncation — full file fits within budget
  output += file.raw.map((line, i) => `${i + file.offset}: ${line}`).join("\n")
  output += `\n\n(End of file - total ${file.count} lines)`
}
output += "\n</content>"

yield* warm(filepath)

if (loaded.length > 0) {
  output += `\n\n<system-reminder>\n${loaded.map((item) => item.content).join("\n\n")}\n</system-reminder>`
}

return {
  title,
  output,
  metadata: {
    preview: file.raw.slice(0, 20).join("\n"),
    truncated: file.truncated,
    loaded: loaded.map((item) => item.filepath),
    display: {
      type: "file" as const,
      path: filepath,
      text: file.raw.concat(file.tail).join("\n"),
      lineStart: file.offset,
      lineEnd: file.count,
      totalLines: file.count,
      truncated: file.truncated,
    },
  },
}
```

Note the byte-count estimate limitation: the design's marker text is `[N lines omitted, N bytes removed]` in Truncate, but in `read.ts` we do not accumulate the exact byte count of the omitted middle without a second stream pass. For read specifically, report lines only: `[N lines omitted]`. The Truncate variant keeps both counts because it operates on already-loaded text.

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/opencode && bun test tool/read.test.ts`

Expected: all new tests PASS. Any existing tests that were passing under the old 50 KB cap and old head-only truncation shape may now fail — inspect and update them to reflect either the new smaller cap or the new headtail shape as appropriate.

- [ ] **Step 7: Typecheck**

Run from repo root: `bun typecheck`

Expected: PASS.

- [ ] **Step 8: End-to-end verification against the corpus example**

Manually verify against a real 55 KB read (the one in `build-progress.md`). Follow the `verify` skill's ConPTY harness recipe:

```bash
cd /c/Exodus/Projects/VanGio-AI\ Agent/vangio-v1
# Start a scratch session
vangio  # inside a scratch dir, not this repo
# Ask the model to Read build-progress.md and quote the last three lines
```

Expected: the returned `part.state.output` in the session db has:
- `<path>` and `</path>` tags intact
- `<content>` and `</content>` tags intact
- Numbered head lines starting at 1
- `...[N lines omitted]...` marker
- Numbered tail lines ending at the file's total line count
- `(End of file - total N lines. Middle omitted; use offset=<K> to inspect.)` closing marker

If wrapper tags are broken or line numbering is wrong, do NOT commit — return to step 5.

- [ ] **Step 9: Commit**

```bash
git add packages/opencode/src/tool/read.ts packages/opencode/test/tool/read.test.ts
git commit -m "feat(tool): read drops MAX_BYTES to 8KB and truncates via headtail preserving <content> wrapper"
git push origin dev
```

---

## Post-implementation

After all three tasks land:

1. **Measure on real sessions.** Run 2-3 typical VanGio sessions (a coding task, a docs edit, a fallback-exercise) and compare `SUM(LENGTH(state.output)) GROUP BY session_id` in `opencode-local.db` before and after. Expect ~50-70 KB less per turn on sessions with multiple large `read` calls, per the spec's estimates.

2. **Update `docs/fork/build-progress.md`** with a new RESUME block noting the design landed and the actual measurements. Include a table of before/after per session. Include the specific commit SHAs.

3. **Update `docs/fork/errors.md`** if any test that was expected to pass at step 4 of Task 3 actually failed and required a fix — capture the surprise, the root cause, and the prevention rule.

4. **Consider follow-up**: if the 8 KB threshold proves too aggressive for a workflow (e.g., reading a 6 KB config file feels fine but a 10 KB source file gets awkwardly cut), expose `read.max_bytes` as a config field in a follow-up commit. Don't do it preemptively.
