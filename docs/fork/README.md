# VanGio Fork Docs — Read This First

This folder holds instructions and context for the **VanGio fork** of opencode. It is separate from the upstream project's own docs (`packages/docs`, `specs/`, root `AGENTS.md`, `CONTRIBUTING.md`, etc.), which describe the *upstream opencode project*, not this fork's product direction.

## Precedence

If anything in this folder conflicts with upstream docs (`AGENTS.md`, `CONTRIBUTING.md`, `specs/`, `packages/docs`) on product direction, roadmap, branding, or fork-specific behavior — **the docs in this folder win**. Upstream docs still govern generic code style/build/release conventions for shared infrastructure unless a file here explicitly overrides them.

This folder is loaded into every session automatically via the `instructions` glob in `.opencode/opencode.jsonc` (`docs/fork/**/*.md`), so treat every file here as active, current instructions — not archived notes.

## Index

Read in this order at the start of a session:

1. `OVERVIEW.md` — start-here summary: project overview, tech stack, build order, "what not to do", first-steps checklist. (Renamed from `CLAUDE.md` — this is NOT opencode's loaded root instruction file, that's `/AGENTS.md`.)
2. `build-progress.md` — live checklist of what's actually done vs pending. Read this every session; it's the current-state source of truth.
3. `errors.md` — append-only error log + known-risk watchlist. Check before repeating a diagnosis.
4. `BRD.md` — business requirements: goals, constraints, model/provider strategy, differentiation, pre-launch blockers.
5. `PRD.md` — product requirements: MoSCoW priorities, user stories, out-of-scope.
6. `SDD.md` — system design: architecture, provider contract, data flows, error taxonomy.
7. `CONFIG.md` — the actual `opencode.json` config shape and provider setup.

## Source of truth when docs disagree

`build-progress.md` and `errors.md` reflect what has actually happened and are updated continuously — trust them over BRD/PRD/SDD/CONFIG for **current state**. BRD/PRD/SDD/CONFIG describe **intended** design and are kept in sync manually; if one contradicts `build-progress.md`, the plan doc is stale — flag it, don't silently follow it.

## Session continuity

At the start of a session, skim this index and any file whose topic is relevant to the current task before touching code. When a decision here becomes stale, update the file in the same change — don't leave contradicting instructions active.
