# CONFIG.md — Data Model (adapted from scaffold-schema for a CLI tool)
> Project: VanGio (tentative) | Fork base: OpenCode (sst/opencode) | Generated 2026-07-05
> Note: No database/multi-tenancy applies here — VanGio is a single-user local CLI tool. This document replaces the SQL schema step with OpenCode's actual, verified config system.

---

## How OpenCode's config system works (verified, not invented)

- **`opencode.json`** — main settings file. Global: `~/.config/opencode/opencode.json`. Project-level: `opencode.json` in repo root (overrides global). Supports JSON/JSONC.
- **`auth.json`** (`~/.local/share/opencode/auth.json`) — API keys are stored here automatically via `/connect` or `opencode auth login`. Kept separate from settings — do not hand-roll a competing credential store.
- **Provider blocks** — each provider (GLM, Qwen, Kimi, Ollama) is an entry under `provider.<id>` with `npm` (SDK adapter), `options.baseURL`, `options.apiKey` (supports `{env:VAR}` substitution), and a `models` map.
- **Config precedence:** Remote org config → Global config → Project config → Custom config dir (later overrides earlier; non-conflicting keys merge).

---

## VanGio's v1 `opencode.json` (concrete config)
> UPDATED 2026-07-16: default provider switched from GLM-4.7-Flash to DeepSeek V4 Flash Free via OpenCode Zen. GLM kept as configured fallback. **UNVERIFIED: whether Zen's gateway actually avoids the concurrency/retry-loop bug that broke GLM — confirm with a real multi-tool-call session before relying on this.**
> DEPLOYED 2026-07-16 (updated 07-17): the live `~/.config/opencode/opencode.json` now matches this design, minus Qwen/Kimi/Ollama (add when needed), plus an `"agent"` block. CONSOLIDATED 07-17: the Tab cycle got crowded, so the roster is now ONE primary — `gryphon` (`opencode/deepseek-v4-flash-free`, ~79 SWE-V, full permissions, orchestrator persona) — with `warrior` (`opencode/mimo-v2.5-free`, 78.6 SWE-V, implementer) and `scout` (`opencode/north-mini-code-free`, lookups, edit-DENIED — mandatory, it attempted an unrequested edit in testing, see errors.md 2026-07-17) demoted to `mode: "subagent"`: out of the Tab cycle, invokable as `@warrior` / `@scout` or delegated to by Gryphon via the task tool. Tab now cycles Build → Gryphon → Plan (alphabetical — verified live 2026-07-17). Lookup hierarchy: codegraph CLI first (instant, zero tokens), scout second, gryphon never for trivia.
> FORK FEATURE (2026-07-17): agent descriptions now render as an endless right-to-left marquee in the prompt status row — new `packages/tui/src/component/marquee.tsx` wired into `component/prompt/index.tsx` (150ms tick, 28-char window, wraps around). Gryphon's `description` field is what scrolls: it names the three heads and their models. Do NOT put the warrior on GLM: its 1-concurrent-request retry-loop bug fires under agentic multi-tool-call load, which is the warrior's entire job. GLM remains a manual fallback profile only. Both agents verified working — currently even WITHOUT a Zen key (anonymous free tier; expect to need `/connect` eventually). Zen free-tier limits are unpublished but REAL (hard "Free usage exceeded" wall exists) — token discipline matters.
> THEME NOTE: the active theme name goes in `~/.config/opencode/tui.json` (`"theme": "neon-matrix"`), NOT in opencode.json. Theme files live in `~/.config/opencode/themes/*.json` (or project `.opencode/themes/`). VanGio's theme: `neon-matrix` (neon green #39FF14 on near-black #050805).

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode/deepseek-v4-flash-free",
  "small_model": "opencode/deepseek-v4-flash-free",
  "provider": {
    "opencode": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "OpenCode Zen",
      "options": { "baseURL": "https://opencode.ai/zen/v1", "apiKey": "{env:OPENCODE_ZEN_API_KEY}" },
      "models": { "deepseek-v4-flash-free": { "name": "DeepSeek V4 Flash (free, temporary promo)" } }
    },
    "zhipu": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Zhipu GLM (free tier, fallback)",
      "options": { "baseURL": "https://api.z.ai/api/paas/v4", "apiKey": "{env:ZHIPU_API_KEY}" },
      "models": { "glm-4.7-flash": { "name": "GLM-4.7-Flash (free, 1-concurrent-request limit)" } }
    },
    "qwen": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Qwen (Alibaba)",
      "options": { "baseURL": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", "apiKey": "{env:QWEN_API_KEY}" },
      "models": { "qwen3-coder-plus": { "name": "Qwen3 Coder Plus" } }
    },
    "kimi": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Kimi (Moonshot AI)",
      "options": { "baseURL": "https://api.moonshot.ai/v1", "apiKey": "{env:KIMI_API_KEY}" },
      "models": { "kimi-k2.7": { "name": "Kimi K2.7" } }
    },
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": { "baseURL": "http://localhost:11434/v1" },
      "models": { "qwen2.5-coder:7b": { "name": "Qwen2.5 Coder 7B (local)" } }
    }
  },
  "permission": { "edit": "allow", "bash": { "*": "ask", "rm -rf *": "deny" }, "webfetch": "allow" },
  "autoupdate": true,
  "snapshot": true
}
```

**⚠️ Flagged, not glossed over:** the exact `baseURL` values above are best-current-info and must be verified against each provider's live docs at actual setup time — a wrong endpoint URL is a functional bug, not cosmetic.

---

## Premium (Paid) Provider

Anthropic provider added for the `premium-gryphon` agent (dormant until `ANTHROPIC_API_KEY` is set):

```jsonc
"anthropic": {
  "npm": "@ai-sdk/anthropic",
  "name": "Anthropic (paid, premium)",
  "options": { "apiKey": "{env:ANTHROPIC_API_KEY}" },
  "models": {
    "claude-sonnet-4-20250514": { "name": "Claude Sonnet 4 (best for complex reasoning)" }
  }
}
```

---

## Plugin Configuration

Plugins are registered via the `"plugin"` array in `opencode.json` or `opencode.jsonc`. Each entry is an npm package name. OpenCode auto-loads them from the global or project scope:

```jsonc
{
  "plugin": [
    "@sentropic/graphify",
    "opencode-mem"
  ]
}
```

Install via CLI: `opencode plugin <package-name>` (preferred) or add to config manually and run `npm install -g <package>`.

---

## Agent Configuration

Agents are defined under the `"agent"` key. Gryphon is the primary orchestrator; `premium-gryphon` is a dormant paid upgrade; `warrior` and `scout` are subagents (out of the Tab cycle, invokable via `@name`):

```jsonc
"agent": {
  "gryphon": {
    "mode": "primary",
    "model": "opencode/deepseek-v4-flash-free",
    "color": "primary",
    "prompt": "You are Gryphon... (see live config for full prompt)"
  },
  "premium-gryphon": {
    "mode": "primary",
    "model": "anthropic/claude-sonnet-4-20250514",
    "color": "warning",
    "prompt": "You are Gryphon Premium..."
  },
  "warrior": {
    "mode": "subagent",
    "model": "opencode/mimo-v2.5-free",
    "color": "success",
    "permission": { "edit": "allow" }
  },
  "scout": {
    "mode": "subagent",
    "model": "opencode/north-mini-code-free",
    "color": "info",
    "permission": { "edit": "deny" }
  }
}
```

---

## MCP Server Configuration

OpenCode supports two MCP server types. Config lives in the `"mcp"` block (project-level `opencode.jsonc`). None are installed yet:

```jsonc
// Local MCP server (spawned as a child process)
"my-local-server": {
  "type": "local",
  "command": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "/path/to/workspace"]
}

// Remote MCP server (HTTP/SSE connection)
"my-remote-server": {
  "type": "remote",
  "url": "https://mcp.example.com/sse",
  "headers": { "Authorization": "Bearer {env:MCP_TOKEN}" }
}
```

---

## Security note (credentials)
API keys are never hardcoded in `opencode.json`. Two supported paths:
1. `opencode auth login` → writes to `~/.local/share/opencode/auth.json` (recommended, avoids key-shape mistakes)
2. `{env:VARNAME}` substitution in config, reading from shell environment variables

---

## Deferred / Not Applicable
- SQL schema, RLS policies, multi-tenancy — not applicable, single local user, no hosted database
- Full HTTP API surface — OpenCode has an internal server (`opencode serve`) with session/project endpoints, but this isn't needed for VanGio v1's CLI-only usage. Revisit only if a future web UI wraps VanGio.
