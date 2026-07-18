---
name: release
description: Full release pipeline — release notes, black-box validation agent, triage/fix loop, tests, version bump, merge dev→master. Use when the user asks for a release or to run the release process.
---

# Release pipeline

Run each phase in order. Do not skip phases. Do not merge to master before phase 5's explicit user approval.

## Phase 1 — Release notes (main session, no agent)

1. `git fetch origin` and confirm `dev` is pushed and the working tree is clean. If dirty, stop and ask.
2. `git log master..dev --oneline` and, where a commit message is unclear, inspect its diff.
3. Write release notes grouped as **Features**, **Fixes**, **Design/UX changes** — user-visible behavior only, not internals. Save to the scratchpad; you'll show them in phase 5.

## Phase 2 — Validator subagent (black-box)

Spawn ONE `general-purpose` agent (`run_in_background: false`). Its prompt must contain the full release notes plus these instructions verbatim:

> You are a black-box release validator for a PWA at http://localhost:8000 (start the dev server yourself: `python -m http.server 8000` in T:\programming\claude\DateAnalyze, run in background). **Never read source code** — you judge only what the running app does. Use the Browser pane tools (preview_start with the URL, read_page, computer, form_input, screenshots).
>
> Setup: open the app, then use the ⋯ menu → "Add sample dates" so charts and history have data.
>
> For every item in the release notes: exercise it in the UI. Verify each bug fix no longer reproduces and each feature works, including obvious adjacent flows it could have broken (log a date, browse history, open insights, get suggestions).
>
> Design pass: capture screenshots of each main view (Log, History, Insights, Suggest) in light AND dark mode (resize_window colorScheme), save them to the scratchpad, and list the file paths in your report. Do NOT judge the design yourself — a separate critic does that.
>
> Return ONLY a list of rejects in this exact format (empty list = pass):
> - id: R1, R2, …
> - category: bug-not-fixed | feature-broken | regression | design
> - severity guess: high | medium | low
> - repro steps / description (design items: which views and what feels off)
> Do not suggest code fixes. Do not pass items that "mostly work".

### Design pass (taste-critic)

After the validator returns, capture the FULL view catalog — including interaction states (log sheet, partner match, active date night, etc.) that the validator's resting-tab screenshots miss — with `node design/capture.mjs http://localhost:8000` (writes to `design/shots/`; the validator's server is still running). Then spawn the `taste-critic` agent (`.claude/agents/taste-critic.md`, `run_in_background: false`) with all `design/shots/*.png` paths plus the validator's dark-mode screenshots, and one sentence: "shipped-app views for release validation". Convert each of its change requests into a reject (`category: design`) and merge into the validator's list for triage. Afterwards `git checkout -- design/shots` unless the catalog shots are meant to change this release.

## Phase 3 — Triage (main session)

For each reject, investigate the code yourself and classify:

- **not-real** — validator misunderstanding or works-as-intended. Record the reasoning.
- **postpone** — real but not release-blocking. Append to `ROADMAP.md` under a `## Release triage backlog` section (create it above "Explicitly NOT doing" if missing): one bullet per item with priority (high/medium/low), description, and the release version it was found in.
- **blocker** — fix it now. Follow normal project rules (design-mock rule applies only if the fix changes UI beyond restoring intended behavior).

After fixing blockers, `SendMessage` the SAME validator agent listing only the fixed reject ids to re-verify. **Max 2 fix→revalidate rounds.** If anything is still broken after round 2, stop and report to the user instead of looping.

## Phase 4 — Tests

```
node --test test/logic.test.mjs
node test/smoke.mjs   # needs the dev server running
```

Both must pass. If a change touched `sync.js`, `store.js`, or `firestore.rules`, also run `node test/sync.mjs` with the Firebase emulators (see CLAUDE.md).

## Phase 5 — User approval gate

Show the user: the release notes, the triage summary (each reject and its classification), and the proposed semver bump (major = redesign/data-model change, minor = new feature, patch = fixes only). **Wait for an explicit yes before continuing.**

## Phase 6 — Ship

1. On `dev`: bump `CACHE` in `sw.js` to the approved version; commit (include any triage fixes + ROADMAP.md updates) and push `dev`.
2. Merge `dev` into `master` (fast-forward is fine — the version was hand-bumped), push `master`.
3. Confirm both pushes succeeded and report the released version.
