# Mobile Session Control — Laptop Setup Guide

> Plan: `docs/superpowers/plans/2026-07-17-mobile-session-control.md`
> Spec: `docs/superpowers/specs/2026-07-17-mobile-session-control-design.md`
> Machine: Windows 11 Pro, repo at `C:\Exodus\Projects\VanGio-AI Agent\vangio-v1`
> Purpose: reproducible record of every setup step, so this survives an OS reinstall.

## Done 2026-07-19 (automated from Claude Code session)

### 1. Notifier plugin bundled into the global plugins dir

```bash
mkdir -p ~/.config/vangio/plugins
bun build packages/notifier/src/plugin.ts --target bun --outfile ~/.config/vangio/plugins/vangio-notifier.js
```

Proof: `Bundled 3 modules`, 5.63 KB output, `grep 'from "@opencode'` finds nothing (fully
self-contained), tail shows `export { plugin_default as default, createNotifierPlugin }`.

**Deviation from plan:** target dir is `~/.config/vangio/plugins/`, NOT the plan's
`~/.config/opencode/plugins/` — sessions 8–9 rebranded the global config dir
(`packages/core/src/global.ts` sets `app = "vangio"`). The config loader auto-discovers
`{plugin,plugins}/*.{ts,js}` in each config dir (`packages/opencode/src/config/plugin.ts:21`).

**Re-bundle after any notifier change** — the plugins dir holds a snapshot, not a live link:

```bash
bun build packages/notifier/src/plugin.ts --target bun --outfile ~/.config/vangio/plugins/vangio-notifier.js
```

### 2. Secret ntfy topic generated + persisted (User env var)

```powershell
$chars = [char[]]((48..57)+(97..122))
$topic = "vangio-" + (-join (1..24 | ForEach-Object { $chars | Get-Random }))
[System.Environment]::SetEnvironmentVariable("VANGIO_NTFY_TOPIC", $topic, "User")
```

The topic value is the only secret in this system — it is deliberately NOT written in this
file. Recover it any time with:

```powershell
[System.Environment]::GetEnvironmentVariable("VANGIO_NTFY_TOPIC", "User")
```

Note (deviation): the plan's one-liner used `Get-Random -Count 24` over the charset, which
samples WITHOUT replacement; the loop above samples with replacement (~124 bits of entropy).

Restart any terminal that will run `vangio serve` so it inherits the variable.

### 3. Pipeline proven with a manual ping

```bash
curl -d "hello from the laptop" https://ntfy.sh/$TOPIC
```

Proof: HTTP 200 with JSON envelope (`"event":"message"`). Phone-side delivery is checked in
the phone section below.

### 4. Notifier verified end-to-end against a live session ✅

Driven through a real long-lived server, not a mock:

```bash
bun run --cwd packages/opencode src/index.ts serve --port 4096      # with VANGIO_NTFY_TOPIC set
curl -X POST "http://127.0.0.1:4096/session?directory=<url-encoded-repo-path>" -d '{}'
curl -X POST "http://127.0.0.1:4096/session/<id>/message?directory=..." \
  -d '{"parts":[{"type":"text","text":"say pong"}]}'
```

Proof: the topic received `{"title":"Done - vangio-v1","message":"Session finished after 8 s",`
`"priority":3,"tags":["white_check_mark"]}` — matching the session's real 8 s busy→idle span.

**Important: use `vangio serve`, not `vangio run`.** A short-lived `vangio run` exits before the
ntfy POST completes (~4 s from this machine), so its notifications are silently lost. This is
expected and documented in `docs/fork/errors.md` (2026-07-19) — mobile control runs against the
long-lived server anyway, which is the verified path.

Note: ntfy.sh polls from this network are slow and intermittently time out (`curl` exit 28/35).
Retry a poll two or three times before concluding a notification was not delivered.

### 5. Power settings — verified, nothing to change

- Lid close action: already `Do nothing` on both AC and DC. The setting is HIDDEN by default
  on this machine; it was unhidden to read it via
  `powercfg /attributes SUB_BUTTONS LIDACTION -ATTRIB_HIDE` then
  `powercfg /query SCHEME_CURRENT SUB_BUTTONS LIDACTION`.
- Sleep on AC: `standby-timeout-ac` already `0` (never). On battery (DC) it is 10 min — fine,
  the spec assumes plugged in.

If a future machine needs the plan's original commands:

```powershell
powercfg /setacvalueindex SCHEME_CURRENT SUB_BUTTONS LIDACTION 0
powercfg /setactive SCHEME_CURRENT
powercfg /change standby-timeout-ac 0
```

Physical proof (lid closed one minute while `ping -t 8.8.8.8` runs, no gap on reopen) is
pending — folded into the acceptance ritual.

### 6. Tailscale installed (login pending — needs a human + browser)

```powershell
winget install tailscale.tailscale --accept-package-agreements --accept-source-agreements --silent
```

Proof: `Successfully installed` (v1.98.9).

## Remaining steps (in order)

### 7. Tailscale login (interactive)

The `tailscale` CLI is not on PATH after a winget install — use the full path (or add
`C:\Program Files\Tailscale` to PATH once):

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" up       # opens browser login; use your Tailscale account
& "C:\Program Files\Tailscale\tailscale.exe" status   # note the DNS name, e.g. mymachine.tail1234.ts.net
[System.Environment]::SetEnvironmentVariable("VANGIO_CLICK_BASE_URL", "https://<machine-dns-name>", "User")
```

`VANGIO_CLICK_BASE_URL` makes each notification tap-through open the web app on the right
session. Without it, buzzes still arrive — just without deep links.

### 8. Start the VanGio server (verified flags, 2026-07-19)

```bash
bun run --cwd packages/opencode src/index.ts serve --port 4096
```

`vangio serve` options confirmed: `--port` (default 0 = random), `--hostname` (default
127.0.0.1 — keep it), `--cors <origin>` (array; needed in step 9 if the browser console
shows CORS errors). Expected: boot log free of `[vangio-notifier]` errors.

### 9. Build + serve the web app — ✅ already verified 2026-07-19

```bash
bun run --cwd packages/app build
bun run --cwd packages/app serve -- --host 127.0.0.1 --port 4173
```

(`build`/`serve` = `vite build` / `vite preview`, verified in `packages/app/package.json`.)
Both were run on this machine: the build completed in 1m 30s (chunk-size warnings only, no
errors) and `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4173` returned `200`.
The `dist/` output is already on disk, so this step only needs re-running after code changes.

### 10. Publish both onto the tailnet over HTTPS

Syntax confirmed against the installed Tailscale 1.98.9 (`--bg` and `--https <port>` both
exist; `--https` is the default mode). On Windows the CLI is not on PATH by default — use the
full path or add it:

```bash
"/c/Program Files/Tailscale/tailscale.exe" serve --bg --https=443  http://127.0.0.1:4173   # web app
"/c/Program Files/Tailscale/tailscale.exe" serve --bg --https=8443 http://127.0.0.1:4096   # VanGio API
```

`tailscale serve status` should list both mounts. From the laptop's own browser,
`https://<machine-dns-name>` must load the web app. In the web app's server-selection
dialog, add `https://<machine-dns-name>:8443`; if the browser console shows CORS errors,
restart step 8's serve with `--cors https://<machine-dns-name>`, and record that here.

### 11. Phone setup

1. Install Tailscale on the phone (same account, toggle on). Proof: phone browser opens
   `https://<machine-dns-name>` and the web app renders.
2. Install ntfy from the Play Store, subscribe to the topic from step 2. Proof: re-run the
   step 3 curl — the phone buzzes within seconds.
3. In Chrome on the web app: Add to Home Screen. Proof: opens full-screen from its own icon.
4. Mobile UX pass (spec §9.4): open a session, read the feed, send a reply, trigger + answer
   a permission via the permission dock. Anything unusable → `docs/fork/errors.md`
   (approve/deny broken on mobile = blocking defect).

### 12. THE ACCEPTANCE RITUAL (spec §10)

1. At the desk: start a session task that runs > 1 min and hits a permission ask.
2. Close the lid (or walk away). Leave the room.
3. Phone buzzes "Needs approval - <project>" (max priority) → tap → app opens on the session
   → approve.
4. Wait for the "Done - <project>" buzz.
5. Return and verify the session output is correct and the machine never slept.

Record date + result here and in `docs/fork/build-progress.md`. Passing = v3 milestone shipped.
