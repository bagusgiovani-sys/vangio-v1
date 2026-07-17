# Mobile Session Control — Design Spec

> Date: 2026-07-17
> Status: Approved design, pre-implementation
> Owner: Bagus Giovani
> Approach: A ("reuse web app + notifier") now, B ("VanGio Pocket" custom PWA) as planned v2

## 1. Problem

People running AI coding agents leave laptops open and running because closing the lid (or walking away) means losing sight of the session — the agent may finish, error, or sit blocked on a permission prompt for hours. The goal: leave the laptop **lid closed and working**, watch the session from a phone, get buzzed when it needs a human, and reply/approve from the phone.

## 2. Decisions made during brainstorm

| Question | Decision |
|---|---|
| V1 audience | Just the owner (personal tool). Productize later, maybe. |
| Reach | Anywhere, via Tailscale (free VPN app on laptop + phone). No relay servers built or hosted. |
| Phone | Android. |
| Control scope | Watch live feed + reply to running sessions + approve/deny permission prompts. NOT starting new sessions or switching projects from the phone (v2). |
| Approach | A: reuse VanGio's existing web app (`packages/app`) as the phone client + build a small laptop-side notifier. B (custom phone-first PWA) is planned v2; A's notifier and any web-app fixes carry over unchanged. |

## 3. Reality check (researched 2026-07-17)

The pain is validated — and the space is already served, so this is a **first-party VanGio capability**, not a standalone product bet:

- Anthropic shipped [Remote Control](https://code.claude.com/docs/en/remote-control) for Claude Code (Feb 2026, research preview, Pro/Max): `/remote-control` + QR code → continue a local session from the Claude mobile app, including permission approvals.
- The opencode ecosystem has community clients that would already connect to a VanGio server: [opencode-remote-android](https://github.com/giuliastro/opencode-remote-android) (Apache-2.0, active), [MobileCode](https://play.google.com/store/apps/details?id=io.apuyou.mobilecode) (Play Store), plus tunnel guides and Discord bridges.
- **The gap our build targets:** the opencode clients we surveyed don't offer push notifications or approve-from-phone (verified in depth for opencode-remote-android: completion sound only, no approval UI) — the "buzz in pocket → approve from couch" loop. That loop (notifier + approval UI) is exactly what this design builds, and it is the authentic differentiator if VanGio productizes later (e.g. a future zero-config `vangio remote` QR-code flow).

## 4. Architecture

Five pieces; only the notifier is new code.

```
      PHONE (Android)                         LAPTOP (Windows — lid CLOSED, plugged in)
┌──────────────────────┐                 ┌─────────────────────────────────────────┐
│ Chrome / home-screen │   Tailscale     │  VanGio server  (exists)                │
│ shortcut running the │◄───private─────►│    ├─ HTTP API + live event stream      │
│ VanGio web app       │    network      │    └─ sessions keep running headless    │
│ (packages/app as-is) │                 │                                         │
│                      │                 │  Notifier  ★ NEW — a VanGio plugin ★    │
│ ntfy app (free)      │◄───internet─────│    watches session events, POSTs to     │
│ receives the buzz    │                 │    a private ntfy topic                 │
└──────────────────────┘                 └─────────────────────────────────────────┘
```

- **VanGio server** (`packages/opencode/src/server/server.ts`): already an HTTP + WebSocket server; the TUI is just one client. Binds `127.0.0.1` only.
- **Web app** (`packages/app`): already a server client with live event streaming and real mobile layout branches (`layout.mobileSidebar`, bottom-drawer nav). Serving method on the laptop: to verify (see §9).
- **Tailscale**: phone↔laptop reachability from anywhere; `tailscale serve` proxies the local port onto the tailnet with real HTTPS certs (required by Android Chrome for proper home-screen-app behavior).
- **ntfy** (ntfy.sh, free): push delivery. Laptop POSTs one HTTP request to a secret topic; the ntfy Android app notifies. No Firebase setup, no push infrastructure owned.
- **Notifier**: the one new component — detailed in §5.

## 5. The Notifier (the new code)

**Form:** a VanGio plugin (opencode plugin system, event hook on the server's internal bus — same pattern the ecosystem's `opencode-notify` desktop plugin uses). No second process; starts and dies with the server. Lives in the fork.

**Structure — two parts, one seam:**
- **Watcher**: subscribes to bus events, applies the rules below. Pure logic, unit-testable.
- **Transport**: interface with a single method `send(notification)`. V1 ships `NtfyTransport` (one HTTP POST). V2 (approach B) adds `WebPushTransport` beside it; the watcher does not change.

**Event → notification mapping (v1 = exactly these three):**

| Bus event (names verified at implementation, not assumed) | Notification | Priority |
|---|---|---|
| Permission requested | "⚠ Needs approval: `<tool summary>` — `<project>`" | Max (can bypass DND via ntfy settings) |
| Session idle (finished / awaiting user) | "✅ Done: `<session title>`" | Normal |
| Session error | "❌ Error in `<project>` session" | High |

**Anti-spam rules:**
- No "done" notification for sessions that ran < 30 s (configurable threshold).
- Identical events within 60 s collapse into one.

**Payload policy:** project name, session title, event type, and (for permission events only) a short tool summary like "run bun test". Never code, diffs, file contents, or prompts — ntfy free topics are protected only by the topic name being unguessable, so payloads are written assuming they could someday be read.

**Tap-through:** each notification carries a click URL (`https://<laptop-tailnet-name>/<session-path>`) that opens the web app directly on that session.

**Config (no UI in v1):** ntfy topic, click-through base URL, min-runtime threshold.

**Failure posture:** fire-and-forget — one retry on network failure, then log and drop. The notifier must never crash, block, or slow a session.

## 6. Setup (one-time)

**Laptop (~15 min, no code):**
1. Windows power settings: lid close → do nothing (on AC); no sleep on AC.
2. Install Tailscale, sign in → stable private name (e.g. `laptop.tail1234.ts.net`).
3. Server stays on `127.0.0.1`; `tailscale serve` exposes it to the tailnet over HTTPS.

**Phone:** install Tailscale (same account) + ntfy (subscribe to the topic); open the web app URL in Chrome; Add to Home Screen.

## 7. Security posture (v1, personal)

- No router ports opened; nothing listens on the LAN; only devices on the owner's tailnet can reach the server.
- HTTPS via Tailscale-issued certificates.
- ntfy topic = long random secret; payloads non-sensitive by policy (§5).
- Accepted for v1: anyone on the tailnet is trusted (it's one person's account). Real auth/accounts are a productization concern, out of scope.

## 8. Failure modes

| Failure | Behavior | Verdict |
|---|---|---|
| Tailscale drops | Web app unreachable, but ntfy buzzes still arrive (plain internet) — owner knows something needs attention. Tailscale auto-reconnects. | Acceptable |
| Android kills the Chrome tab | Harmless — state lives on the laptop; reopening resyncs. Web app reconnect logic verified on mobile as part of implementation. | Acceptable |
| Laptop force-sleeps (Windows update, battery) | Sessions pause silently; no buzz possible. | Accepted for v1; "heartbeat missing" warning is a v2 item |
| Notifier failure | Sessions unaffected (fire-and-forget); worst case a missed buzz. | Acceptable |

## 9. To verify at implementation start (assumptions are forbidden here)

1. How `packages/app` is served standalone on the laptop (existing serve command vs `vite build` + static serving).
2. Whether the web app's permission approve/deny UI fully works — if missing or broken, it becomes a build item in the plan.
3. Exact plugin event hook and event names on the bus (permission / idle / error).
4. Thumb-on-phone UX pass of the web app over Tailscale — catalogue what's unusable on a small screen (informs v2 scope too).

## 10. Testing

- **Unit:** watcher rules — event→notification mapping, 30 s threshold, dedupe window. Pure functions.
- **Integration:** fake ntfy HTTP endpoint; assert correct POSTs (payload policy included) for simulated bus events.
- **Acceptance (the ritual):** start a long task at the desk → close the lid → leave the room → phone buzzes for a permission → approve from the phone → session continues → "✅ Done" buzz → output verified correct. Passing this end-to-end = v1 shipped.

## 11. Out of scope for v1 (parked, not forgotten)

- Approach B: "VanGio Pocket" phone-first PWA with Web Push (planned v2; reuses watcher + transport seam).
- Starting sessions / switching projects / model & agent selection from the phone.
- Laptop heartbeat / "server went dark" detection.
- Zero-config `vangio remote` QR-code onboarding (productization differentiator).
- iPhone support, accounts/auth, hosted relay (productization).
