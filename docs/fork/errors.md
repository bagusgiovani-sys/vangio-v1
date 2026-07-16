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

## Known-Risk Watchlist (from planning — not errors yet, but expect these)
- **GLM phone verification** may reject your number at open.bigmodel.cn → fallback: z.ai international portal
- **Provider baseURLs drift** — Qwen/Kimi endpoints change; a wrong URL = silent failure. Always verify at setup
- **Free-model tool-calling quirks** — free/open models (Qwen, possibly GLM) may not stop cleanly after a tool call (documented OpenCode issue). Not a crash, an expected rough edge
- **GLM free vs paid endpoint mixup** — `/api/paas/v4` (free) vs `/api/coding/paas/v4` (paid Coding Plan) are NOT interchangeable
- **Kimi** requires min $1 top-up before the API works at all — not truly free
- **Local Ollama** on this hardware (16GB RAM, integrated graphics) will be slow — expected, not a bug

## Log

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
