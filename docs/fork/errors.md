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
(No entries yet)
